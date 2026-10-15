import type { AgentPerfRow } from "@devdigest/shared";
import { SMALL_SAMPLE_THRESHOLD, ratePercent } from "@/lib/accept-rate";
import { DEFAULT_SORT, SORT_KEYS, UNKNOWN_AGENT_KEY, type SortDir, type SortKey, type SortState } from "./constants";

/** URL → sort. Unknown or malformed values (including markup) fall back to the default; they are never echoed. */
export function parseSort(sp: Pick<URLSearchParams, "get">): SortState {
  const rawKey = sp.get("sort");
  const rawDir = sp.get("dir");
  const key = SORT_KEYS.find((k) => k === rawKey) ?? DEFAULT_SORT.key;
  const dir: SortDir = rawDir === "asc" || rawDir === "desc" ? rawDir : DEFAULT_SORT.dir;
  return { key, dir };
}

/** Header activation: another column starts descending (AC-44), the current one reverses (AC-45). */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key !== key) return { key, dir: "desc" };
  return { key, dir: current.dir === "desc" ? "asc" : "desc" };
}

const byName = (a: AgentPerfRow, b: AgentPerfRow) => a.agent_name.localeCompare(b.agent_name);
const sign = (dir: SortDir) => (dir === "asc" ? 1 : -1);

function numericValue(row: AgentPerfRow, key: Exclude<SortKey, "accept">): number | null {
  if (key === "runs") return row.runs;
  return key === "cost" ? row.avg_cost_usd : row.avg_duration_ms;
}

function sortByRate(rows: AgentPerfRow[], dir: SortDir): AgentPerfRow[] {
  return [...rows].sort(
    (a, b) => sign(dir) * ((a.accept_rate ?? 0) - (b.accept_rate ?? 0)) || b.decided - a.decided || byName(a, b),
  );
}

/**
 * AC-42: accept-rate order is three groups — ≥ 5 decided by rate in the chosen
 * direction, then small samples by rate in the same direction, then rows with no
 * decision by name. The groups are fixed: reversing the direction reverses only
 * the inside of the first two (AC-45).
 * Other columns: values in the chosen direction, nulls last in both, ties by name.
 */
export function sortRows(rows: readonly AgentPerfRow[], { key, dir }: SortState): AgentPerfRow[] {
  if (key === "accept") {
    const rated = rows.filter((r) => r.decided >= SMALL_SAMPLE_THRESHOLD && r.accept_rate != null);
    const small = rows.filter((r) => r.decided > 0 && r.decided < SMALL_SAMPLE_THRESHOLD && r.accept_rate != null);
    const none = rows.filter((r) => !rated.includes(r) && !small.includes(r)).sort(byName);
    return [...sortByRate(rated, dir), ...sortByRate(small, dir), ...none];
  }
  const withValue = rows.filter((r) => numericValue(r, key) != null);
  const nulls = rows.filter((r) => numericValue(r, key) == null).sort(byName);
  withValue.sort((a, b) => sign(dir) * (numericValue(a, key)! - numericValue(b, key)!) || byName(a, b));
  return [...withValue, ...nulls];
}

/** AC-59 / EC-16: an arrow only when both periods have ≥ 5 decided findings and the whole-percent rates differ. */
export function trendOf(row: AgentPerfRow): { direction: "up" | "down"; previousPercent: number } | null {
  if (row.accept_rate == null || row.prev_accept_rate == null) return null;
  if (row.decided < SMALL_SAMPLE_THRESHOLD || row.prev_decided < SMALL_SAMPLE_THRESHOLD) return null;
  const now = ratePercent(row.accept_rate);
  const before = ratePercent(row.prev_accept_rate);
  if (now === before) return null;
  return { direction: now > before ? "up" : "down", previousPercent: before };
}

/** AC-55: seconds with one decimal; no data → "—". */
export function formatSeconds(ms: number | null): string {
  return ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

/** Stable React key / expand id of a row (the Unknown agent has no id). */
export function rowKey(row: AgentPerfRow): string {
  return row.agent_id ?? UNKNOWN_AGENT_KEY;
}
