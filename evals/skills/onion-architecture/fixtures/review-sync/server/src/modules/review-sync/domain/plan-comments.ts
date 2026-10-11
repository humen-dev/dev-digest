import { MAX_COMMENTS_PER_SYNC, MIN_CONFIDENCE, SEVERITY_RANK } from '../constants.js';
import type { PlannedComment, SyncFinding } from '../types.js';
import { fingerprint } from './dedupe.js';

export interface CommentPlan {
  planned: PlannedComment[];
  skipped: number;
}

export function renderBody(f: SyncFinding): string {
  const parts = [`**${f.severity.toUpperCase()}** — ${f.title}`, '', f.rationale];
  if (f.suggestion) parts.push('', '```suggestion', f.suggestion, '```');
  return parts.join('\n');
}

export function planComments(findings: SyncFinding[], alreadyPosted: Set<string>): CommentPlan {
  const eligible = findings
    .filter((f) => f.confidence >= MIN_CONFIDENCE)
    .map((f) => ({ f, fp: fingerprint(f) }))
    .filter(({ fp }) => !alreadyPosted.has(fp))
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.f.severity] ?? 99) - (SEVERITY_RANK[b.f.severity] ?? 99) ||
        b.f.confidence - a.f.confidence,
    );

  const planned = eligible.slice(0, MAX_COMMENTS_PER_SYNC).map(({ f, fp }) => ({
    findingId: f.id,
    path: f.file,
    line: f.startLine,
    body: renderBody(f),
    fingerprint: fp,
  }));
  return { planned, skipped: eligible.length - planned.length };
}
