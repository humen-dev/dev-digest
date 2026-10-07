import { describe, expect, it } from 'vitest';
import { fitToBudget } from '../src/modules/brief/domain/budget.js';
import { buildBriefMessages } from '../src/modules/brief/domain/prompt.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';
import type { BriefInput } from '../src/modules/brief/types.js';

function fixture(o: { callers: number; crons: number; endpoints: number; files: number; docs: number; docText?: string }): BriefInput {
  return {
    pr: { title: 'Title', body: 'Body' },
    totals: { files: o.files, additions: 100, deletions: 10 },
    files: Array.from({ length: o.files }, (_, i) => ({
      path: `src/f${i}.ts`,
      additions: i + 1,
      deletions: 0,
      role: null,
      hunks: [[1, 5]] as [number, number][],
    })),
    intent: { intent: 'Intent', in_scope: [], out_of_scope: [] },
    blast: {
      summary: 'Summary',
      callers: Array.from({ length: o.callers }, (_, i) => ({ symbol: 's', name: `c${i}`, file: `src/c${i}.ts`, line: i + 1 })),
      endpoints: Array.from({ length: o.endpoints }, (_, i) => `GET /e${i}`),
      crons: Array.from({ length: o.crons }, (_, i) => `cron${i}`),
    },
    issue: { number: 9, title: 'Issue', body: 'Issue body' },
    docs: Array.from({ length: o.docs }, (_, i) => ({ path: `specs/d${i}.md`, text: o.docText ?? `doc ${i}` })),
  };
}

// Fake counter: one unit per droppable item, so the exact drop sequence is checkable.
const unitCount = (i: BriefInput): number =>
  100 + i.files.length + i.docs.length + (i.issue?.body ? 1 : 0) +
  (i.blast ? i.blast.callers.length + i.blast.crons.length + i.blast.endpoints.length : 0);

describe('fitToBudget', () => {
  const base = fixture({ callers: 22, crons: 2, endpoints: 22, files: 42, docs: 2 });
  // total = 100 + 42 + 2 + 1 + 22 + 2 + 22 = 191

  it('leaves an input that fits untouched', () => {
    const r = fitToBudget(base, unitCount, 1000);
    expect(r.dropped).toEqual([]);
    expect(r.fits).toBe(true);
    expect(r.tokens).toBe(191);
  });

  it('drops in AC-38 order and records each item (AC-38, AC-39)', () => {
    const r = fitToBudget(base, unitCount, 180);
    expect(r.dropped).toEqual([
      { kind: 'blast_caller', id: 'src/c21.ts:22' },
      { kind: 'blast_caller', id: 'src/c20.ts:21' },
      { kind: 'cron', id: 'cron1' },
      { kind: 'cron', id: 'cron0' },
      { kind: 'endpoint', id: 'GET /e21' },
      { kind: 'endpoint', id: 'GET /e20' },
      { kind: 'changed_file', id: 'src/f0.ts' },
      { kind: 'changed_file', id: 'src/f1.ts' },
      { kind: 'context_doc', id: 'specs/d1.md' },
      { kind: 'context_doc', id: 'specs/d0.md' },
      { kind: 'issue_body', id: '9' },
    ]);
    expect(r.fits).toBe(true);
    expect(r.tokens).toBe(180);
  });

  it('stops as soon as the input fits', () => {
    const r = fitToBudget(base, unitCount, 188);
    expect(r.dropped.map((d) => d.kind)).toEqual(['blast_caller', 'blast_caller', 'cron']);
  });

  it('does not mutate its input', () => {
    fitToBudget(base, unitCount, 180);
    expect(base.blast!.callers).toHaveLength(22);
    expect(base.docs).toHaveLength(2);
  });

  it('never drops protected items; fits=false when still over (AC-40)', () => {
    const r = fitToBudget(base, unitCount, 10);
    expect(r.fits).toBe(false);
    expect(r.input.pr).toEqual(base.pr);
    expect(r.input.intent).toEqual(base.intent);
    expect(r.input.totals).toEqual(base.totals);
    expect(r.input.blast?.summary).toBe('Summary');
    expect(r.input.blast?.callers).toHaveLength(20);
    expect(r.input.files).toHaveLength(40);
    expect(r.input.docs).toEqual([]);
  });

  it('fits an oversized fixture under 8 000 real tokens without cutting any item (NFR-1)', () => {
    const tok = new TiktokenTokenizer();
    const docText = 'Lorem ipsum dolor sit amet. '.repeat(400);
    const big = fixture({ callers: 80, crons: 10, endpoints: 80, files: 120, docs: 6, docText });
    const count = (i: BriefInput): number => tok.count(buildBriefMessages('system', i).map((m) => m.content).join('\n'));
    expect(count(big)).toBeGreaterThan(8_000);
    const r = fitToBudget(big, count, 8_000);
    expect(r.fits).toBe(true);
    expect(r.tokens).toBeLessThanOrEqual(8_000);
    expect(count(r.input)).toBe(r.tokens);
    for (const d of r.input.docs) expect(d.text).toBe(docText);
    expect(r.input.pr).toEqual(big.pr);
    expect(r.input.intent).toEqual(big.intent);
  });

  it('a 40 000-token intent cannot fit -> fits=false (AC-40)', () => {
    const tok = new TiktokenTokenizer();
    const huge = { ...fixture({ callers: 1, crons: 0, endpoints: 0, files: 1, docs: 1 }), intent: { intent: 'lorem ipsum '.repeat(20_000), in_scope: [], out_of_scope: [] } };
    const count = (i: BriefInput): number => tok.count(buildBriefMessages('system', i).map((m) => m.content).join('\n'));
    const r = fitToBudget(huge, count, 8_000);
    expect(r.fits).toBe(false);
    expect(r.input.intent?.intent).toBe(huge.intent.intent);
  });
});
