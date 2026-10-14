/**
 * SPEC-08 Term "Credential-shaped string" — one pure guard used both on
 * generated export files (AC-42, NFR-15) and on ingested artifact files
 * (AC-75, UT-7). Patterns are the reference implementation's verbatim; the
 * looser generic pattern of the `security` skill is deliberately NOT used —
 * it false-positives on the minified runner bundle. Never returns or logs the
 * matched text.
 */

const SECRET_SHAPE_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9]{16,}\b/, // OpenAI / OpenRouter-style API keys
  /\bghp_[A-Za-z0-9]{36,}\b/, // GitHub classic PAT
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, // GitHub fine-grained PAT
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM private key header
  // A long base64/hex-ish blob assigned to a key/token/secret-named field.
  /(?:key|token|secret)\s*[:=]\s*["']?[A-Za-z0-9+/_-]{24,}={0,2}["']?/i,
];

/** True when `text` contains any credential-shaped value. */
export function containsSecretShapedValue(text: string): boolean {
  return SECRET_SHAPE_PATTERNS.some((re) => re.test(text));
}

/**
 * True when `text` contains any of the workspace's stored secret values
 * verbatim. Blank candidates are skipped, never treated as a universal match.
 */
export function containsKnownSecretValue(text: string, values: readonly (string | undefined)[]): boolean {
  return values.some((v) => typeof v === 'string' && v.trim().length > 0 && text.includes(v));
}

/** Both checks of the spec Term in one call. */
export function isCredentialShaped(text: string, knownValues: readonly (string | undefined)[] = []): boolean {
  return containsSecretShapedValue(text) || containsKnownSecretValue(text, knownValues);
}
