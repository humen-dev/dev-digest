/**
 * URL redaction and log-safe projections for intent sources (Decision 17:
 * "URLs logged without query/fragment/userinfo", never body/document/diff text).
 */

/** Drop query, fragment and userinfo from a URL. Non-URL input is returned unchanged. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    return url;
  }
}

export interface SourceLogInput {
  kind: string;
  /** Already-redacted ref — this function does not call `redactUrl` itself. */
  ref: string;
  status: 'resolved' | 'unresolved';
  reason: string | null;
  chars: number;
}

/** Projection of an intent source safe to pass to a logger. */
export function sourceLogView(s: SourceLogInput): SourceLogInput {
  return { kind: s.kind, ref: s.ref, status: s.status, reason: s.reason, chars: s.chars };
}
