import type { BlastRadiusResponse } from '@devdigest/shared';
import type { BlastResult } from '../../repo-intel/types.js';

export type BlastSource = 'persistent_index' | 'ripgrep_fallback' | 'skipped_no_files';

export interface BlastLogRecord {
  event: 'blast.served';
  prId: string;
  repoId: string;
  source: BlastSource;
  indexStatus: string | null;
  indexerVersion: number | null;
  lastIndexedSha: string | null;
  astParsed: false;
  graphBuilt: false;
  cloneScanned: boolean;
  changedFiles: number;
  edgeQueries: number;
  bfsDepth: number;
  maxCallersPerSymbol: number;
  counts: {
    symbols: number;
    callers: number;
    endpoints: number;
    crons: number;
    indirectFiles: number;
    indirectEndpoints: number;
    indirectCrons: number;
  };
  degraded: boolean;
  reason: string | null;
  durationMs: number;
}

export interface BlastLogInput {
  prId: string;
  repoId: string;
  source: BlastSource;
  index: { status: string; indexerVersion: number | null; lastIndexedSha: string | null } | null;
  changedFiles: number;
  edgeQueries: number;
  bfsDepth: number;
  maxCallersPerSymbol: number;
  response: BlastRadiusResponse;
  durationMs: number;
}

/** Which source produced the facade answer — the facade's own `degraded` tells the two paths apart. */
export function resolveBlastSource(fileCount: number, blast: Pick<BlastResult, 'degraded'> | null): BlastSource {
  if (fileCount === 0 || !blast) return 'skipped_no_files';
  return blast.degraded ? 'ripgrep_fallback' : 'persistent_index';
}

const MESSAGES: Record<BlastSource, string> = {
  persistent_index: 'blast radius served from persistent index (no AST parse, no graph build)',
  ripgrep_fallback: 'blast radius served via ripgrep fallback (index unavailable)',
  skipped_no_files: 'blast radius skipped: no changed files',
};

/** Pure: the single `blast.served` record (no paths, symbols or secrets). */
export function buildBlastLogRecord(input: BlastLogInput): {
  record: BlastLogRecord;
  level: 'info' | 'warn';
  message: string;
} {
  const r = input.response;
  const record: BlastLogRecord = {
    event: 'blast.served',
    prId: input.prId,
    repoId: input.repoId,
    source: input.source,
    indexStatus: input.index?.status ?? null,
    indexerVersion: input.index?.indexerVersion ?? null,
    lastIndexedSha: input.index?.lastIndexedSha ?? null,
    astParsed: false,
    graphBuilt: false,
    cloneScanned: input.source === 'ripgrep_fallback',
    changedFiles: input.changedFiles,
    edgeQueries: input.edgeQueries,
    bfsDepth: input.bfsDepth,
    maxCallersPerSymbol: input.maxCallersPerSymbol,
    counts: {
      symbols: r.stats.symbols,
      callers: r.stats.callers,
      endpoints: r.stats.endpoints,
      crons: r.stats.crons,
      indirectFiles: r.indirect_stats?.files ?? 0,
      indirectEndpoints: r.indirect_stats?.endpoints ?? 0,
      indirectCrons: r.indirect_stats?.crons ?? 0,
    },
    degraded: r.degraded,
    reason: r.reason,
    durationMs: input.durationMs,
  };
  return {
    record,
    level: input.source === 'ripgrep_fallback' ? 'warn' : 'info',
    message: MESSAGES[input.source],
  };
}
