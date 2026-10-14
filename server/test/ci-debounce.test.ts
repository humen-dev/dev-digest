import { describe, it, expect } from 'vitest';
import { shouldSkipDebounced } from '../src/modules/ci/domain/debounce.js';
import { classifyGithubError } from '../src/modules/ci/domain/github-errors.js';

const now = new Date('2026-10-12T12:00:00Z');
const ago = (s: number) => new Date(now.getTime() - s * 1000);

describe('shouldSkipDebounced (AC-74, NFR-5)', () => {
  it('29 s ago skips', () => expect(shouldSkipDebounced(ago(29), now, false)).toBe(true));
  it('31 s ago runs', () => expect(shouldSkipDebounced(ago(31), now, false)).toBe(false));
  it('force always runs', () => expect(shouldSkipDebounced(ago(1), now, true)).toBe(false));
  it('never refreshed runs', () => expect(shouldSkipDebounced(null, now, false)).toBe(false));
});

describe('classifyGithubError', () => {
  it('404 -> not_found', () => expect(classifyGithubError({ status: 404 })).toBe('not_found'));
  it('403 -> permission', () => expect(classifyGithubError({ status: 403 })).toBe('permission'));
  it('401 -> permission', () => expect(classifyGithubError({ response: { status: 401 } })).toBe('permission'));
  it('429 -> rate_limited', () => expect(classifyGithubError({ status: 429 })).toBe('rate_limited'));
  it('403 with exhausted rate limit -> rate_limited', () => {
    expect(classifyGithubError({ status: 403, response: { headers: { 'x-ratelimit-remaining': '0' } } })).toBe(
      'rate_limited',
    );
  });
  it('500, 413 and non-HTTP errors -> unavailable', () => {
    expect(classifyGithubError({ status: 500 })).toBe('unavailable');
    expect(classifyGithubError({ status: 413 })).toBe('unavailable');
    expect(classifyGithubError(new Error('ECONNRESET'))).toBe('unavailable');
    expect(classifyGithubError(undefined)).toBe('unavailable');
  });
});
