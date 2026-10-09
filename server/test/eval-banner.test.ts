import { describe, it, expect } from 'vitest';
import type { EvalCaseOutcome, EvalRunDetail, EvalRunMetrics } from '@devdigest/shared';
import { buildBanner } from '../src/modules/eval/domain/banner.js';

const outcome = (id: string, pass: boolean, type: 'must_find' | 'must_not_flag' = 'must_find'): EvalCaseOutcome => ({
  case_id: id,
  name: `n-${id}`,
  expectation_type: type,
  status: 'scored',
  pass,
  error_reason: null,
  findings_total: 0,
  findings_matched: 0,
  grounding_kept: 0,
  grounding_total: 0,
  actual: [],
  duration_ms: 1,
  cost_usd: null,
});

const run = (version: number, m: Partial<EvalRunMetrics>, per_case: EvalCaseOutcome[]): EvalRunDetail => ({
  id: `r${version}`,
  agent_id: 'a',
  agent_name: 'A',
  agent_version: version,
  skills_fingerprint: [],
  skills_delta: false,
  status: 'completed',
  error_reason: null,
  started_at: '2026-10-01T00:00:00Z',
  finished_at: null,
  duration_ms: null,
  cost_usd: null,
  case_ids: per_case.map((o) => o.case_id),
  metrics: {
    recall: 0.5,
    precision: 0.5,
    citation_accuracy: 0.5,
    cases_passed: 0,
    cases_total: per_case.length,
    cases_errored: 0,
    uncovered_findings: 0,
    ...m,
  },
  per_case,
});

describe('buildBanner', () => {
  it('names the metric with the largest change, direction, points and newer version', () => {
    const prev = run(7, { precision: 0.93 }, []);
    const latest = run(7, { precision: 0.91 }, []);
    expect(buildBanner(latest, prev)).toEqual({
      metric: 'precision',
      direction: 'down',
      points: 2,
      agent_version: 7,
      transitions: [],
    });
  });

  it('lists pass/fail flips, e.g. a must_not_flag case pass -> fail', () => {
    const prev = run(7, { precision: 0.93 }, [outcome('a', true, 'must_not_flag'), outcome('b', true)]);
    const latest = run(7, { precision: 0.91 }, [outcome('a', false, 'must_not_flag'), outcome('b', true)]);
    expect(buildBanner(latest, prev)?.transitions).toEqual([{ case_id: 'a', name: 'n-a', from: 'pass', to: 'fail' }]);
  });

  it('chooses the larger absolute change and skips null metrics', () => {
    const prev = run(1, { recall: 0.5, precision: null, citation_accuracy: 0.9 }, []);
    const latest = run(2, { recall: 0.8, precision: 0.1, citation_accuracy: 0.85 }, []);
    expect(buildBanner(latest, prev)).toMatchObject({ metric: 'recall', direction: 'up', points: 30, agent_version: 2 });
  });

  it('returns null when nothing is comparable or nothing moved', () => {
    expect(buildBanner(run(1, { recall: null, precision: null, citation_accuracy: null }, []), run(1, {}, []))).toBeNull();
    expect(buildBanner(run(1, {}, []), run(1, {}, []))).toBeNull();
  });
});
