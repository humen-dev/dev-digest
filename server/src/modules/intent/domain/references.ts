import {
  DOC_EXTENSIONS,
  ISSUE_REF_RE,
  MAX_DOC_REFS,
  MAX_ISSUE_REFS,
  MAX_LINK_REFS,
  PLAN_SPEC_GLOBS,
} from '../constants.js';
import type { ExtractedDocRef, ExtractedIssueRef, ExtractedLinkRef, ExtractedReferences } from '../types.js';
import { toPosix } from './paths.js';

/**
 * Pulls the deterministic reference kinds out of a PR body + changed-file list
 * (Decision 10). No network, no git here — resolving an issue number or a doc
 * path into actual content happens in the service (U5).
 */

const URL_RE = /https?:\/\/[^\s<>()"'\]]+/gi;
const TRAILING_PUNCT_RE = /[).,;:!?'"]+$/;
const DOC_EXT_ALTERNATION = DOC_EXTENSIONS.map((e) => e.slice(1)).join('|');
/** A bare repo-relative doc path mentioned in free text, e.g. "see docs/plans/x.md". */
const BARE_DOC_PATH_RE = new RegExp(
  `(?:^|[\\s(\`'"])([\\w./-]+\\.(?:${DOC_EXT_ALTERNATION}))(?=[\\s).,;:'"\`]|$)`,
  'gi',
);
const TICKET_PATH_RE = /\/(browse|issues?)(\/|$)/i;

function trimTrailingPunct(url: string): string {
  return url.replace(TRAILING_PUNCT_RE, '');
}

function hasDocExtension(path: string): boolean {
  const p = toPosix(path).toLowerCase();
  return DOC_EXTENSIONS.some((ext) => p.endsWith(ext));
}

/** Minimal glob matcher — only supports the two shapes actually used in `PLAN_SPEC_GLOBS`. */
function matchesGlob(path: string, glob: string): boolean {
  if (glob.startsWith('**/') && glob.endsWith('/**')) {
    const seg = glob.slice(3, -3);
    return path === seg || path.startsWith(`${seg}/`) || path.includes(`/${seg}/`);
  }
  if (glob.endsWith('/**')) return path.startsWith(glob.slice(0, -2));
  return path === glob;
}

function isPlanOrSpecPath(path: string): boolean {
  const p = toPosix(path);
  return PLAN_SPEC_GLOBS.some((g) => matchesGlob(p, g));
}

/** 'plan' for the `docs/plans` glob, 'spec' for the `specs` glob (see `PLAN_SPEC_GLOBS`), else a generic 'doc'. */
export function docRole(path: string): 'plan' | 'spec' | 'doc' {
  const p = toPosix(path);
  if (matchesGlob(p, PLAN_SPEC_GLOBS[0])) return 'plan';
  if (matchesGlob(p, PLAN_SPEC_GLOBS[1])) return 'spec';
  return 'doc';
}

/** 'ticket' for issue-tracker-looking paths (Jira `/browse/…`, Linear/GitHub `/issue(s)/…`), else 'doc'. */
export function linkRole(url: string): 'ticket' | 'doc' {
  try {
    return TICKET_PATH_RE.test(new URL(url).pathname) ? 'ticket' : 'doc';
  } catch {
    return 'doc';
  }
}

/** Repo-relative doc path for a same-repo `github.com/<owner>/<repo>/blob/<ref>/<path>` link, else null. */
function sameRepoBlobPath(url: string, repo: { owner: string; name: string }): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname.toLowerCase() !== 'github.com') return null;
  const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/[^/]+\/(.+)$/);
  if (!m) return null;
  const [, owner, name, rawPath] = m as [string, string, string, string];
  if (owner.toLowerCase() !== repo.owner.toLowerCase() || name.toLowerCase() !== repo.name.toLowerCase()) {
    return null;
  }
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function extractBareDocPaths(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(BARE_DOC_PATH_RE)) {
    const path = m[1];
    if (!path) continue;
    const normalized = path.replace(/^\.\//, '');
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}

/**
 * Deduped references found in a PR body + changed-file list:
 * - `issues`: same-repo `closes/fixes/resolves #N` only (Decision 10 — no other syntax).
 * - `docs`: same-repo `/blob/<ref>/<path>` links + bare repo-relative doc paths in the
 *   body (checked first), then changed files matching `PLAN_SPEC_GLOBS` with a doc
 *   extension (checked second, even without a body mention).
 * - `links`: every other https URL in the body.
 * Each list is capped (`MAX_ISSUE_REFS`/`MAX_DOC_REFS`/`MAX_LINK_REFS`); `overflow`
 * counts unique refs dropped past the cap.
 */
export function extractReferences(
  body: string | null,
  repo: { owner: string; name: string },
  changedPaths: string[],
): ExtractedReferences {
  const text = body ?? '';

  // ---- issues ---------------------------------------------------------------
  const issueNumbers: number[] = [];
  for (const m of text.matchAll(ISSUE_REF_RE)) {
    const n = Number(m[2]);
    if (Number.isFinite(n) && !issueNumbers.includes(n)) issueNumbers.push(n);
  }
  const issues: ExtractedIssueRef[] = issueNumbers
    .slice(0, MAX_ISSUE_REFS)
    .map((number) => ({ ref: `#${number}`, number }));
  const overflowIssues = Math.max(0, issueNumbers.length - MAX_ISSUE_REFS);

  // ---- URLs: same-repo blob -> doc candidate; everything else -> link --------
  const rawUrls: string[] = [];
  for (const m of text.matchAll(URL_RE)) rawUrls.push(trimTrailingPunct(m[0]));

  const bodyDocPaths: string[] = [];
  const linkCandidates: string[] = [];
  let bodyWithoutUrls = text;
  for (const url of rawUrls) {
    bodyWithoutUrls = bodyWithoutUrls.split(url).join(' ');
    const blobPath = sameRepoBlobPath(url, repo);
    if (blobPath && hasDocExtension(blobPath)) {
      if (!bodyDocPaths.includes(blobPath)) bodyDocPaths.push(blobPath);
    } else if (!linkCandidates.includes(url)) {
      linkCandidates.push(url);
    }
  }
  for (const path of extractBareDocPaths(bodyWithoutUrls)) {
    if (!bodyDocPaths.includes(path)) bodyDocPaths.push(path);
  }

  // ---- docs: body mentions first, then changed plan/spec files --------------
  const changedDocPaths = changedPaths.filter((p) => hasDocExtension(p) && isPlanOrSpecPath(p));
  const allDocPaths = [...bodyDocPaths];
  for (const p of changedDocPaths) if (!allDocPaths.includes(p)) allDocPaths.push(p);

  const docs: ExtractedDocRef[] = allDocPaths
    .slice(0, MAX_DOC_REFS)
    .map((path) => ({ path, role: docRole(path) }));
  const overflowDocs = Math.max(0, allDocPaths.length - MAX_DOC_REFS);

  const links: ExtractedLinkRef[] = linkCandidates
    .slice(0, MAX_LINK_REFS)
    .map((url) => ({ url, role: linkRole(url) }));
  const overflowLinks = Math.max(0, linkCandidates.length - MAX_LINK_REFS);

  return {
    issues,
    docs,
    links,
    overflow: { issues: overflowIssues, docs: overflowDocs, links: overflowLinks },
  };
}
