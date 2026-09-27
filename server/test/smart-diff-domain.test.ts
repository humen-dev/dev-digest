import { describe, it, expect } from 'vitest';
import { buildSmartDiff } from '../src/modules/smart-diff/domain/build-smart-diff.js';
import { latestReviewIdsPerAgent } from '../src/modules/smart-diff/domain/current-findings.js';
import { SMART_DIFF_ROLE_ORDER } from '../src/modules/smart-diff/constants.js';
import type { ReviewMeta, SmartDiffFindingRef, SmartDiffSourceFile } from '../src/modules/smart-diff/types.js';

describe('SMART_DIFF_ROLE_ORDER', () => {
  it('equals the fixed display order (docs/plans/smart-diff.md §3.3)', () => {
    expect(SMART_DIFF_ROLE_ORDER).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
  });
});

describe('buildSmartDiff', () => {
  const files: SmartDiffSourceFile[] = [
    { path: 'README.md', additions: 2, deletions: 0 },
    { path: 'src/config.ts', additions: 4, deletions: 0 },
    { path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
    { path: 'src/middleware/ratelimit.test.ts', additions: 20, deletions: 0 },
  ];

  it('groups files by role in SMART_DIFF_ROLE_ORDER, omits empty groups, keeps input order inside a group', () => {
    const result = buildSmartDiff(files, []);
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs']);
    const core = result.groups.find((g) => g.role === 'core')!;
    expect(core.files.map((f) => f.path)).toEqual(['src/config.ts', 'src/middleware/ratelimit.ts']);
  });

  it('dedupes and sorts finding_lines ascending per path; ignores findings on a path not in the PR', () => {
    const findings: SmartDiffFindingRef[] = [
      { file: 'src/config.ts', startLine: 12 },
      { file: 'src/config.ts', startLine: 12 },
      { file: 'src/config.ts', startLine: 5 },
      { file: 'src/middleware/ratelimit.ts', startLine: 40 },
      { file: 'not-in-pr.ts', startLine: 1 },
    ];
    const result = buildSmartDiff(files, findings);
    const core = result.groups.find((g) => g.role === 'core')!;
    const config = core.files.find((f) => f.path === 'src/config.ts')!;
    const ratelimit = core.files.find((f) => f.path === 'src/middleware/ratelimit.ts')!;
    expect(config.finding_lines).toEqual([5, 12]);
    expect(ratelimit.finding_lines).toEqual([40]);
  });

  it('computes total_lines as the sum of additions+deletions over all files; proposed_splits stays empty', () => {
    const result = buildSmartDiff(files, []);
    expect(result.split_suggestion).toEqual({
      too_big: false,
      total_lines: 2 + 4 + 84 + 20,
      proposed_splits: [],
    });
  });
});

describe('latestReviewIdsPerAgent', () => {
  function review(id: string, agentId: string | null, createdAt: string): ReviewMeta {
    return { id, agentId, createdAt: new Date(createdAt) };
  }

  it('keeps only the newest review per agent; agent-less reviews share one bucket (newest wins)', () => {
    const reviews: ReviewMeta[] = [
      review('a-old', 'agent-a', '2026-01-01T00:00:00Z'),
      review('a-new', 'agent-a', '2026-01-02T00:00:00Z'),
      review('b-only', 'agent-b', '2026-01-01T00:00:00Z'),
      review('none-old', null, '2026-01-01T00:00:00Z'),
      review('none-new', null, '2026-01-03T00:00:00Z'),
    ];
    const ids = latestReviewIdsPerAgent(reviews).sort();
    expect(ids).toEqual(['a-new', 'b-only', 'none-new'].sort());
  });

  it('breaks ties on equal createdAt by the larger id (deterministic)', () => {
    const reviews: ReviewMeta[] = [
      review('r1', 'agent-a', '2026-01-01T00:00:00Z'),
      review('r2', 'agent-a', '2026-01-01T00:00:00Z'),
    ];
    expect(latestReviewIdsPerAgent(reviews)).toEqual(['r2']);
  });
});
