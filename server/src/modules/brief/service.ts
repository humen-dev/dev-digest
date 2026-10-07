import { ZodError } from 'zod';
import type {
  BlastRadiusResponse,
  BriefContextCandidates,
  BriefContextDoc,
  BriefPage,
  BriefStatus,
  GenerateBriefBody,
  PrBriefRecord,
  SmartDiffRole,
  StructuredResult,
} from '@devdigest/shared';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import {
  BRIEF_DRAFT_SCHEMA_NAME,
  MAX_OUTPUT_TOKENS,
  MIN_ATTEMPT_TIMEOUT_MS,
  PROMPT_TOKEN_BUDGET,
  STRUCTURED_MAX_RETRIES,
} from './constants.js';
import { fitToBudget } from './domain/budget.js';
import { rankContextCandidates } from './domain/context-docs.js';
import { buildBriefInput, type BriefRawFacts, type BriefRawIssue } from './domain/facts.js';
import { groundBrief } from './domain/grounding.js';
import { parseHunkRanges } from './domain/hunks.js';
import { findLinkedIssue } from './domain/issue-ref.js';
import { buildBriefLogRecord } from './domain/log.js';
import { buildPage, outcomePage, parseStoredRecord } from './domain/page.js';
import { buildBriefMessages } from './domain/prompt.js';
import type { BriefDeps, BriefDocRead, BriefPrFile, BriefPull, OpsLogger } from './ports.js';
import { BriefDraft, type HunkRange } from './types.js';

type FailReason = 'timeout' | 'llm_error' | 'invalid_output' | 'store_failed';

class DeadlineError extends Error {
  constructor() {
    super('brief generation deadline reached');
    this.name = 'DeadlineError';
  }
}

/** Rejects with `DeadlineError` after `ms`; the loser keeps running, so its late settlement is swallowed. */
async function raceDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError()), Math.max(0, ms));
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    work.catch(() => {});
  }
}

/** Per-run counters feeding the single `brief.generate` log line (NFR-4). */
interface RunStats {
  attempts: number | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  inputTokens: number | null;
  dropped: Record<string, number>;
  grounding: { refs: number; risks: number; focus: number };
}

function isInvalidOutput(err: unknown): boolean {
  if (err instanceof ZodError) return true;
  if (err instanceof AppError) {
    const d = err.details;
    if (d !== null && typeof d === 'object' && 'raw' in d) return true;
  }
  return err instanceof Error && /schema validation|invalid (json|output)/i.test(err.message);
}

/**
 * PR Brief service (SPEC-04). Reads never call a model or GitHub; one
 * generation is a single-flight, single-structured-call pipeline whose work is
 * NOT tied to the request socket (EC-22): the awaited chain keeps running and
 * stores its result even when the caller abandons the promise.
 */
export class BriefService {
  /** One generation per PR; the value is that run's token (a late run must not store). */
  private readonly inFlight = new Map<string, object>();

  constructor(private readonly deps: BriefDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private async requirePull(workspaceId: string, prId: string): Promise<BriefPull> {
    const pull = await this.deps.briefs.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  private async readStored(prId: string): Promise<PrBriefRecord | null> {
    return parseStoredRecord(await this.deps.briefs.getStored(prId));
  }

  /** Never calls a model or GitHub (NFR-6). */
  async getPage(workspaceId: string, prId: string): Promise<BriefPage> {
    const pull = await this.requirePull(workspaceId, prId);
    const record = await this.readStored(prId);
    return buildPage({ record, headSha: pull.headSha, generating: this.inFlight.has(prId) });
  }

  async candidates(workspaceId: string, prId: string): Promise<BriefContextCandidates> {
    const pull = await this.requirePull(workspaceId, prId);
    const [files, attached, listing] = await Promise.all([
      this.deps.briefs.listPrFiles(prId),
      this.deps.contextDocs.attachedPaths(workspaceId),
      this.deps.contextDocs.listProjectDocs(workspaceId, pull.repoId),
    ]);
    const candidates = rankContextCandidates({
      attached,
      projectDocs: listing.documents,
      changedPaths: files.map((f) => f.path),
      prTitle: pull.title,
      prBody: pull.body,
    });
    return { cloned: listing.cloned, candidates };
  }

  async generate(
    workspaceId: string,
    prId: string,
    body: GenerateBriefBody,
    log?: OpsLogger,
  ): Promise<BriefPage> {
    // 1. 404 check.
    const pull = await this.requirePull(workspaceId, prId);
    const stored = await this.readStored(prId);

    // 2. A generation is already running: report it, never start a second (EC-7).
    if (this.inFlight.has(prId)) {
      return buildPage({ record: stored, headSha: pull.headSha, generating: true });
    }
    // 3. A current brief is free unless a regeneration was asked for (AC-8).
    if (!body.regenerate && stored && stored.provenance.head_sha === pull.headSha) {
      return buildPage({ record: stored, headSha: pull.headSha, generating: false });
    }

    const startedAt = this.now();
    const stats: RunStats = {
      attempts: null,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: null,
      inputTokens: null,
      dropped: {},
      grounding: { refs: 0, risks: 0, focus: 0 },
    };
    let logged = false;
    const emit = (status: BriefStatus, reason: string | null): void => {
      if (logged) return;
      logged = true;
      const record = buildBriefLogRecord({
        prId,
        status,
        reason,
        ...stats,
        durationMs: Math.max(0, Math.round(this.now() - startedAt)),
      });
      if (status === 'failed') log?.warn(record, 'brief generation failed');
      else log?.info(record, 'brief generated');
    };

    try {
      const page = await this.run(workspaceId, pull, stored, body, stats, startedAt);
      emit(page.status, page.reason);
      return page;
    } catch (err) {
      emit('failed', err instanceof AppError ? err.code : 'internal_error');
      throw err;
    }
  }

  /** Steps 4-12. Throws only `AppError` (422) and unexpected infrastructure errors. */
  private async run(
    workspaceId: string,
    pull: BriefPull,
    stored: PrBriefRecord | null,
    body: GenerateBriefBody,
    stats: RunStats,
    startedAt: number,
  ): Promise<BriefPage> {
    const prId = pull.id;
    const fail = (reason: FailReason): BriefPage => outcomePage('failed', reason, stored, pull.headSha);

    // 4. Nothing to describe.
    const files = await this.deps.briefs.listPrFiles(prId);
    if (files.length === 0) return outcomePage('refused', 'no_changed_files', stored, pull.headSha);

    // 5. Resolve the model; a missing key is a configuration problem, not a failure.
    const choice = await this.deps.resolveModel(workspaceId);
    const llm = await this.deps.llm(choice.provider).catch((err: unknown) => {
      if (err instanceof ConfigError) {
        throw new AppError(
          'model_not_configured',
          `${err.message}. Add the key in Settings → API keys, or pick another model in Settings → Models → Risk Brief.`,
          422,
        );
      }
      throw err;
    });

    // 6. Single-flight token (checked + set synchronously), deadline and start SHA.
    if (this.inFlight.has(prId)) {
      return buildPage({ record: stored, headSha: pull.headSha, generating: true });
    }
    const token = {};
    this.inFlight.set(prId, token);
    const startSha = pull.headSha;
    const deadline = startedAt + this.deps.deadlineMs;
    const remaining = (): number => deadline - this.now();

    try {
      // 7. Gather facts in parallel; every source degrades on its own.
      const [blast, roles, issue, docs] = await Promise.all([
        this.gatherBlast(workspaceId, prId),
        this.gatherRoles(workspaceId, prId),
        this.gatherIssue(pull, remaining),
        this.gatherDocs(workspaceId, pull, files, body),
      ]);

      const hunksByPath = new Map<string, HunkRange[]>(files.map((f) => [f.path, parseHunkRanges(f.patch)]));
      const raw: BriefRawFacts = {
        pull: { title: pull.title, body: pull.body },
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          hunks: hunksByPath.get(f.path) ?? [],
        })),
        roles,
        intent: await this.deps.briefs.getIntent(prId),
        currentHeadSha: startSha,
        blast,
        issue,
        docs,
      };
      const { input, missing } = buildBriefInput(raw);

      // 8. Fit the prompt into the token budget; refuse (no call) when it cannot.
      const system = await this.deps.loadSystemPrompt();
      const count = (i: typeof input): number =>
        this.deps.tokenizer.count(
          buildBriefMessages(system, i)
            .map((m) => m.content)
            .join('\n'),
        );
      const fitted = fitToBudget(input, count, PROMPT_TOKEN_BUDGET);
      stats.inputTokens = fitted.tokens;
      for (const d of fitted.dropped) stats.dropped[d.kind] = (stats.dropped[d.kind] ?? 0) + 1;
      if (!fitted.fits) return outcomePage('refused', 'over_budget', stored, pull.headSha);

      // 9. One structured call; the REMAINING budget is its timeout (INSIGHTS 2026-10-07).
      let result: StructuredResult<BriefDraft>;
      try {
        result = await raceDeadline(
          llm.completeStructured({
            model: choice.model,
            schema: BriefDraft,
            schemaName: BRIEF_DRAFT_SCHEMA_NAME,
            messages: buildBriefMessages(system, fitted.input),
            maxTokens: MAX_OUTPUT_TOKENS,
            maxRetries: STRUCTURED_MAX_RETRIES,
            timeoutMs: Math.max(MIN_ATTEMPT_TIMEOUT_MS, remaining()),
          }),
          remaining(),
        );
      } catch (err) {
        if (err instanceof DeadlineError || remaining() <= 0) return fail('timeout');
        return fail(isInvalidOutput(err) ? 'invalid_output' : 'llm_error');
      }
      stats.attempts = result.attempts;
      stats.tokensIn = result.tokensIn;
      stats.tokensOut = result.tokensOut;
      stats.costUsd = result.apiCostUsd;

      // 10. Keep only what the PR (or its blast radius) can back up.
      const changedPaths = new Set(files.map((f) => f.path));
      const groundingSet = new Set(changedPaths);
      if (blast !== 'unavailable') {
        for (const d of blast.downstream) for (const c of d.callers) groundingSet.add(c.file);
      }
      const grounded = groundBrief(result.data, { changedPaths, groundingSet, hunksByPath });
      stats.grounding = grounded.drops;

      // 11. Store under the START sha, unless the deadline passed or another run took over.
      const record: PrBriefRecord = {
        brief: grounded.brief,
        provenance: {
          head_sha: startSha,
          generated_at: new Date(this.now()).toISOString(),
          provider: choice.provider,
          model: result.model || choice.model,
          attempts: result.attempts,
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
          cost_usd: result.apiCostUsd, // real provider cost only, never an estimate
          context_docs: docs.map(
            (d): BriefContextDoc => ({ path: d.path, status: d.status, tokens: d.tokens }),
          ),
          dropped_inputs: fitted.dropped,
          missing_sources: missing,
        },
      };
      if (remaining() <= 0 || this.inFlight.get(prId) !== token) return fail('timeout');
      try {
        await this.deps.briefs.upsert(prId, record);
      } catch {
        return fail('store_failed');
      }

      // 12. The head may have moved while we worked: the page reports it as outdated (EC-19).
      const current = await this.deps.briefs.getPull(workspaceId, prId);
      return buildPage({ record, headSha: current?.headSha ?? startSha, generating: false });
    } finally {
      if (this.inFlight.get(prId) === token) this.inFlight.delete(prId);
    }
  }

  private async gatherBlast(workspaceId: string, prId: string): Promise<BlastRadiusResponse | 'unavailable'> {
    try {
      return await this.deps.blast(workspaceId, prId);
    } catch {
      return 'unavailable';
    }
  }

  private async gatherRoles(workspaceId: string, prId: string): Promise<Map<string, SmartDiffRole>> {
    const roles = new Map<string, SmartDiffRole>();
    try {
      const diff = await this.deps.smartDiff(workspaceId, prId);
      for (const g of diff.groups) for (const f of g.files) roles.set(f.path, g.role);
    } catch {
      /* roles stay null */
    }
    return roles;
  }

  private async gatherIssue(pull: BriefPull, remaining: () => number): Promise<BriefRawIssue> {
    const number = findLinkedIssue(pull.title, pull.body);
    if (number === null) return { state: 'none' };
    try {
      const github = await this.deps.github();
      const issue = await raceDeadline(github.getIssue({ owner: pull.repo.owner, name: pull.repo.name }, number), remaining());
      return { state: 'ok', number, title: issue.title, body: issue.body };
    } catch {
      return { state: 'unresolved' };
    }
  }

  /** Explicit `context_paths` in the given order, else the preselected candidates (AC-34, AC-35). */
  private async gatherDocs(
    workspaceId: string,
    pull: BriefPull,
    files: BriefPrFile[],
    body: GenerateBriefBody,
  ): Promise<BriefDocRead[]> {
    let paths: string[];
    if (body.context_paths) {
      paths = [...new Set(body.context_paths)];
    } else {
      const [attached, listing] = await Promise.all([
        this.deps.contextDocs.attachedPaths(workspaceId),
        this.deps.contextDocs.listProjectDocs(workspaceId, pull.repoId),
      ]);
      paths = rankContextCandidates({
        attached,
        projectDocs: listing.documents,
        changedPaths: files.map((f) => f.path),
        prTitle: pull.title,
        prBody: pull.body,
      })
        .filter((c) => c.preselected)
        .map((c) => c.path);
    }
    if (paths.length === 0) return [];
    return this.deps.contextDocs.readDocs(pull.repo.clonePath, paths);
  }
}
