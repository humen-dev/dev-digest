import { describe, it, expect } from 'vitest';
import { decideRunOutcome, ciRunStatus } from '../src/modules/ci/domain/run-outcome.js';
import { ARTIFACT_NAME, MAX_ARTIFACT_ZIP_BYTES } from '../src/modules/ci/constants.js';

const art = (over: Partial<{ id: number; name: string; size_in_bytes: number; expired: boolean }> = {}) => ({
  id: 7,
  name: ARTIFACT_NAME,
  size_in_bytes: 1000,
  expired: false,
  ...over,
});
const done = (conclusion: string | null) => ({ status: 'completed', conclusion });

describe('decideRunOutcome', () => {
  it('ignores a run that is not completed (EC-15)', () => {
    expect(decideRunOutcome({ status: 'in_progress', conclusion: null }, [art()])).toBe('ignore');
  });

  it.each(['success', 'skipped', 'cancelled'])('ignores no artifact + %s (AC-85, EC-25)', (c) => {
    expect(decideRunOutcome(done(c), [])).toBe('ignore');
  });

  it('no artifact + failure -> noResult (AC-77, EC-16)', () => {
    expect(decideRunOutcome(done('failure'), [])).toEqual({ failure: 'noResult' });
  });

  it('ignores unrelated artifacts when ours is missing', () => {
    expect(decideRunOutcome(done('failure'), [art({ name: 'other' })])).toEqual({ failure: 'noResult' });
  });

  it('expired -> expired (EC-17)', () => {
    expect(decideRunOutcome(done('failure'), [art({ expired: true })])).toEqual({ failure: 'expired' });
  });

  it('zip over 1 MB is never downloaded (UT-4)', () => {
    expect(decideRunOutcome(done('success'), [art({ size_in_bytes: MAX_ARTIFACT_ZIP_BYTES + 1 })])).toEqual({
      failure: 'tooLarge',
    });
  });

  it('downloads a normal artifact, exactly at the cap', () => {
    expect(decideRunOutcome(done('failure'), [art({ id: 42, size_in_bytes: MAX_ARTIFACT_ZIP_BYTES })])).toEqual({
      download: 42,
    });
  });
});

describe('ciRunStatus', () => {
  it('post_failed -> failed with postFailed (EC-18)', () => {
    expect(ciRunStatus({ findings_count: 3, post_outcome: 'post_failed' })).toEqual({
      status: 'failed',
      reason: 'postFailed',
    });
  });
  it('findings -> succeeded', () => {
    expect(ciRunStatus({ findings_count: 2, post_outcome: 'posted' })).toEqual({ status: 'succeeded' });
  });
  it('none -> no_findings', () => {
    expect(ciRunStatus({ findings_count: 0 })).toEqual({ status: 'no_findings' });
  });
});
