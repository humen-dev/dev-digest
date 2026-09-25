import { describe, it, expect } from 'vitest';
import {
  classifyPath,
  isExcluded,
  isSafeRelativePath,
  pickDiversityExtras,
  truncateForSample,
} from '../src/modules/conventions/domain/sampling.js';

describe('conventions sampling — classifyPath', () => {
  it.each([
    ['src/api/users.test.ts', 'test'],
    ['server/test/foo.ts', 'test'],
    ['app/tests/test_models.py', 'test'],
    ['src/modules/skills/routes.ts', 'route'],
    ['src/users/users.controller.ts', 'route'],
    ['src/modules/skills/service.ts', 'service'],
    ['src/billing/billing.service.ts', 'service'],
    ['src/modules/skills/repository.ts', 'data'],
    ['src/db/schema/knowledge.ts', 'data'],
    ['client/src/lib/hooks/skills.ts', 'hook'],
    ['client/src/useCart.ts', 'hook'],
    ['src/components/Button.tsx', 'ui'],
    ['src/lib/format.ts', 'util'],
    ['src/user.ts', 'other'],
    ['src\\modules\\skills\\routes.ts', 'route'],
  ])('%s → %s', (path, bucket) => {
    expect(classifyPath(path)).toBe(bucket);
  });
});

describe('conventions sampling — safety & exclusion', () => {
  it.each(['../etc/passwd', 'a/../../b', '/abs/path.ts', 'C:\\x.ts', 'c:/x.ts', '', 'a\0b'])(
    'rejects unsafe path %j',
    (p) => expect(isSafeRelativePath(p)).toBe(false),
  );

  it('accepts plain relative paths (both separators)', () => {
    expect(isSafeRelativePath('src/a.ts')).toBe(true);
    expect(isSafeRelativePath('src\\a.ts')).toBe(true);
    expect(isSafeRelativePath('.github/CONTRIBUTING.md')).toBe(true);
  });

  it('excludes generated / vendored / migration files but NOT tests', () => {
    expect(isExcluded('src/types.d.ts')).toBe(true);
    expect(isExcluded('src/db/migrations/0001.ts')).toBe(true);
    expect(isExcluded('dist/index.js')).toBe(true);
    expect(isExcluded('src/vendor/shared/index.ts')).toBe(true);
    expect(isExcluded('src/a.test.ts')).toBe(false);
  });
});

describe('conventions sampling — pickDiversityExtras', () => {
  const ranked = [
    'src/modules/a/service.ts',
    'src/modules/a/routes.ts',
    'src/lib/util.ts',
    'src/components/Card.tsx',
    'test/a.test.ts',
    'test/b.test.ts',
    'src/modules/a/repository.ts',
    'src/db/migrations/0001.ts',
    'README.md',
  ].map((path) => ({ path }));

  it('fills uncovered buckets first, tests first, skipping chosen/excluded/non-code', () => {
    const chosen = ['src/modules/a/service.ts', 'src/modules/a/routes.ts'];
    const extras = pickDiversityExtras(ranked, chosen, 3);
    expect(extras).toEqual(['test/a.test.ts', 'src/modules/a/repository.ts', 'src/components/Card.tsx']);
    expect(extras).not.toContain('src/db/migrations/0001.ts');
    expect(extras).not.toContain('README.md');
  });

  it('then falls back to rank order when uncovered buckets run dry', () => {
    const extras = pickDiversityExtras(ranked, [], 10);
    expect(new Set(extras).size).toBe(extras.length);
    expect(extras).toHaveLength(7);
    expect(extras[0]).toBe('test/a.test.ts');
  });

  it('is deterministic and respects n <= 0', () => {
    expect(pickDiversityExtras(ranked, [], 4)).toEqual(pickDiversityExtras(ranked, [], 4));
    expect(pickDiversityExtras(ranked, [], 0)).toEqual([]);
  });
});

describe('conventions sampling — truncateForSample', () => {
  it('cuts by lines, then by chars at a line boundary', () => {
    const text = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
    expect(truncateForSample(text, { maxLines: 3, maxChars: 1000 })).toEqual({
      content: 'line 1\nline 2\nline 3',
      truncated: true,
    });
    const byChars = truncateForSample(text, { maxChars: 15 });
    expect(byChars.truncated).toBe(true);
    expect(byChars.content).toBe('line 1\nline 2');
    expect(truncateForSample('short', { maxChars: 100 })).toEqual({ content: 'short', truncated: false });
  });
});
