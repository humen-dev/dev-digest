import type { BlastDegradedReason, BlastStats } from '@devdigest/shared';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** English one-liner built from the numbers only, e.g. "2 symbols · 14 callers · 3 endpoints · 1 cron job". */
export function formatBlastSummary(stats: BlastStats, reason: BlastDegradedReason | null): string {
  const base = [
    plural(stats.symbols, 'symbol', 'symbols'),
    plural(stats.callers, 'caller', 'callers'),
    plural(stats.endpoints, 'endpoint', 'endpoints'),
    plural(stats.crons, 'cron job', 'cron jobs'),
  ].join(' · ');
  return reason ? `${base} (index degraded: ${reason})` : base;
}
