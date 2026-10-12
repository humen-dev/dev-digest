/**
 * SPEC-07 AC-8 / AC-86 — file-system-safe slug for agent manifests and skill
 * files. Lowercase; every run of characters outside `[a-z0-9]` becomes `-`;
 * leading/trailing `-` trimmed; at most 64 characters; fallback `agent`.
 */

const MAX_SLUG_LENGTH = 64;
const FALLBACK_SLUG = 'agent';

export function agentSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : FALLBACK_SLUG;
}
