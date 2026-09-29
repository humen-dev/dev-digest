// src/format/blast.ts — ring 1: pure formatter. Imports only domain/types.ts + format/*.
import type { ApiBlastRadius, BlastRadiusResult } from '../domain/types.js';
import { clip } from './text.js';

const MAX_CHANGED_SYMBOLS = 50;
const CLIP = 200;

const FLAG_OFF_NEXT = 'Set REPO_INTEL_ENABLED=true for the DevDigest API and restart it, then call again.';
const RESYNC_NEXT =
  'Ask the user to resync the repo index in the DevDigest web UI (PR → Overview → Blast radius → Resync index), then call again.';

function degradedNote(reason: string | null): string {
  const why = reason ? clip(reason, 40) : 'unknown';
  return `The repo index is incomplete (${why}); callers, endpoints and cron jobs may be missing.`;
}

/** Formats the API's blast-radius map into the compact result the agent receives. */
export function formatBlastRadius(api: ApiBlastRadius, o: { repo: string; pr: number }): BlastRadiusResult {
  const shownSymbols = api.changed_symbols.slice(0, MAX_CHANGED_SYMBOLS);
  const truncated = api.changed_symbols.length > shownSymbols.length
    ? `Showing ${shownSymbols.length} of ${api.changed_symbols.length} changed symbols.`
    : undefined;

  let note: string | undefined;
  if (api.degraded) {
    note = degradedNote(api.reason);
  } else if (api.stats.callers === 0) {
    note = `No downstream callers found for ${api.stats.symbols} changed symbols.`;
  }
  const next = api.degraded ? (api.reason === 'flag_off' ? FLAG_OFF_NEXT : RESYNC_NEXT) : undefined;

  return {
    repo: o.repo,
    pr: o.pr,
    summary: clip(api.summary, 300),
    stats: { ...api.stats },
    degraded: api.degraded,
    reason: api.reason === null ? null : clip(api.reason, 40),
    changed_symbols: shownSymbols.map((s) => `${clip(s.name, CLIP)} (${clip(s.file, CLIP)})`),
    downstream: api.downstream.map((d) => ({
      symbol: clip(d.symbol, CLIP),
      callers: d.callers.map((c) => `${clip(c.name, CLIP)} @ ${clip(c.file, CLIP)}:${c.line}`),
      endpoints: d.endpoints_affected.map((e) => clip(e, CLIP)),
      crons: d.crons_affected.map((e) => clip(e, CLIP)),
    })),
    ...(api.unattributed_endpoints.length > 0
      ? { other_endpoints: api.unattributed_endpoints.map((e) => clip(e, CLIP)) }
      : {}),
    ...(note ? { note } : {}),
    ...(truncated ? { truncated } : {}),
    ...(next ? { next } : {}),
  };
}
