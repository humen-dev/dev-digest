import { describe, it, expect } from 'vitest';
import { caseNameFromTitle } from '../src/modules/eval/domain/naming.js';
import { EVAL_NAME_MAX } from '../src/modules/eval/constants.js';

const ID = '3f2a9c1e-7b44-4d0a-9a55-0123456789ab';

describe('caseNameFromTitle', () => {
  it('kebab-cases the title and suffixes clashes', () => {
    expect(caseNameFromTitle('Hardcoded Stripe secret key', ID, [])).toBe('hardcoded-stripe-secret-key');
    expect(caseNameFromTitle('Hardcoded Stripe secret key', ID, ['hardcoded-stripe-secret-key'])).toBe(
      'hardcoded-stripe-secret-key-2',
    );
    expect(
      caseNameFromTitle('Hardcoded Stripe secret key', ID, ['hardcoded-stripe-secret-key', 'hardcoded-stripe-secret-key-2']),
    ).toBe('hardcoded-stripe-secret-key-3');
  });

  it('falls back to case-<8 chars> when nothing survives', () => {
    expect(caseNameFromTitle('!!! ???', ID, [])).toBe('case-3f2a9c1e');
    expect(caseNameFromTitle('', ID, ['case-3f2a9c1e'])).toBe('case-3f2a9c1e-2');
  });

  it('keeps name plus suffix within the maximum', () => {
    const long = 'word '.repeat(60);
    const first = caseNameFromTitle(long, ID, []);
    expect(first.length).toBeLessThanOrEqual(EVAL_NAME_MAX);
    const second = caseNameFromTitle(long, ID, [first]);
    expect(second.length).toBeLessThanOrEqual(EVAL_NAME_MAX);
    expect(second).not.toBe(first);
    expect(second.endsWith('-2')).toBe(true);
  });
});
