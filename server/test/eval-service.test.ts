import { describe, expect, it, vi } from 'vitest';
import type { EvalCaseOutcome } from '@devdigest/shared';
import { AppError, ConfigError, NotFoundError } from '../src/platform/errors.js';
import { EvalService } from '../src/modules/eval/service.js';
import { EVAL_AGENT_RUNS_MAX, EVAL_MAX_CASES, EVAL_RECENT_RUNS, EVAL_STALE_RUN_MS } from '../src/modules/eval/constants.js';
import type { PrDiffSource } from '../src/modules/eval/ports.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import {
  CapturingLog,
  FIXTURE_DIFF,
  FakeEvalRepo,
  OTHER_WS,
  REVIEW_ON_A2,
  WS,
  findingSource,
  snapshotOf,
  stubLlm,
  uuid,
  type StubLlm,
} from './helpers/eval-fakes.js';

interface Rig {
  repo: FakeEvalRepo;
  service: EvalService;
  log: CapturingLog;
  agentId: string;
  llmCalls: { n: number };
  setDiff(raw: string | Error): void;
}

function rig(opts: { llm?: StubLlm; resolve?: () => Promise<StubLlm> } = {}): Rig {
  const repo = new FakeEvalRepo();
  const agentId = uuid();
  repo.seedAgent(WS, snapshotOf(agentId));
  let diff: string | Error = FIXTURE_DIFF;
  const diffs: PrDiffSource = {
    async loadPrDiff() {
      if (diff instanceof Error) throw diff;
      return parseUnifiedDiff(diff);
    },
  };
  const llm = opts.llm ?? stubLlm(() => REVIEW_ON_A2);
  const llmCalls = { n: 0 };
  const service = new EvalService({
    repo,
    diffs,
    parser: { parse: parseUnifiedDiff },
    llm: async () => {
      llmCalls.n++;
      return opts.resolve ? opts.resolve() : llm;
    },
  });
  return { repo, service, log: new CapturingLog(), agentId, llmCalls, setDiff: (d) => (diff = d) };
}

async function code(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error('expected a rejection');
}

const finding = (r: Rig, over: Parameters<typeof findingSource>[0] = {}) => {
  const f = findingSource({ agent_id: r.agentId, ...over });
  r.repo.seedFinding(WS, f);
  return f;
};

describe('eval service — cases from findings', () => {
  it('dismissed → must_not_flag, accepted → must_find with the finding range; second POST returns the same case', async () => {
    const r = rig();
    const dismissed = finding(r, { accepted_at: null, dismissed_at: '2026-10-02T00:00:00.000Z' });
    const a = await r.service.createFromFinding(WS, dismissed.finding_id);
    expect(a.created).toBe(true);
    expect(a.case.expectation).toEqual({ type: 'must_not_flag', file: 'a.ts', start_line: 2, end_line: 2 });
    expect(a.case.name).toBe('missing-null-check');
    expect(a.case.owner_id).toBe(r.agentId);
    expect(a.case.input_files).toEqual(['a.ts']);
    expect(a.case.input_diff).not.toContain('b.ts');
    expect(a.case.input_meta).toMatchObject({ pr_number: 7, title: 'Add parser', body: 'Body text' });

    const accepted = finding(r, { start_line: 2, end_line: 3 });
    const b = await r.service.createFromFinding(WS, accepted.finding_id);
    expect(b.case.expectation).toEqual({ type: 'must_find', file: 'a.ts', start_line: 2, end_line: 3 });

    const again = await r.service.createFromFinding(WS, dismissed.finding_id);
    expect(again.created).toBe(false);
    expect(again.case.id).toBe(a.case.id);
  });

  it('when both timestamps are set the later one wins', async () => {
    const r = rig();
    const f = finding(r, { accepted_at: '2026-10-01T00:00:00.000Z', dismissed_at: '2026-10-03T00:00:00.000Z' });
    expect((await r.service.createFromFinding(WS, f.finding_id)).case.expectation.type).toBe('must_not_flag');
  });

  it('a later dismiss leaves the stored must_find unchanged', async () => {
    const r = rig();
    const f = finding(r);
    const first = await r.service.createFromFinding(WS, f.finding_id);
    r.repo.findings.get(f.finding_id)!.src.dismissed_at = '2026-10-09T00:00:00.000Z';
    const second = await r.service.createFromFinding(WS, f.finding_id);
    expect(second.created).toBe(false);
    expect(second.case.expectation.type).toBe('must_find');
    expect(second.case.id).toBe(first.case.id);
  });

  it('refuses with the 422 codes and the details the client reads', async () => {
    const r = rig();
    const untriaged = finding(r, { accepted_at: null, dismissed_at: null });
    expect((await code(r.service.createFromFinding(WS, untriaged.finding_id))).code).toBe('finding_not_triaged');

    const noAgent = finding(r, { agent_id: null });
    const e1 = await code(r.service.createFromFinding(WS, noAgent.finding_id));
    expect([e1.statusCode, e1.code]).toEqual([422, 'agent_unavailable']);

    const outside = finding(r, { start_line: 90, end_line: 91 });
    const e2 = await code(r.service.createFromFinding(WS, outside.finding_id));
    expect([e2.statusCode, e2.code]).toEqual([422, 'expectation_outside_diff']);
    expect(e2.details).toMatchObject({ file: 'a.ts', start_line: 90, end_line: 91, start: 90, end: 91 });

    const noFile = finding(r, { file: 'missing.ts' });
    expect((await code(r.service.createFromFinding(WS, noFile.finding_id))).code).toBe('diff_unavailable');

    r.setDiff(new NotFoundError('gone'));
    const ok = finding(r);
    expect((await code(r.service.createFromFinding(WS, ok.finding_id))).code).toBe('diff_unavailable');

    expect(await r.repo.listCases(WS, r.agentId)).toHaveLength(0);
  });

  it('rejects a frozen diff over 200 KB with size and limit', async () => {
    const r = rig();
    r.setDiff(
      ['diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts', '@@ -1,1 +1,2 @@', ' keep', `+${'x'.repeat(210_000)}`, ''].join('\n'),
    );
    const err = await code(r.service.createFromFinding(WS, finding(r).finding_id));
    expect(err.code).toBe('frozen_input_too_large');
    expect(err.details).toMatchObject({ limit: 204_800 });
    expect((err.details as { size: number }).size).toBeGreaterThan(204_800);
  });

  it('masks secrets in the stored diff and PR text', async () => {
    const r = rig();
    const token = `ghp_${'a1B2'.repeat(9)}`;
    const awsKey = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    r.setDiff(['diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts', '@@ -1,1 +1,2 @@', ' keep', `+const t = "${token}";`, ''].join('\n'));
    const f = finding(r, { pr_title: `use ${awsKey}`, pr_body: token });
    const { case: c } = await r.service.createFromFinding(WS, f.finding_id);
    expect(c.input_diff).not.toContain(token);
    expect(c.input_diff).toContain('ghp_XXXX');
    expect(c.input_meta.title).not.toContain(awsKey);
    expect(c.input_meta.body).not.toContain(token);
  });

  it('another workspace sees 404 for the finding', async () => {
    const r = rig();
    const f = finding(r);
    await expect(r.service.createFromFinding(OTHER_WS, f.finding_id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('eval service — manual cases and edits', () => {
  const input = {
    name: 'my-case',
    input_diff: FIXTURE_DIFF,
    pr_title: 'T',
    pr_body: null,
    expectation: { type: 'must_find' as const, file: 'a.ts', start_line: 2, end_line: 2 },
  };

  it('manual create has a null source and the same rules as edit', async () => {
    const r = rig();
    const c = await r.service.createManual(WS, r.agentId, input);
    expect(c.source_finding_id).toBeNull();
    expect(c.input_files).toEqual(['a.ts', 'b.ts']);
    const bad = await code(
      r.service.createManual(WS, r.agentId, { ...input, expectation: { ...input.expectation, start_line: 50, end_line: 50 } }),
    );
    expect(bad.code).toBe('expectation_outside_diff');
    await expect(r.service.createManual(OTHER_WS, r.agentId, input)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('patch updates the expectation; an invalid range changes nothing; delete removes the case', async () => {
    const r = rig();
    const c = await r.service.createManual(WS, r.agentId, input);
    const saved = await r.service.patchCase(WS, c.id, {
      expectation: { type: 'must_not_flag', file: 'b.ts', start_line: 2, end_line: 2 },
    });
    expect(saved.expectation.type).toBe('must_not_flag');

    const err = await code(
      r.service.patchCase(WS, c.id, { expectation: { type: 'must_find', file: 'b.ts', start_line: 40, end_line: 41 } }),
    );
    expect(err.code).toBe('expectation_outside_diff');
    expect((await r.repo.getCase(WS, c.id))!.expectation).toEqual(saved.expectation);

    await r.service.deleteCase(WS, c.id);
    await expect(r.service.deleteCase(WS, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(r.service.patchCase(OTHER_WS, c.id, { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('editing or deleting a case leaves a stored run identical', async () => {
    const r = rig();
    const a = r.repo.seedCase(WS, r.agentId);
    const b = r.repo.seedCase(WS, r.agentId);
    const { run_id } = await r.service.startRun(WS, r.agentId, r.log);
    await r.service.idle();
    const before = JSON.stringify(await r.service.getRun(WS, run_id));
    await r.service.patchCase(WS, a.id, { expectation: { type: 'must_not_flag', file: 'a.ts', start_line: 2, end_line: 2 } });
    await r.service.deleteCase(WS, b.id);
    expect(JSON.stringify(await r.service.getRun(WS, run_id))).toBe(before);
  });
});

describe('eval service — starting runs', () => {
  it('returns before the first case finishes, then stores every field', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    const r = rig({ llm: stubLlm(async () => (await gate, REVIEW_ON_A2)) });
    r.repo.seedCase(WS, r.agentId);
    r.repo.seedCase(WS, r.agentId, { expectation: { type: 'must_not_flag', file: 'b.ts', start_line: 2, end_line: 2 } });
    r.repo.seedCase(WS, r.agentId, { expectation: { type: 'must_find', file: 'a.ts', start_line: 2, end_line: 2 } });

    const started = await r.service.startRun(WS, r.agentId, r.log);
    expect(started.status).toBe('running');
    expect((await r.service.getRun(WS, started.run_id)).status).toBe('running');

    release();
    await r.service.idle();
    const run = await r.service.getRun(WS, started.run_id);
    expect(run.status).toBe('completed');
    expect(run.agent_version).toBe(1);
    expect(run.case_ids).toHaveLength(3);
    expect(run.per_case).toHaveLength(3);
    expect(run.per_case.every((o) => o.status === 'scored' && typeof o.findings_matched === 'number')).toBe(true);
    expect(run.metrics).toMatchObject({ cases_total: 3, cases_errored: 0, recall: 1 });
    expect(run.duration_ms).not.toBeNull();
    expect(run.cost_usd).toBeCloseTo(0.75);
    expect(run.finished_at).not.toBeNull();
  });

  it('uses the start snapshot for every case even when the prompt, skills or cases change mid-run', async () => {
    const llm = stubLlm((n) => {
      if (n === 0) {
        const a = r.repo.agents.get(r.agentId)!;
        a.snap = { ...a.snap, system_prompt: 'PROMPT-V2', version: 2 };
        r.repo.deleteCase(WS, caseB.id);
      }
      return REVIEW_ON_A2;
    });
    const r = rig({ llm });
    r.repo.seedCase(WS, r.agentId);
    const caseB = r.repo.seedCase(WS, r.agentId);
    const { run_id } = await r.service.startRun(WS, r.agentId, r.log);
    await r.service.idle();
    expect(llm.calls).toHaveLength(2);
    for (const c of llm.calls) {
      expect(c.system + c.user).toContain('PROMPT-V1');
      expect(c.system + c.user).not.toContain('PROMPT-V2');
    }
    const run = await r.service.getRun(WS, run_id);
    expect(run.agent_version).toBe(1);
    expect(run.per_case.map((o) => o.status)).toEqual(['scored', 'scored']);
  });

  it('stops before the next engine call when the run row disappears', async () => {
    const llm = stubLlm((n) => {
      if (n === 0) r.repo.runs.clear();
      return REVIEW_ON_A2;
    });
    const r = rig({ llm });
    r.repo.seedCase(WS, r.agentId);
    r.repo.seedCase(WS, r.agentId);
    await r.service.startRun(WS, r.agentId, r.log);
    await r.service.idle();
    expect(llm.calls).toHaveLength(1);
  });

  it('a failing case is errored with its reason and the others are scored', async () => {
    const llm = stubLlm((n) => {
      if (n === 1) throw new Error('provider exploded');
      return REVIEW_ON_A2;
    });
    const r = rig({ llm });
    for (let i = 0; i < 3; i++) r.repo.seedCase(WS, r.agentId);
    const { run_id } = await r.service.startRun(WS, r.agentId, r.log);
    await r.service.idle();
    const run = await r.service.getRun(WS, run_id);
    expect(run.status).toBe('completed');
    const statuses = run.per_case.map((o: EvalCaseOutcome) => o.status);
    expect(statuses).toEqual(['scored', 'errored', 'scored']);
    expect(run.per_case[1]!.error_reason).toBe('error');
    expect(JSON.stringify(run.per_case)).not.toContain('provider exploded');
    expect(run.metrics).toMatchObject({ cases_total: 3, cases_errored: 1, cases_passed: 2 });
  });

  it('a failure outside any case stores the run as errored with a reason', async () => {
    const r = rig();
    r.repo.seedCase(WS, r.agentId);
    r.repo.heartbeatThrows = true;
    const { run_id } = await r.service.startRun(WS, r.agentId, r.log);
    await r.service.idle();
    const run = await r.service.getRun(WS, run_id);
    expect(run.status).toBe('errored');
    expect(run.error_reason).toBe('internal_error');
    expect(run.error_reason).not.toContain('heartbeat');
  });

  it('refusals create no run: in flight, no cases, missing key, too many cases', async () => {
    const r = rig();
    r.repo.seedCase(WS, r.agentId);
    const runId = r.repo.seedRunningRun(WS, r.agentId);
    const e1 = await code(r.service.startRun(WS, r.agentId, r.log));
    expect([e1.statusCode, e1.code]).toEqual([409, 'run_in_flight']);
    expect(r.repo.runs.size).toBe(1);
    r.repo.runs.get(runId)!.detail.status = 'completed';

    const empty = uuid();
    r.repo.seedAgent(WS, snapshotOf(empty));
    const e2 = await code(r.service.startRun(WS, empty, r.log));
    expect([e2.statusCode, e2.code]).toEqual([422, 'no_cases']);

    const noKey = new EvalService({
      repo: r.repo,
      diffs: { loadPrDiff: async () => parseUnifiedDiff(FIXTURE_DIFF) },
      parser: { parse: parseUnifiedDiff },
      llm: async () => {
        throw new ConfigError('OPENAI_API_KEY is not configured');
      },
    });
    const e3 = await code(noKey.startRun(WS, r.agentId, r.log));
    expect([e3.statusCode, e3.code]).toEqual([422, 'provider_key_missing']);
    expect(e3.details).toEqual({ provider: 'openai' });

    const many = uuid();
    r.repo.seedAgent(WS, snapshotOf(many));
    for (let i = 0; i < EVAL_MAX_CASES + 1; i++) r.repo.seedCase(WS, many);
    const e4 = await code(r.service.startRun(WS, many, r.log));
    expect([e4.statusCode, e4.code]).toEqual([422, 'too_many_cases']);
    expect(e4.details).toEqual({ count: EVAL_MAX_CASES + 1, limit: EVAL_MAX_CASES });

    expect(r.repo.runs.size).toBe(1);
  });

  it('reconciles a stale running run before the in-flight guard', async () => {
    const r = rig();
    r.repo.seedCase(WS, r.agentId);
    const stale = r.repo.seedRunningRun(WS, r.agentId, EVAL_STALE_RUN_MS + 60_000);
    const started = await r.service.startRun(WS, r.agentId, r.log);
    await r.service.idle();
    expect(started.run_id).not.toBe(stale);
    const old = r.repo.runs.get(stale)!.detail;
    expect([old.status, old.error_reason]).toEqual(['errored', 'interrupted']);
  });

  it('reconcileOnBoot closes only runs past the stale window', async () => {
    const r = rig();
    const stale = r.repo.seedRunningRun(WS, r.agentId, EVAL_STALE_RUN_MS + 60_000);
    const other = uuid();
    r.repo.seedAgent(WS, snapshotOf(other));
    const live = r.repo.seedRunningRun(WS, other, 1_000);
    expect(await r.service.reconcileOnBoot(r.log)).toBe(1);
    expect(r.repo.runs.get(stale)!.detail.status).toBe('errored');
    expect(r.repo.runs.get(live)!.detail.status).toBe('running');
  });

  it('accepts runs for another workspace only as 404', async () => {
    const r = rig();
    r.repo.seedCase(WS, r.agentId);
    await expect(r.service.startRun(OTHER_WS, r.agentId, r.log)).rejects.toBeInstanceOf(NotFoundError);
    await expect(r.service.estimate(OTHER_WS, r.agentId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(r.service.listCases(OTHER_WS, r.agentId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(r.service.agentDetail(OTHER_WS, r.agentId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('logs ids, counts and metrics only — never diff or PR text', async () => {
    const r = rig();
    r.repo.seedCase(WS, r.agentId, { input_meta: { pr_id: null, pr_number: null, title: 'SECRET-TITLE', body: 'SECRET-BODY' } });
    await r.service.startRun(WS, r.agentId, r.log);
    await r.service.idle();
    const out = r.log.lines.join('\n');
    expect(out).toContain('eval run completed');
    for (const forbidden of ['fixtureSecretMarker', 'SECRET-TITLE', 'SECRET-BODY', 'PROMPT-V1', '+const']) {
      expect(out).not.toContain(forbidden);
    }
  });
});

describe('eval service — run all', () => {
  it('reports started / refused per agent', async () => {
    const r = rig();
    r.repo.seedCase(WS, r.agentId);
    r.repo.seedRunningRun(WS, r.agentId); // agent 1: in flight
    const free = uuid();
    r.repo.seedAgent(WS, snapshotOf(free, { name: 'Free' }));
    r.repo.seedCase(WS, free);
    const big = uuid();
    r.repo.seedAgent(WS, snapshotOf(big, { name: 'Big' }));
    for (let i = 0; i < EVAL_MAX_CASES + 1; i++) r.repo.seedCase(WS, big);

    const { results } = await r.service.runAll(WS, r.log);
    await r.service.idle();
    const by = new Map(results.map((x) => [x.agent_id, x]));
    expect(by.get(r.agentId)).toMatchObject({
      outcome: 'refused',
      reason: 'run_in_flight',
      run_id: null,
      details: { run_id: expect.any(String) },
    });
    expect(by.get(free)).toMatchObject({ outcome: 'started', reason: null, details: null });
    expect(by.get(free)!.run_id).toEqual(expect.any(String));
    expect(by.get(big)).toMatchObject({
      outcome: 'refused',
      reason: 'too_many_cases',
      details: { count: EVAL_MAX_CASES + 1, limit: EVAL_MAX_CASES },
    });
  });

  it('a refusal for a missing provider key carries the provider', async () => {
    const r = rig({
      resolve: async () => {
        throw new ConfigError('no key');
      },
    });
    r.repo.seedCase(WS, r.agentId);
    const { results } = await r.service.runAll(WS, r.log);
    expect(results[0]).toMatchObject({ outcome: 'refused', reason: 'provider_key_missing', details: { provider: 'openai' } });
  });
});

describe('eval service — read paths', () => {
  async function seeded() {
    const r = rig();
    r.repo.seedCase(WS, r.agentId, { expectation: { type: 'must_find', file: 'a.ts', start_line: 2, end_line: 2 } });
    r.repo.seedCase(WS, r.agentId, { expectation: { type: 'must_not_flag', file: 'a.ts', start_line: 2, end_line: 2 } });
    const first = await r.service.startRun(WS, r.agentId, r.log);
    await r.service.idle();
    const a = r.repo.agents.get(r.agentId)!;
    a.snap = { ...a.snap, system_prompt: 'PROMPT-V2', version: 2 };
    a.prompts.set(2, 'PROMPT-V2');
    const second = await r.service.startRun(WS, r.agentId, r.log);
    await r.service.idle();
    r.llmCalls.n = 0;
    return { r, first: first.run_id, second: second.run_id };
  }

  it('makes no LLM resolution or call on any GET path', async () => {
    const { r, first, second } = await seeded();
    const c = (await r.repo.listCases(WS, r.agentId))[0]!;
    await r.service.listCases(WS, r.agentId);
    await r.service.getCaseDetail(WS, c.id);
    await r.service.estimate(WS, r.agentId);
    await r.service.listRuns(WS, r.agentId);
    await r.service.getRun(WS, first);
    await r.service.dashboard(WS);
    await r.service.agentDetail(WS, r.agentId);
    await r.service.compare(WS, first, second);
    expect(r.llmCalls.n).toBe(0);
  });

  it('lists cases with their last outcome and details a case with source info', async () => {
    const { r, first } = await seeded();
    const list = await r.service.listCases(WS, r.agentId);
    expect(list.map((x) => x.last?.status)).toEqual(['pass', 'fail']);
    expect(list[0]!.last!.run_id).not.toBe(first); // newest completed run wins
    const f = findingSource({ agent_id: r.agentId });
    r.repo.seedFinding(WS, f);
    const sourced = await r.service.createFromFinding(WS, f.finding_id);
    expect(await r.service.getCaseDetail(WS, sourced.case.id)).toMatchObject({
      source: { repo_id: 'repo-1', pr_number: 7 },
      source_deleted: false,
      last_outcome: null,
    });
    r.repo.findings.clear();
    expect(await r.service.getCaseDetail(WS, sourced.case.id)).toMatchObject({ source: null, source_deleted: true });
  });

  it('builds the dashboard and agent detail from completed runs', async () => {
    const { r, first, second } = await seeded();
    const dash = await r.service.dashboard(WS);
    expect(dash.agents).toHaveLength(1);
    expect(dash.agents[0]!.latest!.id).toBe(second);
    expect(dash.agents[0]!.trend.map((p) => p.run_id)).toEqual([first, second]);
    expect(dash.recent_runs).toHaveLength(2);

    const detail = await r.service.agentDetail(WS, r.agentId);
    expect(detail).toMatchObject({ cases_total: 2, running: null });
    expect(detail.latest!.id).toBe(second);
    expect(detail.previous!.id).toBe(first);
    expect(detail.runs.map((x) => x.id)).toEqual([second, first]);
  });

  it('dashboard asks for a bounded window of completed runs, never the whole history', async () => {
    const { r, second } = await seeded();
    const spy = vi.spyOn(r.repo, 'latestCompletedRuns');
    const listSpy = vi.spyOn(r.repo, 'listRuns');
    const dash = await r.service.dashboard(WS);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(WS, [r.agentId], EVAL_RECENT_RUNS + 1);
    expect(listSpy).not.toHaveBeenCalled();
    expect(dash.agents[0]!.latest!.id).toBe(second);
    await r.service.agentDetail(WS, r.agentId);
    expect(listSpy).toHaveBeenCalledWith(WS, r.agentId, EVAL_AGENT_RUNS_MAX);
  });

  it('compares two runs of one agent and refuses the same id or different agents', async () => {
    const { r, first, second } = await seeded();
    const cmp = await r.service.compare(WS, second, first); // order of a/b does not matter
    expect(cmp.older.id).toBe(first);
    expect(cmp.newer.id).toBe(second);
    expect(cmp.common_case_ids).toHaveLength(2);
    expect(cmp.prompt_diff).not.toBeNull();

    const same = await code(r.service.compare(WS, first, first));
    expect([same.statusCode, same.code]).toEqual([422, 'invalid_compare_pair']);

    const other = uuid();
    r.repo.seedAgent(WS, snapshotOf(other));
    r.repo.seedCase(WS, other);
    const third = await r.service.startRun(WS, other, r.log);
    await r.service.idle();
    const cross = await code(r.service.compare(WS, first, third.run_id));
    expect(cross.code).toBe('invalid_compare_pair');

    await expect(r.service.compare(OTHER_WS, first, second)).rejects.toBeInstanceOf(NotFoundError);
    await expect(r.service.getRun(OTHER_WS, first)).rejects.toBeInstanceOf(NotFoundError);
  });
});
