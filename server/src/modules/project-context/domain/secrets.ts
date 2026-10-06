/**
 * Secret-value detection for project documents (SPEC-01 UT-8, EC-27). Regex
 * matches on CONCRETE token shapes only — never bare keyword matching, so a
 * document that merely mentions "sk_live", "service_role" or
 * "NEXT_PUBLIC_" by name does not trip this.
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

/** True when `text` contains at least one concrete secret-shaped token. */
export function containsSecretValue(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}
