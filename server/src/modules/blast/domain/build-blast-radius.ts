import type { BlastRadiusResponse } from '@devdigest/shared';
import type { BlastCallerRow, BlastResult } from '../../repo-intel/types.js';
import type { BuildBlastOptions } from '../types.js';
import { formatBlastSummary } from './summary.js';

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (xs: Iterable<string>): string[] => [...new Set(xs)].sort(cmp);

const byRankThenPlace = (a: BlastCallerRow, b: BlastCallerRow): number =>
  b.rank - a.rank || cmp(a.file, b.file) || a.line - b.line;

/**
 * Pure mapper BlastResult → BlastRadiusResponse (docs/plans/blast-radius.md §3.2).
 * No I/O, no clock.
 */
export function buildBlastRadius(source: BlastResult, opts: BuildBlastOptions): BlastRadiusResponse {
  const declares = new Set(source.changedSymbols.map((s) => `${s.file}\u0000${s.name}`));

  const groups = new Map<string, BlastCallerRow[]>();
  for (const c of source.callers) {
    if (declares.has(`${c.file}\u0000${c.viaSymbol}`)) continue;
    const list = groups.get(c.viaSymbol) ?? [];
    list.push(c);
    groups.set(c.viaSymbol, list);
  }

  const facts = source.factsByFile;
  const built = [...groups.entries()].map(([symbol, rows]) => {
    const seen = new Set<string>();
    const kept: BlastCallerRow[] = [];
    for (const r of [...rows].sort(byRankThenPlace)) {
      const key = `${r.file}|${r.symbol}|${r.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(r);
      if (kept.length >= opts.maxCallersPerSymbol) break;
    }
    const files = new Set(kept.map((r) => r.file));
    const endpoints: string[] = [];
    const crons: string[] = [];
    for (const f of files) {
      endpoints.push(...(facts?.[f]?.endpoints ?? []));
      crons.push(...(facts?.[f]?.crons ?? []));
    }
    return {
      topRank: kept[0]?.rank ?? 0,
      impact: {
        symbol,
        callers: kept.map((r) => ({ name: r.symbol, file: r.file, line: r.line })),
        endpoints_affected: sortedUnique(endpoints),
        crons_affected: sortedUnique(crons),
      },
    };
  });

  built.sort(
    (a, b) =>
      b.topRank - a.topRank ||
      b.impact.callers.length - a.impact.callers.length ||
      cmp(a.impact.symbol, b.impact.symbol),
  );
  const downstream = built.filter((g) => g.impact.callers.length > 0).map((g) => g.impact);

  const attributed = new Set(downstream.flatMap((d) => d.endpoints_affected));
  const unattributed = sortedUnique(source.impactedEndpoints).filter((e) => !attributed.has(e));

  const stats = {
    symbols: source.changedSymbols.length,
    callers: downstream.reduce((n, d) => n + d.callers.length, 0),
    endpoints: new Set([...attributed, ...unattributed]).size,
    crons: new Set(downstream.flatMap((d) => d.crons_affected)).size,
  };

  const keptFiles = new Set(downstream.flatMap((d) => d.callers.map((c) => c.file)));
  const callerFileFacts: Record<string, { endpoints: string[]; crons: string[] }> = {};
  for (const f of [...keptFiles].sort(cmp)) {
    const fx = facts?.[f];
    if (fx) callerFileFacts[f] = { endpoints: [...fx.endpoints], crons: [...fx.crons] };
  }

  return {
    changed_symbols: source.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream,
    summary: formatBlastSummary(stats, opts.reason),
    stats,
    unattributed_endpoints: unattributed,
    degraded: opts.degraded,
    reason: opts.reason,
    limits: { max_callers_per_symbol: opts.maxCallersPerSymbol, bfs_depth: opts.bfsDepth },
    indirect: [],
    indirect_stats: { files: 0, endpoints: 0, crons: 0 },
    caller_file_facts: callerFileFacts,
  };
}
