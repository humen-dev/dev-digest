import type { FactHandlers } from '../../repo-intel/types.js';

/** The slice of a caller row the attribution rule needs. */
export interface AttributionCaller {
  symbol: string;
  scopes?: string[];
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Text before the first '.', or the whole handler (`ContactsViewSet.export` → `ContactsViewSet`). */
export function handlerHead(h: string): string {
  const i = h.indexOf('.');
  return i < 0 ? h : h.slice(0, i);
}

/**
 * Facts of one file kept for changed symbol `changed` reached through `caller`
 * (docs/plans/blast-endpoint-attribution.md §3.4). Pure; sorted, unique.
 * Absent/empty handler maps → every fact (file-level, the pre-attribution behaviour).
 */
export function attributeFacts(
  facts: readonly string[],
  handlers: FactHandlers | undefined,
  changed: string,
  caller: AttributionCaller,
): string[] {
  const scopes = new Set(caller.scopes ?? [caller.symbol]);
  const handlersOf = (e: string): readonly string[] =>
    handlers !== undefined && Object.hasOwn(handlers, e) ? (handlers[e] ?? []) : [];
  const known = (e: string): boolean => handlersOf(e).length > 0;
  const matchesS = (h: string): boolean => h === changed || handlerHead(h) === changed;
  const matchesScope = (h: string): boolean => scopes.has(h) || scopes.has(handlerHead(h));

  const unknown = facts.filter((e) => !known(e));
  const direct = facts.filter((e) => known(e) && handlersOf(e).some(matchesS));
  const ownSet = facts.filter((e) => known(e) && handlersOf(e).some(matchesScope));
  const own = ownSet.length > 0 ? ownSet : direct.length > 0 ? [] : facts.filter(known);

  return [...new Set([...unknown, ...direct, ...own])].sort(cmp);
}
