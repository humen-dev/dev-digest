import { describe, it, expect } from 'vitest';
import { PrBriefRecord } from '@devdigest/shared';
import { SEED_PR_482_BRIEF } from '../src/db/seed-brief.js';

/** New-side hunk ranges of the `pr_files` rows seeded for PR #482 in `src/db/seed.ts`. */
const SEEDED_HUNKS: Record<string, [number, number][]> = {
  'src/middleware/ratelimit.ts': [[1, 10]],
  'src/api/public/webhooks.ts': [[3, 15]],
  'src/config.ts': [[1, 13]],
  'src/api/users.ts': [[40, 47]],
  'pnpm-lock.yaml': [[120, 126]],
};

const inHunks = (file: string, line: number) =>
  (SEEDED_HUNKS[file] ?? []).some(([s, e]) => line >= s && line <= e);

describe('SEED_PR_482_BRIEF', () => {
  it('parses with PrBriefRecord and matches the seeded PR head', () => {
    const parsed = PrBriefRecord.parse(SEED_PR_482_BRIEF);
    expect(parsed.provenance.head_sha).toBe('a1b2c3d4e5f6');
    expect(parsed.provenance.model).toBe('seed');
    expect(parsed.provenance.cost_usd).toBeNull();
    expect(parsed.provenance.missing_sources).toEqual(['no_context_docs']);
  });

  it('has 3 risks and 4 focus items', () => {
    expect(SEED_PR_482_BRIEF.brief.risks.map((r) => [r.kind, r.severity])).toEqual([
      ['auth_surface', 'high'],
      ['dependency', 'medium'],
      ['performance', 'low'],
    ]);
    expect(SEED_PR_482_BRIEF.brief.review_focus).toHaveLength(4);
  });

  it('every focus line lies inside a seeded hunk — AC-71', () => {
    for (const f of SEED_PR_482_BRIEF.brief.review_focus) {
      expect(f.line, f.file).not.toBeNull();
      expect(inHunks(f.file, f.line!), `${f.file}:${f.line}`).toBe(true);
    }
  });

  it('every risk file_ref range lies inside a seeded hunk', () => {
    for (const ref of SEED_PR_482_BRIEF.brief.risks.flatMap((r) => r.file_refs)) {
      const m = /^(.+):(\d+)(?:-(\d+))?$/.exec(ref);
      expect(m, ref).not.toBeNull();
      const [, file, start, end] = m!;
      expect(inHunks(file!, Number(start)), ref).toBe(true);
      expect(inHunks(file!, Number(end ?? start)), ref).toBe(true);
    }
  });
});
