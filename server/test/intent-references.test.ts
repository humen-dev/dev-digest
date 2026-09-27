import { describe, expect, it } from 'vitest';
import { extractReferences } from '../src/modules/intent/domain/references.js';

const REPO = { owner: 'acme', name: 'payments-api' };

describe('extractReferences — linked issues', () => {
  it.each([
    ['Fixes #12', 12],
    ['closes #7', 7],
    ['Closed: #3', 3],
    ['resolves #40', 40],
    ['fix #9', 9],
  ])('%s → #%i', (body, number) => {
    expect(extractReferences(body, REPO, []).issues).toEqual([{ ref: `#${number}`, number }]);
  });

  it('dedupes and ignores bare #N without a closing verb', () => {
    const refs = extractReferences('Fixes #12, see #99. Also closes #12 and resolves #5', REPO, []);
    expect(refs.issues.map((i) => i.number)).toEqual([12, 5]);
  });
});
