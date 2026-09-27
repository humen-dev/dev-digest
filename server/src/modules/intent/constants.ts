/**
 * Constants for the intent layer's source gathering (caps, globs, regex).
 * See docs/plans/intent-layer.md §3.7/§4 U3 (and, once written, server/specs/intent-layer.md).
 */

/** Deduped, capped counts per source kind — the rest is reported via `overflow`. */
export const MAX_ISSUE_REFS = 3;
export const MAX_DOC_REFS = 3;
export const MAX_LINK_REFS = 5;

/** Extensions that make a path a candidate "doc" (plan/spec/readme, never code). */
export const DOC_EXTENSIONS = ['.md', '.mdx', '.txt', '.rst', '.adoc'] as const;

/**
 * Globs that make a changed file a plan/spec doc even without a body mention.
 * `docRole`/`isPlanOrSpecPath` (`domain/references.ts`) match these BY INDEX:
 * index 0 -> role 'plan', index 1 -> role 'spec'.
 */
export const PLAN_SPEC_GLOBS = ['docs/plans/**', '**/specs/**'] as const;

/** 'Fixes #12', 'closes: #7', 'resolved #3' — same-repo only, no other issue syntax. */
export const ISSUE_REF_RE = /\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s*:?\s*#(\d+)\b/gi;

/** Per-source timeout for a linked-issue / external-link fetch. */
export const SOURCE_TIMEOUT_MS = 8_000;

/** Of the links `extractReferences` finds (up to `MAX_LINK_REFS`), at most this many are fetched. */
export const MAX_EXTERNAL_REFS = 3;
export const EXTERNAL_MAX_BYTES = 200_000;
export const EXTERNAL_CONTENT_TYPES = ['text/markdown', 'text/plain', 'text/html'] as const;
