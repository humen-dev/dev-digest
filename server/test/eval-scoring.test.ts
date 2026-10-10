import { describe, it, expect } from 'vitest';
import type { EvalCaseOutcome, EvalExpectation, Finding } from '@devdigest/shared';
import {
  erroredOutcome,
  matches,
  runCost,
  scoreCase,
  scoreRun,
  type CaseExecution,
} from '../src/modules/eval/domain/scoring.js';

const exp = (type: EvalExpectation['type'], start = 10, end = 12, file = 'a.ts'): EvalExpectation => ({
  type,
  file,
  start_line: start,
  end_line: end,
});

const finding = (file: string, start: number, end: number): Finding => ({
  id: `${file}:${start}`,
  severity: 'WARNING',
  category: 'bug',
  title: 't',
  file,
  start_line: start,
  end_line: end,
  rationale: 'r',
  confidence: 0.9,
});

const execOf = (findings: Finding[], kept = findings.length, total = kept): CaseExecution => ({
  findings,
  grounding_kept: kept,
  grounding_total: total,
  duration_ms: 5,
  cost_usd: 0.01,
});

const ref = (id: string, e: EvalExpectation) => ({ id, name: `case ${id}`, expectation: e });

describe('eval scoring: match rule', () => {
  const e = exp('must_find', 10, 12);
  it.each([
    ['overlap by exactly 1 line', 'a.ts', 12, 15, true],
    ['overlap on the first line', 'a.ts', 5, 10, true],
    ['adjacent range below', 'a.ts', 5, 9, false],
    ['adjacent range above', 'a.ts', 13, 20, false],
    ['other file', 'b.ts', 10, 12, false],
    ['reversed finding range inside', 'a.ts', 11, 10, true],
    ['many-line span touching by 1 line', 'a.ts', 1, 10, true],
    ['many-line span containing it', 'a.ts', 1, 500, true],
  ])('%s', (_n, file, s, en, want) => {
    expect(matches({ file, start_line: s, end_line: en }, e)).toBe(want);
  });

  it('does not touch the filesystem or normalise a traversal path', () => {
    const evil = exp('must_find', 1, 2, '../../etc/passwd');
    const out = scoreCase(ref('x', evil), execOf([finding('../../etc/passwd', 1, 1)]));
    expect(out.pass).toBe(true);
    expect(out.actual[0]?.matched).toBe(true);
  });
});

describe('eval scoring: case outcome', () => {
  it('must_find passes on >= 1 match, must_not_flag on 0 matches', () => {
    expect(scoreCase(ref('1', exp('must_find')), execOf([finding('a.ts', 11, 11)])).pass).toBe(true);
    expect(scoreCase(ref('2', exp('must_find')), execOf([finding('a.ts', 50, 51)])).pass).toBe(false);
    expect(scoreCase(ref('3', exp('must_not_flag')), execOf([finding('a.ts', 50, 51)])).pass).toBe(true);
    expect(scoreCase(ref('4', exp('must_not_flag')), execOf([finding('a.ts', 11, 11)])).pass).toBe(false);
  });

  it('errored outcome has no pass and no findings', () => {
    const o = erroredOutcome(ref('e', exp('must_find')), 'timeout', 120_000);
    expect(o).toMatchObject({ status: 'errored', pass: null, error_reason: 'timeout', actual: [], cost_usd: null });
  });
});

describe('eval scoring: run metrics', () => {
  it('recall 3/4, precision 0.75, citation 0.75', () => {
    const must = [
      scoreCase(ref('1', exp('must_find')), execOf([finding('a.ts', 10, 10)])),
      scoreCase(ref('2', exp('must_find')), execOf([finding('a.ts', 11, 11)])),
      scoreCase(ref('3', exp('must_find')), execOf([finding('a.ts', 12, 12)])),
      scoreCase(ref('4', exp('must_find')), execOf([])),
    ];
    expect(scoreRun(must).recall).toBe(0.75);

    // one must_not_flag case, 4 findings, 1 overlapping
    const mnf = scoreCase(
      ref('5', exp('must_not_flag')),
      execOf([finding('a.ts', 10, 10), finding('a.ts', 40, 40), finding('a.ts', 41, 41), finding('a.ts', 42, 42)]),
    );
    expect(scoreRun([mnf]).precision).toBe(0.75);

    // 4 total / 3 kept
    const cit = scoreCase(ref('6', exp('must_find')), execOf([finding('a.ts', 10, 10)], 3, 4));
    expect(scoreRun([cit]).citation_accuracy).toBe(0.75);
  });

  it('only must_not_flag cases -> recall null', () => {
    const o = scoreCase(ref('1', exp('must_not_flag')), execOf([]));
    expect(scoreRun([o]).recall).toBeNull();
  });

  it('zero findings -> precision and citation null, recall 0 with must_find cases', () => {
    const o = scoreCase(ref('1', exp('must_find')), execOf([]));
    expect(scoreRun([o])).toMatchObject({ recall: 0, precision: null, citation_accuracy: null });
  });

  it('all cases errored -> all metrics null, cases_errored = n', () => {
    const outs = [1, 2, 3].map((i) => erroredOutcome(ref(String(i), exp('must_find')), 'boom', 1));
    expect(scoreRun(outs)).toMatchObject({
      recall: null,
      precision: null,
      citation_accuracy: null,
      cases_passed: 0,
      cases_total: 3,
      cases_errored: 3,
    });
  });

  it('1 errored of 3 -> metrics over the 2 scored cases', () => {
    const outs = [
      scoreCase(ref('1', exp('must_find')), execOf([finding('a.ts', 10, 10)])),
      scoreCase(ref('2', exp('must_find')), execOf([])),
      erroredOutcome(ref('3', exp('must_find')), 'x', 1),
    ];
    expect(scoreRun(outs)).toMatchObject({ recall: 0.5, cases_passed: 1, cases_total: 3, cases_errored: 1 });
  });

  it('findings outside every expectation do not lower precision but are uncovered', () => {
    const outs = [
      scoreCase(ref('1', exp('must_find')), execOf([finding('a.ts', 10, 10), finding('a.ts', 90, 91), finding('z.ts', 1, 1)])),
    ];
    const m = scoreRun(outs);
    expect(m.precision).toBe(1);
    expect(m.uncovered_findings).toBe(2);
  });

  it('is deterministic over generated outcomes', () => {
    const outs: EvalCaseOutcome[] = Array.from({ length: 30 }, (_, i) =>
      scoreCase(
        ref(String(i), exp(i % 3 === 0 ? 'must_not_flag' : 'must_find', i, i + 2)),
        execOf(Array.from({ length: i % 4 }, (_, k) => finding('a.ts', i + k, i + k)), i % 4, (i % 4) + (i % 2)),
      ),
    );
    expect(scoreRun(outs)).toEqual(scoreRun(outs));
    expect(scoreRun([...outs])).toEqual(scoreRun(outs));
  });

  it('runCost sums reported costs and is null when none reported', () => {
    const a = scoreCase(ref('1', exp('must_find')), execOf([]));
    const b = { ...a, cost_usd: null };
    expect(runCost([a, a])).toBeCloseTo(0.02);
    expect(runCost([a, b])).toBeCloseTo(0.01);
    expect(runCost([b])).toBeNull();
    expect(runCost([])).toBeNull();
  });

  it('scoring never calls an LLM (pure functions over executions)', () => {
    const llm = new Proxy({}, { get: () => () => { throw new Error('LLM must not be called'); } });
    void llm;
    expect(() => scoreRun([scoreCase(ref('1', exp('must_find')), execOf([finding('a.ts', 10, 10)]))])).not.toThrow();
  });
});
