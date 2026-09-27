import type { SmartDiff, SmartDiffFile } from '@devdigest/shared';
import { SMART_DIFF_ROLE_ORDER } from '../constants.js';
import type { SmartDiffFindingRef, SmartDiffSourceFile } from '../types.js';
import { classifyFile } from './classify-file.js';

/**
 * Classify each file, bucket by role, emit groups in `SMART_DIFF_ROLE_ORDER`
 * skipping empty groups, keep the input file order inside a group, attach
 * de-duped/sorted `finding_lines` per path (docs/plans/smart-diff.md §3.2, Decision 18).
 */
export function buildSmartDiff(files: SmartDiffSourceFile[], findings: SmartDiffFindingRef[]): SmartDiff {
  const findingLinesByPath = new Map<string, Set<number>>();
  for (const f of findings) {
    const lines = findingLinesByPath.get(f.file) ?? new Set<number>();
    lines.add(f.startLine);
    findingLinesByPath.set(f.file, lines);
  }

  const byRole = new Map<string, SmartDiffFile[]>();
  for (const file of files) {
    const role = classifyFile(file.path);
    const lines = [...(findingLinesByPath.get(file.path) ?? [])].sort((a, b) => a - b);
    const entry: SmartDiffFile = {
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: lines,
    };
    const bucket = byRole.get(role);
    if (bucket) bucket.push(entry);
    else byRole.set(role, [entry]);
  }

  const groups = SMART_DIFF_ROLE_ORDER.filter((role) => (byRole.get(role)?.length ?? 0) > 0).map((role) => ({
    role,
    files: byRole.get(role)!,
  }));

  const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  return {
    groups,
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
