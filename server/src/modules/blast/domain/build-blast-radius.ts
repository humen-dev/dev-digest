import type { BlastRadiusResponse } from '@devdigest/shared';
import type { BlastCallerRow, BlastResult } from '../../repo-intel/types.js';
import type { BuildBlastOptions } from '../types.js';
import { attributeFacts } from './handler-attribution.js';
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
  const callerFacts = new Map<string, { name: string; file: string; endpoints: Set<string>; crons: Set<string> }>();
  const reachable = new Set<string>();
  const withCallers = new Set<string>();
  const built = [...groups.entries()].map(([symbol, rows]) => {
    for (const r of rows) {
      const fx = facts?.[r.file];
      if (!fx) continue;
      withCallers.add(r.file);
      for (const e of attributeFacts(fx.endpoints, fx.endpointHandlers, symbol, r)) reachable.add(e);
    }
    const seen = new Set<string>();
    const kept: BlastCallerRow[] = [];
    for (const r of [...rows].sort(byRankThenPlace)) {
      const key = `${r.file}|${r.symbol}|${r.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(r);
      if (kept.length >= opts.maxCallersPerSymbol) break;
    }
    const endpoints: string[] = [];
    const crons: string[] = [];
    for (const r of kept) {
      const fx = facts?.[r.file];
      if (!fx) continue;
      const eps = attributeFacts(fx.endpoints, fx.endpointHandlers, symbol, r);
      const crs = attributeFacts(fx.crons, fx.cronHandlers, symbol, r);
      endpoints.push(...eps);
      crons.push(...crs);
      const key = `${r.file}\u0000${r.symbol}`;
      const entry = callerFacts.get(key) ?? { name: r.symbol, file: r.file, endpoints: new Set<string>(), crons: new Set<string>() };
      for (const e of eps) entry.endpoints.add(e);
      for (const c of crs) entry.crons.add(c);
      callerFacts.set(key, entry);
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
  // Refuted: handler attribution ruled E out for every caller row of every file that holds it.
  // `reachable` / `withCallers` are computed over ALL caller rows before the per-symbol cap, so an
  // endpoint reachable only through a capped row is still in `reachable` and stays unattributed.
  const refuted = (e: string): boolean => {
    if (!facts || reachable.has(e)) return false;
    const holders = Object.entries(facts).filter(([, fx]) => fx.endpoints.includes(e));
    return holders.length > 0 && holders.every(([f]) => withCallers.has(f));
  };
  const unattributed = sortedUnique(source.impactedEndpoints).filter((e) => !attributed.has(e) && !refuted(e));

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

  const callerFactsOut = facts
    ? [...callerFacts.values()]
        .sort((a, b) => cmp(a.file, b.file) || cmp(a.name, b.name))
        .map((c) => ({ name: c.name, file: c.file, endpoints: sortedUnique(c.endpoints), crons: sortedUnique(c.crons) }))
    : undefined;

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
    ...(callerFactsOut ? { caller_facts: callerFactsOut } : {}),
  };
}
