import { describe, expect, it } from 'vitest';
import {
  buildFileTree,
  excerptOf,
  fitToBudget,
  isExcludedPath,
  isReadableInput,
} from '../src/modules/onboarding/domain/input.js';
import type { PromptInput } from '../src/modules/onboarding/types.js';

describe('isExcludedPath', () => {
  it('is true when a segment matches an excluded dir (AC-42 on)', () => {
    expect(isExcludedPath('resources/lib/x.js', ['lib'])).toBe(true);
  });

  it('is false with no excluded dirs configured (AC-42 off)', () => {
    expect(isExcludedPath('resources/lib/x.js', [])).toBe(false);
  });

  it('is true for a minified file name regardless of excluded dirs', () => {
    expect(isExcludedPath('dist/app.min.js', [])).toBe(true);
  });
});

describe('isReadableInput', () => {
  it('blocks .env (UT-6)', () => {
    expect(isReadableInput('.env', 10, 1_000_000)).toBe(false);
  });

  it('blocks .git/config (UT-6)', () => {
    expect(isReadableInput('.git/config', 10, 1_000_000)).toBe(false);
  });

  it('allows .env.example (UT-6)', () => {
    expect(isReadableInput('.env.example', 10, 1_000_000)).toBe(true);
  });

  it('blocks a file over maxBytes (UT-12)', () => {
    expect(isReadableInput('src/app.ts', 500 * 1024, 400 * 1024)).toBe(false);
  });

  it('allows an ordinary file under the size cap', () => {
    expect(isReadableInput('src/app.ts', 1024, 400 * 1024)).toBe(true);
  });
});

describe('buildFileTree', () => {
  it('caps a 1,201-path fixture at 300: ranked first, then the rest sorted (AC-39)', () => {
    const tracked = Array.from({ length: 1201 }, (_, i) => `file${String(i).padStart(4, '0')}.ts`);
    // Rank the LAST 10 tracked paths highest so they would otherwise sort to the tail.
    const ranked = tracked.slice(-10);

    const tree = buildFileTree(tracked, ranked, []);

    expect(tree).toHaveLength(300);
    expect(tree.slice(0, 10)).toEqual(ranked);
    // The remaining 290 are the lowest-sorted of what's left after removing the ranked tail.
    expect(tree.slice(10)).toEqual(tracked.slice(0, 290));
    // The ranked tail entries are not duplicated into the sorted remainder.
    expect(tree.slice(10)).not.toContain(ranked[0]);
  });

  it('never includes an excluded path, ranked or not', () => {
    const tracked = ['src/app.ts', 'vendor/lib.js', 'src/index.ts'];
    const tree = buildFileTree(tracked, ['vendor/lib.js', 'src/app.ts'], ['vendor']);
    expect(tree).toEqual(['src/app.ts', 'src/index.ts']);
  });
});

describe('excerptOf', () => {
  it('returns null when any line exceeds 1,000 chars (AC-41)', () => {
    expect(excerptOf('x'.repeat(5000))).toBeNull();
  });

  it('returns at most the first 120 lines otherwise', () => {
    const text = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const result = excerptOf(text);
    expect(result).not.toBeNull();
    expect(result?.split('\n')).toHaveLength(120);
    expect(result?.split('\n')[0]).toBe('line 0');
  });
});

describe('fitToBudget', () => {
  function makeInput(treeSize: number, excerptCount: number): PromptInput {
    return {
      repoName: 'acme/payments-api',
      tree: Array.from({ length: treeSize }, (_, i) => `file${i}.ts`),
      excerpts: Array.from({ length: excerptCount }, (_, i) => ({ path: `file${i}.ts`, text: 'x'.repeat(1000) })),
      commandFiles: [{ path: 'package.json', text: '{}' }],
    };
  }

  /** 1 token per tree entry + 1000 tokens per excerpt — crosses 20,000 around 27k. */
  function countTokens(i: PromptInput): number {
    return i.tree.length + i.excerpts.length * 1000;
  }

  it('shrinks the tree before dropping any excerpt, when that alone fits the budget (NFR-1)', () => {
    const input = makeInput(1500, 10); // 1,500 + 10,000 = 11,500 tokens
    const result = fitToBudget(input, countTokens, 11_000);

    expect(countTokens(result)).toBeLessThanOrEqual(11_000);
    // Shrinking the tree alone was enough — no excerpt was touched.
    expect(result.excerpts).toHaveLength(10);
    expect(result.tree.length).toBeLessThan(1500);
  });

  it('shrinks the tree fully, then also drops excerpts, when the tree alone cannot fit the budget', () => {
    const input = makeInput(2000, 25); // 2,000 + 25,000 = 27,000 tokens
    const result = fitToBudget(input, countTokens, 20_000);

    expect(countTokens(result)).toBeLessThanOrEqual(20_000);
    expect(result.tree).toHaveLength(0);
    expect(result.excerpts.length).toBeLessThan(25);
  });

  it('drops excerpts from the tail once the tree is fully exhausted', () => {
    const input = makeInput(0, 25); // 25,000 tokens, nothing in the tree to shrink
    const result = fitToBudget(input, countTokens, 20_000);

    expect(countTokens(result)).toBeLessThanOrEqual(20_000);
    expect(result.excerpts).toHaveLength(20);
    // Dropped from the lowest-ranked (tail) end, kept the highest-ranked head.
    expect(result.excerpts[0]).toEqual(input.excerpts[0]);
  });

  it('never drops commandFiles', () => {
    const input = makeInput(0, 30);
    const result = fitToBudget(input, countTokens, 20_000);
    expect(result.commandFiles).toEqual(input.commandFiles);
  });

  it('defaults the budget to 20,000', () => {
    const input = makeInput(0, 25);
    const result = fitToBudget(input, countTokens);
    expect(countTokens(result)).toBeLessThanOrEqual(20_000);
  });
});
