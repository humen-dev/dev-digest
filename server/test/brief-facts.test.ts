import { describe, expect, it } from 'vitest';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { buildBriefInput, type BriefRawFacts } from '../src/modules/brief/domain/facts.js';

const blast = (over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse => ({
  changed_symbols: [{ name: 'foo', file: 'src/a.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'foo',
      callers: [
        { name: 'bar', file: 'src/b.ts', line: 12 },
        { name: 'bar', file: 'src/b.ts', line: 12 },
      ],
      endpoints_affected: ['GET /x'],
      crons_affected: ['nightly'],
    },
  ],
  summary: 'foo is called by bar',
  stats: { symbols: 1, callers: 1, endpoints: 1, crons: 1 },
  unattributed_endpoints: ['POST /y'],
  degraded: false,
  reason: null,
  ...over,
});

const raw = (over: Partial<BriefRawFacts> = {}): BriefRawFacts => ({
  pull: { title: 'Add foo', body: 'Body text' },
  files: [{ path: 'src/a.ts', additions: 3, deletions: 1, hunks: [[1, 10]] }],
  roles: new Map([['src/a.ts', 'core' as const]]),
  intent: { intent: 'Add foo', inScope: ['foo'], outOfScope: ['bar'], headSha: 'sha1' },
  currentHeadSha: 'sha1',
  blast: blast(),
  issue: { state: 'ok', number: 7, title: 'Need foo', body: 'Issue body' },
  docs: [{ path: 'specs/a.md', status: 'included', text: 'doc text' }],
  ...over,
});

describe('buildBriefInput', () => {
  it('includes every available item and reports nothing missing (AC-10)', () => {
    const { input, missing } = buildBriefInput(raw());
    expect(missing).toEqual([]);
    expect(input.pr).toEqual({ title: 'Add foo', body: 'Body text' });
    expect(input.totals).toEqual({ files: 1, additions: 3, deletions: 1 });
    expect(input.files[0]).toMatchObject({ path: 'src/a.ts', role: 'core', hunks: [[1, 10]] });
    expect(input.intent).toEqual({ intent: 'Add foo', in_scope: ['foo'], out_of_scope: ['bar'] });
    expect(input.blast).toEqual({
      summary: 'foo is called by bar',
      callers: [{ symbol: 'foo', name: 'bar', file: 'src/b.ts', line: 12 }],
      endpoints: ['GET /x', 'POST /y'],
      crons: ['nightly'],
    });
    expect(input.issue).toEqual({ number: 7, title: 'Need foo', body: 'Issue body' });
    expect(input.docs).toEqual([{ path: 'specs/a.md', text: 'doc text' }]);
  });

  it('no intent -> intent_not_detected (AC-15)', () => {
    const { input, missing } = buildBriefInput(raw({ intent: null }));
    expect(input.intent).toBeNull();
    expect(missing).toContain('intent_not_detected');
  });

  it('stale intent -> intent_stale and the intent is still present (AC-16)', () => {
    const { input, missing } = buildBriefInput(raw({ currentHeadSha: 'sha2' }));
    expect(missing).toContain('intent_stale');
    expect(input.intent?.intent).toBe('Add foo');
  });

  it('degraded blast keeps its facts (AC-17)', () => {
    const { input, missing } = buildBriefInput(raw({ blast: blast({ degraded: true, reason: 'no_data' }) }));
    expect(missing).toContain('blast_degraded:no_data');
    expect(input.blast?.callers).toHaveLength(1);
  });

  it('unavailable blast -> blast_unavailable', () => {
    const { input, missing } = buildBriefInput(raw({ blast: 'unavailable' }));
    expect(input.blast).toBeNull();
    expect(missing).toContain('blast_unavailable');
  });

  it('issue states (AC-20)', () => {
    expect(buildBriefInput(raw({ issue: { state: 'none' } })).missing).toContain('no_linked_issue');
    const un = buildBriefInput(raw({ issue: { state: 'unresolved' } }));
    expect(un.missing).toContain('linked_issue_unresolved');
    expect(un.input.issue).toBeNull();
  });

  it('caps a 10 000-char PR body at 4 000 chars + ellipsis (UT-2)', () => {
    const { input, missing } = buildBriefInput(raw({ pull: { title: 't', body: 'x'.repeat(10_000) } }));
    expect(input.pr.body).toBe('x'.repeat(4_000) + '…');
    expect(missing).toContain('pr_body_truncated');
  });

  it('caps the issue body likewise (UT-4)', () => {
    const { input, missing } = buildBriefInput(raw({ issue: { state: 'ok', number: 1, title: 'i', body: 'y'.repeat(10_000) } }));
    expect(input.issue?.body).toBe('y'.repeat(4_000) + '…');
    expect(missing).toContain('issue_body_truncated');
  });

  it('empty body -> pr_body_empty', () => {
    expect(buildBriefInput(raw({ pull: { title: 't', body: null } })).missing).toContain('pr_body_empty');
  });

  it('no included doc -> no_context_docs', () => {
    const { input, missing } = buildBriefInput(raw({ docs: [{ path: 'specs/a.md', status: 'skipped_secret', text: null }] }));
    expect(input.docs).toEqual([]);
    expect(missing).toContain('no_context_docs');
  });
});
