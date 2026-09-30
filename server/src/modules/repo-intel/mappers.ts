/**
 * repo-intel row → contract mappers (ring 3, no ORM imports).
 */
import { z } from 'zod';
import type { FactHandlers } from './types.js';

const RawHandlers = z.record(z.string(), z.unknown());

/**
 * Tolerant jsonb → FactHandlers. The value comes from analysed repository
 * content, so it is treated as untrusted: only own keys that are present in
 * `facts` survive, values are filtered to strings, deduped and sorted, empty
 * lists are dropped, and anything malformed yields `{}`.
 */
export function parseFactHandlers(value: unknown, facts: readonly string[]): FactHandlers {
  const parsed = RawHandlers.safeParse(value);
  if (!parsed.success) return {};
  const raw = parsed.data;
  const out = new Map<string, string[]>();
  for (const fact of facts) {
    if (!Object.hasOwn(raw, fact)) continue;
    const list = raw[fact];
    if (!Array.isArray(list)) continue;
    const names = [...new Set(list.filter((h): h is string => typeof h === 'string'))].sort();
    if (names.length > 0) out.set(fact, names);
  }
  return Object.fromEntries(out);
}
