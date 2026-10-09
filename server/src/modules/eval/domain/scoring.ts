import type {
  EvalActualFinding,
  EvalCase,
  EvalCaseOutcome,
  EvalExpectation,
  EvalRunMetrics,
  Finding,
} from '@devdigest/shared';

/** What the executor hands to scoring: the engine's grounded output for one case. */
export interface CaseExecution {
  findings: Finding[];
  grounding_kept: number;
  grounding_total: number;
  duration_ms: number;
  cost_usd: number | null;
}

/** The slice of an eval case that scoring needs. */
export type CaseRef = Pick<EvalCase, 'id' | 'name' | 'expectation'>;

type Range = { file: string; start_line: number; end_line: number };

/** Same file and an inclusive line-range intersection (reversed ranges are normalised). */
export function matches(finding: Range, e: Pick<EvalExpectation, 'file' | 'start_line' | 'end_line'>): boolean {
  if (finding.file !== e.file) return false;
  const fs = Math.min(finding.start_line, finding.end_line);
  const fe = Math.max(finding.start_line, finding.end_line);
  const es = Math.min(e.start_line, e.end_line);
  const ee = Math.max(e.start_line, e.end_line);
  return fs <= ee && es <= fe;
}

export function scoreCase(caseRef: CaseRef, exec: CaseExecution): EvalCaseOutcome {
  const actual: EvalActualFinding[] = exec.findings.map((f) => ({
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    severity: f.severity,
    category: f.category,
    title: f.title,
    rationale: f.rationale,
    matched: matches(f, caseRef.expectation),
  }));
  const matched = actual.filter((a) => a.matched).length;
  const pass = caseRef.expectation.type === 'must_find' ? matched >= 1 : matched === 0;
  return {
    case_id: caseRef.id,
    name: caseRef.name,
    expectation_type: caseRef.expectation.type,
    status: 'scored',
    pass,
    error_reason: null,
    findings_total: actual.length,
    findings_matched: matched,
    grounding_kept: exec.grounding_kept,
    grounding_total: exec.grounding_total,
    actual,
    duration_ms: exec.duration_ms,
    cost_usd: exec.cost_usd,
  };
}

export function erroredOutcome(caseRef: CaseRef, reason: string, durationMs: number): EvalCaseOutcome {
  return {
    case_id: caseRef.id,
    name: caseRef.name,
    expectation_type: caseRef.expectation.type,
    status: 'errored',
    pass: null,
    error_reason: reason,
    findings_total: 0,
    findings_matched: 0,
    grounding_kept: 0,
    grounding_total: 0,
    actual: [],
    duration_ms: durationMs,
    cost_usd: null,
  };
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

/** Errored cases are excluded from every metric and from `cases_passed`; `cases_total` counts all cases. */
export function scoreRun(outcomes: readonly EvalCaseOutcome[]): EvalRunMetrics {
  const scored = outcomes.filter((o) => o.status === 'scored');
  const mustFind = scored.filter((o) => o.expectation_type === 'must_find');
  const mustNot = scored.filter((o) => o.expectation_type === 'must_not_flag');

  const totalFindings = scored.reduce((n, o) => n + o.findings_total, 0);
  const falsePositives = mustNot.reduce((n, o) => n + o.findings_matched, 0);
  const matchedFindings = scored.reduce((n, o) => n + o.findings_matched, 0);
  const kept = scored.reduce((n, o) => n + o.grounding_kept, 0);
  const groundingTotal = scored.reduce((n, o) => n + o.grounding_total, 0);

  return {
    recall: ratio(mustFind.filter((o) => o.pass === true).length, mustFind.length),
    precision: totalFindings === 0 ? null : 1 - falsePositives / totalFindings,
    citation_accuracy: ratio(kept, groundingTotal),
    cases_passed: scored.filter((o) => o.pass === true).length,
    cases_total: outcomes.length,
    cases_errored: outcomes.length - scored.length,
    uncovered_findings: totalFindings - matchedFindings,
  };
}

/** Sum of the reported costs; null when no case reported one. */
export function runCost(outcomes: readonly EvalCaseOutcome[]): number | null {
  let sum: number | null = null;
  for (const o of outcomes) {
    if (o.cost_usd != null) sum = (sum ?? 0) + o.cost_usd;
  }
  return sum;
}
