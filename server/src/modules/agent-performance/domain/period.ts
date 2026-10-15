import type { PerfRunBuckets } from '@devdigest/shared';
import { DAY_MS, DEFAULT_PERIOD_MS, HOUR_BUCKET_COUNT } from '../constants.js';

/** Closed period [from, to]. Pure: no I/O. */
export interface PeriodBounds {
  from: Date;
  to: Date;
}

const INSTANT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Parses `YYYY-MM-DDTHH:MM:SS(.f{1,6})?(Z|±HH:MM)`. Calendar validity is checked by
 * component round trip, so `2026-02-30T…` is rejected instead of rolling over.
 */
export function parseInstant(raw: string): Date | null {
  const m = INSTANT_RE.exec(raw);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [
    number, number, number, number, number, number,
  ];
  const ms = m[7] ? Number(m[7].padEnd(3, '0').slice(0, 3)) : 0;
  const zone = m[8]!;

  let offsetMin = 0;
  if (zone !== 'Z') {
    const oh = Number(zone.slice(1, 3));
    const om = Number(zone.slice(4, 6));
    if (oh > 23 || om > 59) return null;
    offsetMin = (zone[0] === '-' ? -1 : 1) * (oh * 60 + om);
  }

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, ms);
  const roundTrips =
    local.getUTCFullYear() === year &&
    local.getUTCMonth() === month - 1 &&
    local.getUTCDate() === day &&
    local.getUTCHours() === hour &&
    local.getUTCMinutes() === minute &&
    local.getUTCSeconds() === second;
  if (!roundTrips) return null;

  const instant = new Date(local.getTime() - offsetMin * 60_000);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** Resolves validated query input; both bounds absent → `[now − 720 h, now]`. */
export function resolvePeriod(q: { from?: string; to?: string }, now: Date): PeriodBounds {
  const from = q.from !== undefined ? parseInstant(q.from) : null;
  const to = q.to !== undefined ? parseInstant(q.to) : null;
  if (from && to) return { from, to };
  return { from: new Date(now.getTime() - DEFAULT_PERIOD_MS), to: now };
}

/** `[from − (to − from), from)` — equal length, ends where the period starts. */
export function previousPeriod(p: PeriodBounds): PeriodBounds {
  const len = p.to.getTime() - p.from.getTime();
  return { from: new Date(p.from.getTime() - len), to: p.from };
}

/**
 * Consecutive buckets, oldest first: 24 hourly buckets when the period is ≤ 24 h,
 * otherwise `ceil(len / 24 h)` daily buckets counted back from `to`.
 * Bucket k = `[to − (n−k)·size, to − (n−k−1)·size)`; the last one is closed at `to`.
 * Only runs inside the period `[from, to]` are counted.
 */
export function runBuckets(p: PeriodBounds, runs: { ranAt: Date }[]): PerfRunBuckets {
  const len = p.to.getTime() - p.from.getTime();
  const hourly = len <= DAY_MS;
  const sizeMs = hourly ? HOUR_MS : DAY_MS;
  const n = hourly ? HOUR_BUCKET_COUNT : Math.ceil(len / DAY_MS);
  const to = p.to.getTime();
  const firstStart = to - n * sizeMs;
  const counts = new Array<number>(n).fill(0);

  for (const r of runs) {
    const t = r.ranAt.getTime();
    if (t < p.from.getTime() || t > to) continue;
    const k = t === to ? n - 1 : Math.floor((t - firstStart) / sizeMs);
    if (k >= 0 && k < n) counts[k] = (counts[k] ?? 0) + 1;
  }

  return {
    size: hourly ? 'hour' : 'day',
    buckets: counts.map((c, k) => ({
      start: new Date(to - (n - k) * sizeMs).toISOString(),
      runs: c,
    })),
  };
}
