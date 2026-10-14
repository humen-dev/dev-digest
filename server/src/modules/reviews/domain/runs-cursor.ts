/**
 * Keyset cursor of the multi-agent runs list (pure). Opaque base64url(JSON {t, id}).
 * `ranAt` is UTC text with MICROSECOND precision (as read from Postgres) — a JS Date
 * would truncate to ms and a keyset on it would repeat or skip rows. The cursor holds
 * no workspace id: scope always comes from the request context.
 */
export interface RunsCursor {
  /** UTC, microseconds: 2026-10-12T08:00:00.123456Z */
  ranAt: string;
  /** uuid of the multi-agent run */
  id: string;
}

const RAN_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A calendar-valid instant: JS rolls 2026-02-30 over to March and Postgres rejects it
 *  (500), so the date-time part must survive a round trip unchanged; year ≥ 1. */
function isRealUtcInstant(t: string): boolean {
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return false;
  const iso = new Date(ms).toISOString();
  return iso.slice(0, 19) === t.slice(0, 19) && Number(t.slice(0, 4)) >= 1;
}

export function encodeRunsCursor(c: RunsCursor): string {
  return Buffer.from(JSON.stringify({ t: c.ranAt, id: c.id }), 'utf8').toString('base64url');
}

/** Null on any malformed input; never throws. */
export function decodeRunsCursor(raw: string): RunsCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { t, id } = parsed as { t?: unknown; id?: unknown };
    if (typeof t !== 'string' || typeof id !== 'string') return null;
    if (!RAN_AT_RE.test(t) || !isRealUtcInstant(t)) return null;
    if (!UUID_RE.test(id)) return null;
    return { ranAt: t, id };
  } catch {
    return null;
  }
}
