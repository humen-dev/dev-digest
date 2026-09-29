import type { BlastRadiusResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { MAX_INDIRECT_FILES_PER_SYMBOL, MAX_INDIRECT_FRONTIER } from './constants.js';
import { buildBlastLogRecord, resolveBlastSource, type BlastLogInput } from './domain/blast-log.js';
import { buildBlastRadius } from './domain/build-blast-radius.js';
import { resolveDegradation } from './domain/degradation.js';
import { attributeIndirect } from './domain/indirect-impact.js';
import type { BlastDeps, BlastImportEdge, BlastLogger } from './ports.js';

type LogArgs = Pick<BlastLogInput, 'source' | 'index' | 'changedFiles' | 'edgeQueries' | 'response'>;

/**
 * Blast radius service — reads the repo-intel index through a narrow port and
 * maps it into the API contract. Read-only; never calls a model.
 */
export class BlastService {
  constructor(private readonly deps: BlastDeps) {}

  /** Throws NotFoundError when the PR is not in the workspace. */
  async get(workspaceId: string, prId: string, ctx: { logger?: BlastLogger } = {}): Promise<BlastRadiusResponse> {
    const now = this.deps.now ?? Date.now;
    const startedAt = now();
    const pull = await this.deps.blast.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.deps.blast.listChangedFiles(prId);
    const opts = { maxCallersPerSymbol: this.deps.maxCallersPerSymbol, bfsDepth: this.deps.bfsDepth };
    const log = (args: LogArgs): void => {
      const { record, level, message } = buildBlastLogRecord({
        ...args,
        prId,
        repoId: pull.repoId,
        bfsDepth: opts.bfsDepth,
        maxCallersPerSymbol: opts.maxCallersPerSymbol,
        durationMs: now() - startedAt,
      });
      ctx.logger?.[level](record, message);
    };

    if (files.length === 0) {
      // Nothing changed → nothing to look up; avoids a misleading `no_data` + resync hint.
      const empty = buildBlastRadius(
        { changedSymbols: [], callers: [], impactedEndpoints: [] },
        { ...opts, degraded: false, reason: null },
      );
      log({ source: 'skipped_no_files', index: null, changedFiles: 0, edgeQueries: 0, response: empty });
      return empty;
    }

    const [blast, indexState] = await Promise.all([
      this.deps.intel.getBlastRadius(pull.repoId, files),
      this.deps.intel.getIndexState(pull.repoId),
    ]);
    const { degraded, reason } = resolveDegradation(blast, indexState, this.deps.repoIntelEnabled);
    let response = buildBlastRadius(blast, { ...opts, degraded, reason });

    const source = resolveBlastSource(files.length, blast);
    let edgeQueries = 0;
    if (source === 'persistent_index' && opts.bfsDepth >= 2 && response.downstream.length > 0) {
      const walked = await this.walkImporters(pull.repoId, response, opts.bfsDepth);
      edgeQueries = walked.edgeQueries;
      const facts = await this.deps.blast.getFileFacts(pull.repoId, walked.reached);
      response = {
        ...response,
        ...attributeIndirect(response, walked.edges, facts, {
          bfsDepth: opts.bfsDepth,
          changedFiles: files,
          maxFilesPerSymbol: MAX_INDIRECT_FILES_PER_SYMBOL,
        }),
      };
    }

    log({
      source,
      index: {
        status: indexState.status,
        indexerVersion: indexState.indexerVersion ?? null,
        lastIndexedSha: indexState.lastIndexedSha ?? null,
      },
      changedFiles: files.length,
      edgeQueries,
      response,
    });
    return response;
  }

  /** Level loop over reverse `file_edges`: one query per hop 2..bfsDepth, capped by MAX_INDIRECT_FRONTIER. */
  private async walkImporters(
    repoId: string,
    response: BlastRadiusResponse,
    bfsDepth: number,
  ): Promise<{ edges: BlastImportEdge[]; reached: string[]; edgeQueries: number }> {
    const seen = new Set(response.downstream.flatMap((d) => d.callers.map((c) => c.file)));
    let frontier = [...seen];
    const edges: BlastImportEdge[] = [];
    const reached: string[] = [];
    let edgeQueries = 0;
    for (let depth = 2; depth <= bfsDepth && frontier.length > 0 && reached.length < MAX_INDIRECT_FRONTIER; depth++) {
      const found = await this.deps.blast.listImporters(repoId, frontier);
      edgeQueries++;
      const next: string[] = [];
      for (const e of found) {
        if (!seen.has(e.fromFile) && reached.length < MAX_INDIRECT_FRONTIER) {
          seen.add(e.fromFile);
          next.push(e.fromFile);
          reached.push(e.fromFile);
        }
        // Keep only edges into files we admitted: an edge past the cap would let
        // attribution list a file whose facts were never fetched.
        if (seen.has(e.fromFile)) edges.push(e);
      }
      frontier = next;
    }
    return { edges, reached, edgeQueries };
  }
}
