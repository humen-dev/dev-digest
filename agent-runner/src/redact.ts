/**
 * SPEC-07 UT-10 — scrub the OpenRouter key out of any text before it reaches
 * the CI log. Errors from the LLM SDK or a misconfigured proxy can echo request
 * headers; the key must never appear in a log, artifact or posted comment.
 */
export function redactKey(text: string, key: string | undefined): string {
  if (!key || key.trim().length === 0) return text;
  return text.split(key).join('***');
}
