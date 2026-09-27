/* DiffTab/helpers.ts — pure grouping + findings-selection helpers (no React).
   `currentFindings` mirrors the server's rule (docs/plans/smart-diff.md
   Decisions 6 and 8) so Accept/Reject on the Findings tab is reflected here
   without an extra request: the latest `kind === 'review'` review per agent
   (agent-less reviews share one bucket, keyed by `null`), union across
   agents, dismissed findings dropped. Accepted findings stay (rendered muted
   by FindingCard). */
import type {
  FindingRecord,
  PrFile,
  ReviewRecord,
  SmartDiffResponse,
  SmartDiffRole,
} from "@devdigest/shared";
import { SMART_DIFF_ROLE_ORDER } from "./constants";

/** `reviews` must be newest-first (usePrReviews' natural order). */
export function currentFindings(reviews: ReviewRecord[]): FindingRecord[] {
  const seenAgents = new Set<string | null>();
  const findings: FindingRecord[] = [];
  for (const review of reviews) {
    if (review.kind !== "review") continue;
    if (seenAgents.has(review.agent_id)) continue;
    seenAgents.add(review.agent_id);
    for (const finding of review.findings) {
      if (finding.dismissed_at != null) continue;
      findings.push(finding);
    }
  }
  return findings;
}

export interface RoleGroupFiles {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Groups `files` (GitHub order, e.g. `pr.files`) by the smart-diff role, in
 * `SmartDiffRole` order, empty groups omitted. A path missing from `smartDiff`
 * (e.g. a race with a detail refresh that rewrote `pr_files`) falls into
 * `core` (docs/plans/smart-diff.md Decision 9).
 */
export function buildRoleGroups(files: PrFile[], smartDiff: SmartDiffResponse): RoleGroupFiles[] {
  const roleByPath = new Map<string, SmartDiffRole>();
  for (const group of smartDiff.groups) {
    for (const file of group.files) roleByPath.set(file.path, group.role);
  }

  const byRole = new Map<SmartDiffRole, PrFile[]>();
  for (const file of files) {
    const role = roleByPath.get(file.path) ?? "core";
    const bucket = byRole.get(role);
    if (bucket) bucket.push(file);
    else byRole.set(role, [file]);
  }

  return SMART_DIFF_ROLE_ORDER
    .filter((role) => (byRole.get(role)?.length ?? 0) > 0)
    .map((role) => ({ role, files: byRole.get(role)! }));
}

/** Distinct file paths carrying at least one current finding. */
export function pathsWithFindings(findings: FindingRecord[]): Set<string> {
  return new Set(findings.map((f) => f.file));
}

/** How many of `files` have at least one current finding. */
export function countFlaggedFiles(files: PrFile[], flaggedPaths: Set<string>): number {
  return files.filter((f) => flaggedPaths.has(f.path)).length;
}
