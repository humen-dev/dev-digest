import { describe, it, expect } from 'vitest';
import type { PrBriefRecord } from '@devdigest/shared';
import { buildPage, outcomePage, parseStoredRecord } from '../src/modules/brief/domain/page.js';

const record = (sha: string): PrBriefRecord => ({
  brief: { summary: 's', risks: [], review_focus: [] },
  provenance: {
    head_sha: sha, generated_at: '2026-10-07T00:00:00Z', provider: 'p', model: 'm', attempts: 1,
    tokens_in: 1, tokens_out: 1, cost_usd: null, context_docs: [], dropped_inputs: [], missing_sources: [],
  },
});

describe('parseStoredRecord', () => {
  it('returns null for invalid json', () => {
    expect(parseStoredRecord({})).toBeNull();
    expect(parseStoredRecord(null)).toBeNull();
  });
  it('returns the record when valid', () => {
    expect(parseStoredRecord(record('a'))).toEqual(record('a'));
  });
});

describe('buildPage', () => {
  it('none without a record', () => {
    const p = buildPage({ record: null, headSha: 'a', generating: false });
    expect(p).toMatchObject({ status: 'none', brief: null, provenance: null, reason: null, current_head_sha: 'a' });
  });
  it('generated when SHA equal', () => {
    expect(buildPage({ record: record('a'), headSha: 'a', generating: false }).status).toBe('generated');
  });
  it('outdated when SHA differs', () => {
    expect(buildPage({ record: record('a'), headSha: 'b', generating: false }).status).toBe('outdated');
  });
  it('generating wins, with or without a stored brief', () => {
    expect(buildPage({ record: null, headSha: 'a', generating: true })).toMatchObject({ status: 'generating', brief: null });
    expect(buildPage({ record: record('a'), headSha: 'a', generating: true })).toMatchObject({
      status: 'generating',
      brief: record('a').brief,
    });
  });
});

describe('outcomePage', () => {
  it('carries reason and keeps the stored brief', () => {
    expect(outcomePage('failed', 'timeout', record('a'), 'b')).toMatchObject({
      status: 'failed', reason: 'timeout', current_head_sha: 'b', brief: record('a').brief,
    });
    expect(outcomePage('refused', 'over_budget', null, 'b')).toMatchObject({ status: 'refused', brief: null });
  });
});
