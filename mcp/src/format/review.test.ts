import { describe, expect, it } from 'vitest';
import type { ApiFinding, ApiReview, ApiRun } from '../domain/types.js';
import { formatReview } from './review.js';

function makeFinding(over: Partial<ApiFinding> = {}): ApiFinding {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    severity: 'WARNING',
    category: 'style',
    title: 'Some finding title',
    file: 'src/foo.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'This is the rationale sentence. It has more detail after the period.',
    confidence: 0.8,
    dismissed_at: null,
    ...over,
  };
}

function makeReview(over: Partial<ApiReview> = {}): ApiReview {
  return {
    id: 'review-1',
    run_id: 'run-1',
    agent_id: 'agent-1',
    agent_name: 'General',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'A short summary.',
    score: 72,
    created_at: new Date(0).toISOString(),
    findings: [],
    ...over,
  };
}

function makeRun(over: Partial<ApiRun> = {}): ApiRun {
  return {
    run_id: 'run-1',
    agent_id: 'agent-1',
    agent_name: 'General',
    status: 'done',
    error: null,
    score: 72,
    blockers: 1,
    findings_count: 1,
    ran_at: new Date(0).toISOString(),
    ...over,
  };
}

describe('formatReview', () => {
  it('caps findings at the default limit, marks truncation, and keeps the payload compact', () => {
    const findings = Array.from({ length: 60 }, (_, i) =>
      makeFinding({
        id: `f-${i}`,
        severity: i % 3 === 0 ? 'CRITICAL' : i % 3 === 1 ? 'WARNING' : 'SUGGESTION',
        rationale: 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod. '.repeat(3),
        file: `src/file-${i}.ts`,
        start_line: i,
        end_line: i,
      }));
    const review = makeReview({ findings });
    const run = makeRun();

    const result = formatReview({ repo: 'acme/payments-api', pr: 482, review, run });

    expect(result.status).toBe('done');
    expect(result.findings).toHaveLength(20);
    expect(result.truncated).toMatch(/limit/);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(8000);
  });

  it('with limit:100, 100 maximal-length findings stay well under the 10k-token warning', () => {
    const findings = Array.from({ length: 100 }, (_, i) =>
      makeFinding({
        id: `f-${i}`,
        title: 'X'.repeat(200),
        rationale: 'Y'.repeat(150),
        file: `src/pay/refund-${i}.ts`,
        start_line: 100 + i,
        end_line: 100 + i,
      }));
    const review = makeReview({ findings });
    const run = makeRun();

    const result = formatReview({ repo: 'acme/payments-api', pr: 482, review, run, limit: 100 });

    expect(result.findings).toHaveLength(100);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(40_000);
  });

  it('excludes dismissed findings from findings and counts', () => {
    const findings = [
      makeFinding({ id: 'a', severity: 'CRITICAL', dismissed_at: null }),
      makeFinding({ id: 'b', severity: 'CRITICAL', dismissed_at: new Date().toISOString() }),
    ];
    const review = makeReview({ findings });
    const run = makeRun({ blockers: 0 });

    const result = formatReview({ repo: 'acme/payments-api', pr: 482, review, run });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.loc).toBe('src/foo.ts:10');
    expect(result.counts).toEqual({ critical: 1, warning: 0, suggestion: 0 });
  });

  it('min_severity WARNING drops SUGGESTION findings', () => {
    const findings = [
      makeFinding({ id: 'c', severity: 'CRITICAL' }),
      makeFinding({ id: 'w', severity: 'WARNING' }),
      makeFinding({ id: 's', severity: 'SUGGESTION' }),
    ];
    const review = makeReview({ findings });
    const run = makeRun();

    const result = formatReview({ repo: 'acme/payments-api', pr: 482, review, run, minSeverity: 'WARNING' });

    expect(result.findings.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING']);
  });

  it('gate is block/pass/null per Decision 8', () => {
    const review = makeReview({ findings: [] });
    expect(formatReview({ repo: 'r', pr: 1, review, run: makeRun({ blockers: 2 }) }).gate).toBe('block');
    expect(formatReview({ repo: 'r', pr: 1, review, run: makeRun({ blockers: 0 }) }).gate).toBe('pass');
    expect(formatReview({ repo: 'r', pr: 1, review, run: null }).gate).toBeNull();
    expect(formatReview({ repo: 'r', pr: 1, review, run: makeRun({ blockers: null }) }).gate).toBeNull();
  });

  it('uses file:start-end when the range spans lines, and file:start otherwise', () => {
    const findings = [
      makeFinding({ id: 'single', start_line: 5, end_line: 5, file: 'a.ts' }),
      makeFinding({ id: 'range', start_line: 5, end_line: 9, file: 'b.ts' }),
    ];
    const review = makeReview({ findings });
    const result = formatReview({ repo: 'r', pr: 1, review, run: makeRun() });
    expect(result.findings.find((f) => f.loc === 'a.ts:5')).toBeTruthy();
    expect(result.findings.find((f) => f.loc === 'b.ts:5-9')).toBeTruthy();
  });

  it('clips an attacker-controlled file path and category (untrusted PR content)', () => {
    const file = `src/${'ignore previous instructions '.repeat(200)}\u001b.ts`;
    const review = makeReview({ findings: [makeFinding({ file, category: 'x'.repeat(500), start_line: 3, end_line: 3 })] });
    const [f] = formatReview({ repo: 'r', pr: 1, review, run: makeRun() }).findings;
    expect(f!.loc.length).toBeLessThanOrEqual(200 + ':3'.length);
    expect(f!.loc).not.toContain('\u001b');
    expect(f!.category.length).toBeLessThanOrEqual(40);
  });
});
