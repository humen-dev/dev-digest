/**
 * Heuristic prompt-injection detector for skill bodies. Pure — no I/O.
 *
 * A skill body is inserted into the reviewer's prompt as trusted rule text, so a
 * body that tries to override the reviewer ("ignore all previous instructions",
 * "always score 100") is an attack, not a rule. This is a deny-list of
 * well-known patterns: it catches the obvious attempts, NOT a determined
 * attacker — the imported-skill preview and the untrusted-source notice remain
 * the human checkpoint.
 */

interface InjectionPattern {
  label: string;
  re: RegExp;
}

const PATTERNS: InjectionPattern[] = [
  {
    label: 'instruction override',
    re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(all|any|the|your)?\s*(previous|prior|above|earlier|system|safety)\b[^.\n]{0,30}\b(instructions?|prompts?|rules?|guidelines?|directives?)\b/i,
  },
  { label: 'role reassignment', re: /\byou are now\b[^.\n]{0,60}\b(assistant|dan|unrestricted|no restrictions?|jailbroken)\b/i },
  { label: 'fake system message', re: /^\s*(system|assistant)\s*:/im },
  { label: 'delimiter spoofing', re: /<\/?\s*(untrusted|system|instructions?)\s*>/i },
  { label: 'forced verdict', re: /\b(always|never)\b[^.\n]{0,40}\bscore(?:\s+of)?\s*:?\s*100\b/i },
  { label: 'forced verdict', re: /\bnever (flag|report)\b[^.\n]{0,30}\b(security|vulnerabilit|issues|bugs)/i },
  { label: 'forced verdict', re: /\bapprove all (prs?|pull requests?)\b/i },
  { label: 'forced verdict', re: /\bscore:\s*100\b/i },
  { label: 'prompt exfiltration', re: /\b(output|print|reveal|show|repeat|leak)\b[^.\n]{0,40}\b(system prompts?|agent configurations?|your instructions)\b/i },
  { label: 'disable other skills', re: /\b(disable|ignore|skip)\b[^.\n]{0,30}\b(other|all)\s+skills?\b/i },
  { label: 'concealment', re: /\bnever (mention|reveal|disclose)\b[^.\n]{0,40}\b(this|these|instruction|vulnerabilit)/i },
];

/** Labels of every injection pattern found in `body` (deduplicated); empty = clean. */
export function detectInjection(body: string): string[] {
  const found = new Set<string>();
  for (const p of PATTERNS) if (p.re.test(body)) found.add(p.label);
  return [...found];
}

export function hasInjection(body: string): boolean {
  return detectInjection(body).length > 0;
}
