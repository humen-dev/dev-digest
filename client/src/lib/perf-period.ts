/* perf-period.ts — pure period model for Agent Performance (SPEC-09).
   URL state: `range=1d|30d|custom`, custom adds local dates `from`/`to` (YYYY-MM-DD). */

export type PerfRange = "1d" | "30d" | "custom";
export interface PerfPeriodState {
  range: PerfRange;
  /** custom only: local `YYYY-MM-DD` */
  from?: string;
  to?: string;
}
export type CustomRangeError = "order" | "future" | "tooLong";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const MAX_CUSTOM_DAYS = 365;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const DEFAULT_STATE: PerfPeriodState = { range: "30d" };

/** Local calendar date `YYYY-MM-DD` → local Date at 00:00, or null when malformed / not a real date. */
function parseLocalDate(raw: string | null | undefined): Date | null {
  const m = raw ? DATE_RE.exec(raw) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  const roundTrips = date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
  return roundTrips ? date : null;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function toLocalDateString(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Calendar days between two local dates, inclusive (same day → 1). DST-safe via rounding. */
function inclusiveDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
}

/** Local wall-clock time as ISO-8601 with its `±HH:MM` offset. */
function toOffsetIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const date = toLocalDateString(d);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  return `${date}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function validateCustomRange(from: string, to: string, today: Date): CustomRangeError | null {
  const f = parseLocalDate(from);
  const t = parseLocalDate(to);
  if (!f || !t) return "order";
  if (f.getTime() > t.getTime()) return "order";
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (t.getTime() > todayStart.getTime()) return "future";
  if (inclusiveDays(f, t) > MAX_CUSTOM_DAYS) return "tooLong";
  return null;
}

/** URL → state. Anything missing, unknown or invalid falls back to 30 days. */
export function parsePerfPeriod(sp: URLSearchParams, today: Date): PerfPeriodState {
  const range = sp.get("range");
  if (range === "1d" || range === "30d") return { range };
  if (range === "custom") {
    const from = sp.get("from");
    const to = sp.get("to");
    if (from && to && validateCustomRange(from, to, today) === null) return { range: "custom", from, to };
  }
  return DEFAULT_STATE;
}

/** State → closed `[from, to]` ISO instants. Presets end at `now`; custom spans whole local days. */
export function resolvePerfPeriod(s: PerfPeriodState, now: Date): { from: string; to: string } {
  if (s.range === "custom") {
    const f = parseLocalDate(s.from);
    const t = parseLocalDate(s.to);
    if (f && t) {
      const start = new Date(f.getFullYear(), f.getMonth(), f.getDate(), 0, 0, 0, 0);
      const end = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59, 999);
      return { from: toOffsetIso(start), to: toOffsetIso(end) };
    }
  }
  const hours = s.range === "1d" ? 24 : 720;
  return { from: new Date(now.getTime() - hours * HOUR_MS).toISOString(), to: now.toISOString() };
}

/** State → URL params to merge (`range`, plus `from`/`to` for custom). */
export function perfPeriodParams(s: PerfPeriodState): Record<string, string> {
  if (s.range === "custom" && s.from && s.to) return { range: "custom", from: s.from, to: s.to };
  return { range: s.range === "custom" ? "30d" : s.range };
}

/** "Oct 1 – 15"; the year is added when either end is outside the current year. */
export function customRangeLabel(from: string, to: string, locale: string, today: Date): string {
  const f = parseLocalDate(from);
  const t = parseLocalDate(to);
  if (!f || !t) return "";
  const year = today.getFullYear();
  const withYear = f.getFullYear() !== year || t.getFullYear() !== year;
  const fmt = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
  });
  return fmt.formatRange(f, t);
}
