/**
 * Secret-value detection and redaction shared by any module that handles
 * repository or model text (SPEC-01 UT-8, SPEC-03 UT-7/UT-8). Regex matches
 * on CONCRETE token shapes only — never bare keyword matching, so text that
 * merely mentions "sk_live", "service_role" or "NEXT_PUBLIC_" by name does
 * not trip this.
 *
 * Promoted from `project-context/domain/secrets.ts` (SPEC-03 D6) — that path
 * is now a re-export. `_shared/` is the one place both modules may import
 * from, since `no-cross-module-internals` forbids importing another
 * module's `domain/` (`server/.dependency-cruiser.cjs`).
 */

const SECRET_PATTERNS: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/, // AWS access key id
  /AIza[0-9A-Za-z_-]{35}/, // Google API key
  /gh[ps]_[A-Za-z0-9]{36,}/, // GitHub token (classic / fine-grained PAT)
  /npm_[A-Za-z0-9]{36}/, // npm token
  /xox[bpsa]-[0-9a-zA-Z-]+/, // Slack token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM private key block
  /sk_live_[A-Za-z0-9]{20,}/, // Stripe live secret key
];

/** Fresh `g`-flagged copies for `replace` — never share regex state (`lastIndex`) across calls. */
function globalPatterns(): RegExp[] {
  return SECRET_PATTERNS.map((re) => new RegExp(re.source, 'g'));
}

/** True when `text` contains at least one concrete secret-shaped token. */
export function containsSecretValue(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

/** Replaces every secret-shaped token in `text` with `***` (SPEC-03 UT-8). */
export function redactSecretValues(text: string): string {
  let result = text;
  for (const re of globalPatterns()) {
    result = result.replace(re, '***');
  }
  return result;
}
