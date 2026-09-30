/**
 * Pure: which symbols of a caller file contain a reference line. Used by the
 * repo-intel facade so blast can attribute endpoints/crons per handler.
 */
export interface ScopeSymbol {
  name: string;
  line: number | null;
  endLine: number | null;
}

/**
 * Sorted unique names of symbols with `line <= refLine <= endLine`. A symbol
 * whose `endLine` is null counts only when its name === `enclosing` (the
 * existing nearest-preceding label).
 */
export function callerScopes(
  rows: readonly ScopeSymbol[],
  refLine: number,
  enclosing: string | null,
): string[] {
  const out = new Set<string>();
  for (const s of rows) {
    if (s.line === null || s.line > refLine) continue;
    if (s.endLine === null) {
      if (enclosing !== null && s.name === enclosing) out.add(s.name);
      continue;
    }
    if (refLine <= s.endLine) out.add(s.name);
  }
  return [...out].sort();
}
