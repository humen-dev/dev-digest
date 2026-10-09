import { describe, it, expect } from 'vitest';
import type { EvalCaseOutcome, EvalRunDetail, EvalRunRecord, EvalSkillRef } from '@devdigest/shared';
import {
  compareRuns,
  markSkillsDelta,
  promptLineDiff,
  skillsDiff,
} from '../src/modules/eval/domain/compare.js';
import { scoreRun } from '../src/modules/eval/domain/scoring.js';

const outcome = (id: string, pass: boolean, cost = 0.1): EvalCaseOutcome => ({
  case_id: id,
  name: `name-${id}`,
  expectation_type: 'must_find',
  status: 'scored',
  pass,
  error_reason: null,
  findings_total: pass ? 1 : 0,
  findings_matched: pass ? 1 : 0,
  grounding_kept: pass ? 1 : 0,
  grounding_total: pass ? 1 : 0,
  actual: [],
  duration_ms: 1,
  cost_usd: cost,
});

const detail = (
  id: string,
  version: number,
  per_case: EvalCaseOutcome[],
  fp: EvalSkillRef[] = [],
  case_ids = per_case.map((o) => o.case_id),
): EvalRunDetail => ({
  id,
  agent_id: 'ag',
  agent_name: 'Agent',
  agent_version: version,
  skills_fingerprint: fp,
  skills_delta: false,
  status: 'completed',
  error_reason: null,
  started_at: '2026-10-01T00:00:00Z',
  finished_at: '2026-10-01T00:01:00Z',
  duration_ms: 1,
  cost_usd: null,
  case_ids,
  metrics: scoreRun(per_case),
  per_case,
});

describe('eval compare', () => {
  it('computes deltas over common cases and lists the rest', () => {
    const older = detail('o', 1, [outcome('a', true), outcome('b', false), outcome('c', true)]);
    const newer = detail('n', 2, [outcome('a', true), outcome('b', true), outcome('d', false)]);
    const c = compareRuns(older, newer, { older: 'p', newer: 'p' });
    expect(c.common_case_ids).toEqual(['a', 'b']);
    expect(c.only_in_older).toEqual([{ case_id: 'c', name: 'name-c' }]);
    expect(c.only_in_newer).toEqual([{ case_id: 'd', name: 'name-d' }]);
    expect(c.metrics.recall).toEqual({ older: 0.5, newer: 1, delta: 0.5 });
    expect(c.metrics.cost_usd.older).toBeCloseTo(0.2);
    expect(c.metrics.cost_usd.newer).toBeCloseTo(0.2);
    expect(c.older).not.toHaveProperty('per_case');
  });

  it('prompt diff of a one-line change is one remove + one add', () => {
    const d = promptLineDiff('a\nb\nc', 'a\nB\nc');
    expect(d).toEqual([
      { op: 'same', text: 'a' },
      { op: 'remove', text: 'b' },
      { op: 'add', text: 'B' },
      { op: 'same', text: 'c' },
    ]);
    expect(promptLineDiff('x\ny', 'x\ny').every((l) => l.op === 'same')).toBe(true);
    const mid = promptLineDiff('1\n2\n3\n4\n5', '1\n3\n4\n6\n5');
    expect(mid.filter((l) => l.op === 'remove').map((l) => l.text)).toEqual(['2']);
    expect(mid.filter((l) => l.op === 'add').map((l) => l.text)).toEqual(['6']);
  });

  it('null prompt -> prompt_diff null + missing_snapshot_versions', () => {
    const o = detail('o', 3, [outcome('a', true)]);
    const n = detail('n', 4, [outcome('a', true)]);
    const c = compareRuns(o, n, { older: null, newer: 'x' });
    expect(c.prompt_diff).toBeNull();
    expect(c.missing_snapshot_versions).toEqual([3]);
    const both = compareRuns(o, detail('n2', 3, [outcome('a', true)]), { older: null, newer: null });
    expect(both.missing_snapshot_versions).toEqual([3]);
  });

  it('skills diff: added / removed / changed', () => {
    const a: EvalSkillRef[] = [
      { skill_id: 's1', name: 'alpha', version: 2 },
      { skill_id: 's2', name: 'beta', version: 1 },
    ];
    const b: EvalSkillRef[] = [
      { skill_id: 's1', name: 'alpha', version: 3 },
      { skill_id: 's3', name: 'gamma', version: 1 },
    ];
    expect(skillsDiff(a, b)).toEqual([
      { skill_id: 's1', name: 'alpha', change: 'changed', from_version: 2, to_version: 3 },
      { skill_id: 's2', name: 'beta', change: 'removed', from_version: 1, to_version: null },
      { skill_id: 's3', name: 'gamma', change: 'added', from_version: null, to_version: 1 },
    ]);
  });

  it('markSkillsDelta flags a changed fingerprint on the same agent version', () => {
    const rec = (id: string, version: number, fp: EvalSkillRef[], status: EvalRunRecord['status'] = 'completed') => {
      const { per_case: _p, ...r } = detail(id, version, [], fp);
      return { ...r, status };
    };
    const s2 = [{ skill_id: 's', name: 'S', version: 2 }];
    const s3 = [{ skill_id: 's', name: 'S', version: 3 }];
    const out = markSkillsDelta([rec('r3', 7, s3), rec('r2', 7, s2), rec('r1', 6, s2), rec('r0', 7, s2, 'errored')]);
    expect(out.map((r) => r.skills_delta)).toEqual([true, false, false, false]);
  });
});
