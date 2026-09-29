import type { BlastIndirectImpact, BlastIndirectStats, BlastRadiusResponse } from '@devdigest/shared';
import type { BlastFileFactsRow, BlastImportEdge } from '../ports.js';

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (xs: Iterable<string>): string[] => [...new Set(xs)].sort(cmp);

export interface IndirectOptions {
  bfsDepth: number;
  changedFiles: string[];
  maxFilesPerSymbol: number;
}

/**
 * Pure: endpoints/crons reachable from each changed symbol only through the import
 * graph (hops 2..bfsDepth from the symbol's caller files). Hop 1 = direct callers.
 * docs/plans/blast-radius-p3.md §3.2.
 */
export function attributeIndirect(
  response: BlastRadiusResponse,
  edges: BlastImportEdge[],
  facts: BlastFileFactsRow[],
  opts: IndirectOptions,
): { indirect: BlastIndirectImpact[]; indirect_stats: BlastIndirectStats } {
  const importers = new Map<string, string[]>();
  for (const e of edges) {
    const list = importers.get(e.toFile) ?? [];
    list.push(e.fromFile);
    importers.set(e.toFile, list);
  }
  const factsByFile = new Map(facts.map((f) => [f.filePath, f]));
  const changed = new Set(opts.changedFiles);

  const indirect: BlastIndirectImpact[] = [];
  for (const group of response.downstream) {
    const callerFiles = new Set(group.callers.map((c) => c.file));
    const seen = new Set(callerFiles);
    let frontier = [...callerFiles];
    const reached: string[] = [];
    for (let depth = 2; depth <= opts.bfsDepth && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const f of frontier) {
        for (const from of importers.get(f) ?? []) {
          if (seen.has(from)) continue;
          seen.add(from);
          next.push(from);
          if (!changed.has(from)) reached.push(from);
        }
      }
      frontier = next;
    }
    const files = sortedUnique(reached).slice(0, opts.maxFilesPerSymbol);
    if (files.length === 0) continue;
    const directEp = new Set(group.endpoints_affected);
    const directCr = new Set(group.crons_affected);
    const endpoints = sortedUnique(files.flatMap((f) => factsByFile.get(f)?.endpoints ?? [])).filter(
      (e) => !directEp.has(e),
    );
    const crons = sortedUnique(files.flatMap((f) => factsByFile.get(f)?.crons ?? [])).filter((c) => !directCr.has(c));
    indirect.push({ symbol: group.symbol, files, endpoints, crons });
  }

  const directEndpoints = new Set([
    ...response.downstream.flatMap((d) => d.endpoints_affected),
    ...response.unattributed_endpoints,
  ]);
  const directCrons = new Set(response.downstream.flatMap((d) => d.crons_affected));
  const indirect_stats: BlastIndirectStats = {
    files: new Set(indirect.flatMap((i) => i.files)).size,
    endpoints: new Set(indirect.flatMap((i) => i.endpoints).filter((e) => !directEndpoints.has(e))).size,
    crons: new Set(indirect.flatMap((i) => i.crons).filter((c) => !directCrons.has(c))).size,
  };
  return { indirect, indirect_stats };
}
