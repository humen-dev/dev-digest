// src/format/blast.ts — ring 1: pure formatter. Imports only domain/types.ts + format/*.
import type { ApiBlastRadius, BlastRadiusResult } from '../domain/types.js';
import { clip } from './text.js';

const MAX_CHANGED_SYMBOLS = 50;
const MAX_DOWNSTREAM = 50;
const MAX_PER_SYMBOL = 20;
const MAX_OTHER_ENDPOINTS = 50;
const CLIP = 200;

const FLAG_OFF_NEXT = 'Set REPO_INTEL_ENABLED=true for the DevDigest API and restart it, then call again.';
const RESYNC_NEXT =
  'Ask the user to resync the repo index in the DevDigest web UI (PR → Overview → Blast radius → Resync index), then call again.';

function degradedNote(reason: string | null): string {
  const why = reason ? clip(reason, 40) : 'unknown';
  return `The repo index is incomplete (${why}); callers, endpoints and cron jobs may be missing.`;
}

/** Keeps at most `max` items; records a "Showing n of m <what>." line when it cuts. */
function capped<T>(list: readonly T[], max: number, what: string, cuts: string[]): T[] {
  if (list.length <= max) return [...list];
  cuts.push(`Showing ${max} of ${list.length} ${what}.`);
  return list.slice(0, max);
}

/** Formats the API's blast-radius map into the compact result the agent receives.
 *  Every list is bounded so a huge PR cannot flood the calling agent's context. */
export function formatBlastRadius(api: ApiBlastRadius, o: { repo: string; pr: number }): BlastRadiusResult {
  const cuts: string[] = [];
  const shownSymbols = capped(api.changed_symbols, MAX_CHANGED_SYMBOLS, 'changed symbols', cuts);
  const downstream = capped(api.downstream, MAX_DOWNSTREAM, 'symbols with callers', cuts).map((d) => {
    const sym = clip(d.symbol, CLIP);
    return {
      symbol: sym,
      callers: capped(d.callers, MAX_PER_SYMBOL, `callers of ${sym}`, cuts).map(
        (c) => `${clip(c.name, CLIP)} @ ${clip(c.file, CLIP)}:${c.line}`,
      ),
      endpoints: capped(d.endpoints_affected, MAX_PER_SYMBOL, `endpoints of ${sym}`, cuts).map((e) => clip(e, CLIP)),
      crons: capped(d.crons_affected, MAX_PER_SYMBOL, `cron jobs of ${sym}`, cuts).map((e) => clip(e, CLIP)),
    };
  });
  const otherEndpoints = capped(api.unattributed_endpoints, MAX_OTHER_ENDPOINTS, 'other endpoints', cuts).map((e) =>
    clip(e, CLIP),
  );
  const truncated = cuts.length > 0 ? cuts.join(' ') : undefined;

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
    downstream,
    ...(otherEndpoints.length > 0 ? { other_endpoints: otherEndpoints } : {}),
    ...(note ? { note } : {}),
    ...(truncated ? { truncated } : {}),
    ...(next ? { next } : {}),
  };
}
