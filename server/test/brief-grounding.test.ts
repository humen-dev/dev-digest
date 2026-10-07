import { describe, it, expect } from 'vitest';
import { groundBrief } from '../src/modules/brief/domain/grounding.js';
import type { BriefDraft, GroundingContext, HunkRange } from '../src/modules/brief/types.js';

const ctx = (changed: Record<string, HunkRange[]>, blastOnly: string[] = []): GroundingContext => ({
  changedPaths: new Set(Object.keys(changed)),
  groundingSet: new Set([...Object.keys(changed), ...blastOnly]),
  hunksByPath: new Map(Object.entries(changed)),
});

const risk = (file_refs: string[], kind = 'other') => ({
  kind, title: 't', explanation: 'e', severity: 'low' as const, file_refs,
});
const draft = (d: Partial<BriefDraft>): BriefDraft => ({ summary: 's', risks: [], review_focus: [], ...d });
const focus = (file: string, line: number | null) => ({ file, line, reason: 'r' });

describe('groundBrief', () => {
  const c = ctx({ 'a.ts': [[1, 10]], 'del.ts': [] }, ['blast.ts']);

  it('drops an invented ref and a risk left with no ref', () => {
    const r = groundBrief(draft({ risks: [risk(['src/invented.ts']), risk(['a.ts', 'src/invented.ts'])] }), c);
    expect(r.brief.risks).toHaveLength(1);
    expect(r.brief.risks[0]!.file_refs).toEqual(['a.ts']);
    expect(r.drops).toEqual({ refs: 2, risks: 1, focus: 0 });
  });

  it('keeps a blast-only ref path, drops a blast-only focus file', () => {
    const r = groundBrief(draft({ risks: [risk(['blast.ts:4'])], review_focus: [focus('blast.ts', 1)] }), c);
    expect(r.brief.risks[0]!.file_refs).toEqual(['blast.ts']);
    expect(r.brief.review_focus).toEqual([]);
    expect(r.drops.focus).toBe(1);
  });

  it('nulls focus lines outside hunks, <=0, or in a deleted file', () => {
    const r = groundBrief(
      draft({ review_focus: [focus('a.ts', 999), focus('a.ts', 0), focus('a.ts', -2), focus('del.ts', 3), focus('a.ts', 5)] }),
      c,
    );
    expect(r.brief.review_focus.map((f) => f.line)).toEqual([null, null, null, null, 5]);
    const withNull = groundBrief(draft({ review_focus: [focus('a.ts', null)] }), c);
    expect(withNull.brief.review_focus.map((f) => f.line)).toEqual([null]);
  });

  it('downgrades out-of-hunk line refs to the bare path, keeps in-hunk ones', () => {
    const r = groundBrief(draft({ risks: [risk(['a.ts:999']), risk(['a.ts:3-5']), risk(['a.ts:8-20']), risk(['a.ts:7'])] }), c);
    expect(r.brief.risks.map((x) => x.file_refs)).toEqual([['a.ts'], ['a.ts:3-5'], ['a.ts'], ['a.ts:7']]);
  });

  it('normalises unknown kind to other, keeps known', () => {
    const r = groundBrief(draft({ risks: [risk(['a.ts'], 'weird'), risk(['a.ts'], 'dependency')] }), c);
    expect(r.brief.risks.map((x) => x.kind)).toEqual(['other', 'dependency']);
  });

  it('caps 9 risks / 8 focus items to 6 / 5 after grounding, keeping order', () => {
    const risks = [risk(['nope.ts']), ...Array.from({ length: 9 }, (_, i) => ({ ...risk(['a.ts']), title: `r${i}` }))];
    const items = Array.from({ length: 8 }, (_, i) => ({ file: 'a.ts', line: null, reason: `f${i}` }));
    const r = groundBrief(draft({ risks, review_focus: items }), c);
    expect(r.brief.risks.map((x) => x.title)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
    expect(r.brief.review_focus.map((x) => x.reason)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4']);
  });

  it('drops non-exact / unsafe paths', () => {
    const only = ctx({ 'a.ts': [[1, 5]] });
    const bad = ['./a.ts', 'A.ts', 'a.ts/', '/abs/a.ts', '../a.ts', 'x/../a.ts', 'C:\\a.ts', ''];
    const r = groundBrief(draft({ risks: bad.map((p) => risk([p])), review_focus: bad.map((p) => focus(p, 1)) }), only);
    expect(r.brief.risks).toEqual([]);
    expect(r.brief.review_focus).toEqual([]);
    expect(r.drops).toEqual({ refs: bad.length, risks: bad.length, focus: bad.length });
  });

  it('renamed file: old path dropped, new path kept', () => {
    const renamed = ctx({ 'new.ts': [[1, 3]] });
    const r = groundBrief(draft({ risks: [risk(['old.ts', 'new.ts'])], review_focus: [focus('old.ts', 1), focus('new.ts', 2)] }), renamed);
    expect(r.brief.risks[0]!.file_refs).toEqual(['new.ts']);
    expect(r.brief.review_focus).toEqual([{ file: 'new.ts', line: 2, reason: 'r' }]);
  });

  it('everything dropped yields an empty brief with the summary kept', () => {
    const r = groundBrief(draft({ risks: [risk(['x.ts'])], review_focus: [focus('x.ts', 1)] }), c);
    expect(r.brief).toEqual({ summary: 's', risks: [], review_focus: [] });
  });
});
