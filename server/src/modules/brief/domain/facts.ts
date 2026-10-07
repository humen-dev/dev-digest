import type { BlastRadiusResponse, ProjectDocStatus, SmartDiffRole } from '@devdigest/shared';
import { ISSUE_BODY_MAX_CHARS, PR_BODY_MAX_CHARS } from '../constants.js';
import type { BriefCallerFact, BriefFileFact, BriefInput, HunkRange } from '../types.js';

/**
 * Pure assembly of the brief's facts (SPEC-04, AC-10/15/16/17/20). No I/O: the
 * service gathers the raw facts and this turns them into a `BriefInput` plus
 * the `missing_sources` codes. Row shapes are declared structurally here so the
 * domain never imports `ports.ts`.
 */

export type BriefRawIssue =
  | { state: 'none' }
  | { state: 'unresolved' }
  | { state: 'ok'; number: number; title: string; body: string | null };

export interface BriefRawFacts {
  pull: { title: string; body: string | null };
  files: { path: string; additions: number; deletions: number; hunks: HunkRange[] }[];
  roles: ReadonlyMap<string, SmartDiffRole> | Readonly<Record<string, SmartDiffRole>>;
  intent: { intent: string; inScope: string[]; outOfScope: string[]; headSha: string } | null;
  currentHeadSha: string;
  blast: BlastRadiusResponse | 'unavailable';
  issue: BriefRawIssue;
  docs: { path: string; status: ProjectDocStatus; text: string | null }[];
}

const ELLIPSIS = '…';

/** Cap `text` at `max` chars + an ellipsis; reports whether it was cut. */
function cap(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max) + ELLIPSIS, truncated: true } : { text, truncated: false };
}

function roleOf(roles: BriefRawFacts['roles'], path: string): SmartDiffRole | null {
  if (roles instanceof Map) return roles.get(path) ?? null;
  const rec = roles as Readonly<Record<string, SmartDiffRole>>;
  return Object.prototype.hasOwnProperty.call(rec, path) ? rec[path]! : null;
}

function cmp(a: string | number, b: string | number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(cmp);
}

function buildBlast(blast: BlastRadiusResponse): NonNullable<BriefInput['blast']> {
  const seen = new Set<string>();
  const callers: BriefCallerFact[] = [];
  for (const d of blast.downstream) {
    for (const c of d.callers) {
      const key = `${d.symbol}\u0000${c.name}\u0000${c.file}\u0000${c.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      callers.push({ symbol: d.symbol, name: c.name, file: c.file, line: c.line });
    }
  }
  callers.sort((a, b) => cmp(a.file, b.file) || cmp(a.line, b.line) || cmp(a.symbol, b.symbol) || cmp(a.name, b.name));
  return {
    summary: blast.summary,
    callers,
    endpoints: uniqueSorted([...blast.downstream.flatMap((d) => d.endpoints_affected), ...blast.unattributed_endpoints]),
    crons: uniqueSorted(blast.downstream.flatMap((d) => d.crons_affected)),
  };
}

export function buildBriefInput(raw: BriefRawFacts): { input: BriefInput; missing: string[] } {
  const missing: string[] = [];

  const rawBody = raw.pull.body ?? '';
  if (rawBody.trim() === '') missing.push('pr_body_empty');
  const body = cap(rawBody, PR_BODY_MAX_CHARS);
  if (body.truncated) missing.push('pr_body_truncated');

  const files: BriefFileFact[] = raw.files.map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
    role: roleOf(raw.roles, f.path),
    hunks: f.hunks,
  }));

  let intent: BriefInput['intent'] = null;
  if (!raw.intent) {
    missing.push('intent_not_detected');
  } else {
    intent = { intent: raw.intent.intent, in_scope: raw.intent.inScope, out_of_scope: raw.intent.outOfScope };
    if (raw.intent.headSha !== raw.currentHeadSha) missing.push('intent_stale');
  }

  let blast: BriefInput['blast'] = null;
  if (raw.blast === 'unavailable') {
    missing.push('blast_unavailable');
  } else {
    blast = buildBlast(raw.blast);
    if (raw.blast.degraded) missing.push(`blast_degraded:${raw.blast.reason ?? 'unknown'}`);
  }

  let issue: BriefInput['issue'] = null;
  if (raw.issue.state === 'none') {
    missing.push('no_linked_issue');
  } else if (raw.issue.state === 'unresolved') {
    missing.push('linked_issue_unresolved');
  } else {
    const issueBody = cap(raw.issue.body ?? '', ISSUE_BODY_MAX_CHARS);
    if (issueBody.truncated) missing.push('issue_body_truncated');
    issue = { number: raw.issue.number, title: raw.issue.title, body: issueBody.text };
  }

  const docs = raw.docs
    .filter((d) => d.status === 'included' && d.text !== null)
    .map((d) => ({ path: d.path, text: d.text as string }));
  if (docs.length === 0) missing.push('no_context_docs');

  return {
    input: {
      pr: { title: raw.pull.title, body: body.text },
      totals: {
        files: files.length,
        additions: files.reduce((n, f) => n + f.additions, 0),
        deletions: files.reduce((n, f) => n + f.deletions, 0),
      },
      files,
      intent,
      blast,
      issue,
      docs,
    },
    missing,
  };
}
