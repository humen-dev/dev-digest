import { groupByBucket } from '@devdigest/reviewer-core';
import type { BriefContextCandidate } from '@devdigest/shared';
import { GENERAL_DOC_DIRS } from '../constants.js';

/**
 * Ranks the project documents offered as brief context (SPEC-04, AC-30..33).
 * Candidates = attached ∪ spec files the PR text references (and that exist in
 * the project docs). PR-referenced first, then the rest in bucket order. The
 * result does not depend on input order (NFR-7).
 */

// A `specs/…md` path mentioned in the PR title/body (optionally nested, e.g. `client/specs/x.md`).
const SPEC_REF_RE = /(?:[\w.-]+\/)*specs\/[\w./-]+?\.md/g;

const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function firstSegment(path: string): string | null {
  const i = path.indexOf('/');
  return i === -1 ? null : path.slice(0, i);
}

export function rankContextCandidates(a: {
  attached: string[];
  projectDocs: { path: string; estimated_tokens: number }[];
  changedPaths: string[];
  prTitle: string;
  prBody: string | null;
}): BriefContextCandidate[] {
  const tokensByPath = new Map(a.projectDocs.map((d) => [d.path, d.estimated_tokens]));

  const text = `${a.prTitle}\n${a.prBody ?? ''}`;
  const referenced = new Set<string>();
  for (const m of text.matchAll(SPEC_REF_RE)) {
    if (tokensByPath.has(m[0])) referenced.add(m[0]);
  }

  const candidates = [...new Set([...a.attached, ...referenced])].sort(byPath);
  const changedSegments = new Set(a.changedPaths.map(firstSegment).filter((s): s is string => s !== null));
  const generalDirs: readonly string[] = GENERAL_DOC_DIRS;

  const make = (path: string): BriefContextCandidate => {
    const estimated_tokens = tokensByPath.get(path) ?? 0;
    if (referenced.has(path)) {
      return { path, estimated_tokens, preselected: true, reason_code: 'pr_referenced', scope: null };
    }
    const seg = firstSegment(path);
    if (seg === null || generalDirs.includes(seg)) {
      return { path, estimated_tokens, preselected: true, reason_code: 'general', scope: null };
    }
    const touched = changedSegments.has(seg);
    return {
      path,
      estimated_tokens,
      preselected: touched,
      reason_code: touched ? 'scope_touched' : 'scope_not_touched',
      scope: seg,
    };
  };

  const first = candidates.filter((p) => referenced.has(p)).map(make);
  const rest = groupByBucket(candidates.filter((p) => !referenced.has(p)).map((path) => ({ path })))
    .flatMap((g) => g.docs)
    .map((d) => make(d.path));
  return [...first, ...rest];
}
