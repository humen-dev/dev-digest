import type { BriefStatus } from '@devdigest/shared';

const SAFE_TOKEN = /^[A-Za-z0-9_:.-]{1,64}$/;

const safe = (s: string | null): string | null => (s !== null && SAFE_TOKEN.test(s) ? s : null);
const num = (n: number | null): number | null => (n !== null && Number.isFinite(n) ? n : null);
const count = (n: number): number => (Number.isFinite(n) ? n : 0);

/**
 * Ops log record for `brief.generate`. Whitelist only: ids/enums that match a strict
 * token pattern and numbers. Never titles, bodies, paths or model prose.
 */
export function buildBriefLogRecord(f: {
  prId: string;
  status: BriefStatus;
  reason: string | null;
  attempts: number | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  inputTokens: number | null;
  dropped: Record<string, number>;
  grounding: { refs: number; risks: number; focus: number };
  durationMs: number;
}): Record<string, unknown> {
  const dropped: Record<string, number> = {};
  for (const [k, v] of Object.entries(f.dropped)) {
    if (SAFE_TOKEN.test(k)) dropped[k] = count(v);
  }
  return {
    event: 'brief.generate',
    prId: safe(f.prId),
    status: f.status,
    reason: safe(f.reason),
    attempts: num(f.attempts),
    tokensIn: count(f.tokensIn),
    tokensOut: count(f.tokensOut),
    costUsd: num(f.costUsd),
    inputTokens: num(f.inputTokens),
    dropped,
    grounding: {
      refs: count(f.grounding.refs),
      risks: count(f.grounding.risks),
      focus: count(f.grounding.focus),
    },
    durationMs: count(f.durationMs),
  };
}
