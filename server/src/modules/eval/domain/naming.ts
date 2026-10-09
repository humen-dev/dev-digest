import { EVAL_NAME_MAX } from '../constants.js';

function kebab(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `<base>` or `<base>-<n>`, with the base truncated so the whole name is <= EVAL_NAME_MAX. */
function withSuffix(base: string, n: number): string {
  const suffix = n === 1 ? '' : `-${n}`;
  const head = base.slice(0, EVAL_NAME_MAX - suffix.length).replace(/-+$/, '');
  return head + suffix;
}

/**
 * Default case name from a finding title: kebab-case, `-2`, `-3`... on a clash
 * with `existing`, `case-<8 chars of the finding id>` when nothing survives
 * kebab-casing, always <= EVAL_NAME_MAX characters.
 */
export function caseNameFromTitle(title: string, findingId: string, existing: readonly string[]): string {
  const base = kebab(title) || `case-${findingId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase()}`;
  const taken = new Set(existing);
  for (let n = 1; ; n++) {
    const candidate = withSuffix(base, n);
    if (!taken.has(candidate)) return candidate;
  }
}
