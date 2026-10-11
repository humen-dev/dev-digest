import type { ExtractedIssueRef } from '../../intent/types.js';
import { ISSUE_REF_PATTERN, MAX_REFS_PER_SKILL, MISSING_FILE_PERCENTILE } from '../constants.js';

export function extractIssueRefs(body: string): ExtractedIssueRef[] {
  const seen = new Map<number, ExtractedIssueRef>();
  for (const m of body.matchAll(ISSUE_REF_PATTERN)) {
    const number = Number(m[2]);
    if (!seen.has(number)) seen.set(number, { ref: `#${number}`, number });
    if (seen.size >= MAX_REFS_PER_SKILL) break;
  }
  return [...seen.values()];
}

export function staleIssueRefs(refs: ExtractedIssueRef[], openIssueNumbers: Set<number>): string[] {
  return refs.filter((r) => !openIssueNumbers.has(r.number)).map((r) => r.ref);
}

export function missingEvidence(
  evidenceFiles: string[],
  ranked: { path: string; percentile: number }[],
): string[] {
  const present = new Set(ranked.filter((r) => r.percentile > MISSING_FILE_PERCENTILE).map((r) => r.path));
  return evidenceFiles.filter((p) => !present.has(p));
}
