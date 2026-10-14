import { redactSecretValues } from '../../_shared/secrets.js';

/** Provider-key shapes that `_shared/secrets.ts` does not cover (UT-8, Decision 4). */
const PROVIDER_KEY_PATTERNS: readonly RegExp[] = [
  /sk-or-v1-[A-Za-z0-9_-]{8,}/g, // OpenRouter
  /sk-ant-[A-Za-z0-9_-]{8,}/g, // Anthropic
  /sk-[A-Za-z0-9_-]{16,}/g, // OpenAI-style
];

/** A run's failure text as shown in a column: secret-shaped tokens replaced by `***`. */
export function maskColumnError(text: string | null): string | null {
  if (text == null) return null;
  let out = redactSecretValues(text);
  for (const re of PROVIDER_KEY_PATTERNS) out = out.replace(re, '***');
  return out;
}
