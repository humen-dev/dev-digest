/**
 * SPEC-07 refresh/ingest orchestration against in-memory ports (no DB, no network):
 * debounce, degraded mode, ignored runs, idempotence, states, links, timing.
 */
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { RunArtifact, WorkflowRun } from '@devdigest/shared';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { CiRefreshService } from '../src/modules/ci/refresh-service.js';
import { WORKFLOW_PATH, REFRESH_DEBOUNCE_MS, MAX_ARTIFACT_ZIP_BYTES } from '../src/modules/ci/constants.js';
import type {
  CiInstallationRecord,
  CiLogger,
  CiRepository,
  NewCiRunInput,
} from '../src/modules/ci/ports.js';

const SHA = 'b'.repeat(40);
const REPO = 'acme/app';
const NOW = new Date('2026-10-12T10:00:00Z');

function inst(over: Partial<CiInstallationRecord> = {}): CiInstallationRecord {
  return {
    id: over.id ?? 'inst-1',
    workspaceId: 'ws',
    agentId: 'agent-1',
    repo: REPO,
    targetType: 'gha',
    githubRepoId: 99,
    manifestSlug: 'a',
    triggers: ['opened'],
    postAs: 'github_review',
    workflowVersion: 'x'.repeat(12),
    generatorVersion: 1,
    agentVersion: 1,
    exportedCiFailOn: 'critical',
    prUrl: `https://github.com/${REPO}/pull/7`,
    state: 'pr_open',
    installedAt: NOW,
    updatedAt: null,
    lastRefreshedAt: null,
    ...over,
  };
}

function run(id: number, over: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id,
    run_attempt: 1,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'failure',
    head_sha: SHA,
    html_url: `https://github.com/${REPO}/actions/runs/${id}`,
    path: WORKFLOW_PATH,
    repository_id: 99,
    repository_full_name: REPO,
    repository_html_url: `https://github.com/${REPO}`,
    display_title: 't',
    created_at: '2026-10-12T09:00:00Z',
    run_started_at: '2026-10-12T09:00:05Z',
    pull_requests: [5],
    ...over,
  };
}

const art = (id: number): RunArtifact => ({ id, name: 'devdigest-result', size_in_bytes: 400, expired: false });

function zip(result: object, meta: object = goodMeta): Uint8Array {
  return zipSync({
    'devdigest-result.json': strToU8(JSON.stringify(result)),
    'devdigest-run.json': strToU8(JSON.stringify(meta)),
  });
}
const goodMeta = { commit_sha: SHA, repository: REPO, repository_id: 99, pr_number: 5, pr_title: 'Add things' };
const goodResult = { findings_count: 3, critical: 1, warning: 1, suggestion: 1, cost_usd: 0.02, agent: 'rev', duration_ms: 1200, verdict: 'comment', blockers: 1 };

function harness(installations: CiInstallationRecord[], gh: MockGitHubClient, opts: { token?: boolean } = {}) {
  const claimed = new Map<string, NewCiRunInput>();
  const states = new Map<string, string>();
  const touched: string[] = [];
  const linked: string[] = [];
  const agentRuns: unknown[] = [];
  const logs: { level: string; o: object; msg: string }[] = [];
  const repo = {
    listInstallations: async () => installations,
    hasRun: async (_ws: string, id: string) => claimed.has(id),
    claimRun: async (i: NewCiRunInput) => {
      if (claimed.has(i.providerRunId)) return null;
      claimed.set(i.providerRunId, i);
      return `ci-${i.providerRunId}`;
    },
    linkAgentRun: async (c: string) => void linked.push(c),
    setInstallationState: async (id: string, s: string) => void states.set(id, s),
    touchRefreshed: async (id: string) => void touched.push(id),
  } as unknown as CiRepository;
  const logger: CiLogger = {
    info: (o, msg) => void logs.push({ level: 'info', o, msg }),
    warn: (o, msg) => void logs.push({ level: 'warn', o, msg }),
  };
  const service = new CiRefreshService({
    repo,
    agents: { getById: async () => undefined },
    secretValues: { list: async () => [] },
    githubConnection: { hasToken: async () => opts.token !== false },
    runWriter: { insertCompletedCiRun: async (i) => (agentRuns.push(i), `ar-${agentRuns.length}`) },
    github: async () => gh,
    clock: { now: () => NOW },
    logger,
  });
  return { service, claimed, states, touched, linked, agentRuns, logs };
}

describe('CiRefreshService', () => {
  it('rejects a refresh without a GitHub token with 422 (EC-1)', async () => {
    const h = harness([inst()], new MockGitHubClient(), { token: false });
    await expect(h.service.refresh('ws', false)).rejects.toMatchObject({ details: { reason: 'github_not_connected' } });
  });

  it('downloads one artifact per completed run and reports counts (AC-73, AC-79)', async () => {
    const gh = new MockGitHubClient({
      workflowRuns: [run(1), run(2)],
      artifacts: { 1: [art(11)], 2: [art(12)] },
      artifactZips: { 11: zip(goodResult), 12: zip({ ...goodResult, findings_count: 0 }) },
    });
    const h = harness([inst()], gh);
    const out = await h.service.refresh('ws', false);
    expect(gh.calls.filter((c) => c.method === 'downloadArtifact')).toHaveLength(2);
    expect(out).toEqual({ checked: 1, ingested: 2, failed: 0, skipped_debounced: 0, degraded: false, reason: null });
    expect(h.claimed.get('2')!.status).toBe('no_findings');
    expect(h.linked).toHaveLength(2);
    expect(h.touched).toEqual(['inst-1']);
  });

  it('takes job and PR links from run metadata, ignoring URLs in the artifact (AC-80)', async () => {
    const gh = new MockGitHubClient({
      workflowRuns: [run(1)],
      artifacts: { 1: [art(11)] },
      artifactZips: { 11: zip({ ...goodResult, job_url: 'https://evil.example/x', pr_url: 'https://evil.example/pr' }) },
    });
    const h = harness([inst()], gh);
    await h.service.refresh('ws', false);
    const row = h.claimed.get('1')!;
    expect(row.jobUrl).toBe(`https://github.com/${REPO}/actions/runs/1`);
    expect(row.prUrl).toBe(`https://github.com/${REPO}/pull/5`);
  });

  it('stores PR number, title and link from run metadata, not the sidecar (AC-80)', async () => {
    const gh = new MockGitHubClient({
      workflowRuns: [run(1, { pull_requests: [7], display_title: 'Real title' })],
      artifacts: { 1: [art(11)] },
      artifactZips: { 11: zip(goodResult, { ...goodMeta, pr_number: 5, pr_title: 'spoofed' }) },
    });
    const h = harness([inst()], gh);
    await h.service.refresh('ws', false);
    expect(h.claimed.get('1')).toMatchObject({
      prNumber: 7,
      prTitle: 'Real title',
      prUrl: `https://github.com/${REPO}/pull/7`,
    });
  });

  it('stores null PR number and link when the run carries no pull request (AC-80)', async () => {
    const gh = new MockGitHubClient({
      workflowRuns: [run(1, { pull_requests: [] })],
      artifacts: { 1: [art(11)] },
      artifactZips: { 11: zip(goodResult) },
    });
    const h = harness([inst()], gh);
    await h.service.refresh('ws', false);
    expect(h.claimed.get('1')).toMatchObject({ prNumber: null, prUrl: null });
  });

  describe('rejected artifacts end to end (AC-77, UT-6, UT-7, EC-16, EC-17, EC-19)', () => {
    // Secret-shaped fixture built at runtime (server/INSIGHTS.md).
    const fakeKey = ['s', 'k-', 'x'.repeat(24)].join('');
    const rawZip = (res: string | undefined, m: string | undefined): Uint8Array => {
      const files: Record<string, Uint8Array> = {};
      if (res !== undefined) files['devdigest-result.json'] = strToU8(res);
      if (m !== undefined) files['devdigest-run.json'] = strToU8(m);
      return zipSync(files);
    };
    const J = JSON.stringify;
    const cases: { name: string; reason: string; run?: Partial<WorkflowRun>; artifact?: Partial<RunArtifact>; bytes?: Uint8Array; noDownload?: boolean }[] = [
      { name: 'expired', reason: 'artifact expired', artifact: { expired: true }, noDownload: true },
      { name: 'tooLarge', reason: 'artifact too large', artifact: { size_in_bytes: MAX_ARTIFACT_ZIP_BYTES + 1 }, noDownload: true },
      { name: 'badEntry', reason: 'artifact entry name invalid', bytes: zipSync({ '../x': strToU8('x') }) },
      { name: 'metadataMismatch', reason: 'metadata mismatch', bytes: rawZip(J(goodResult), J({ ...goodMeta, commit_sha: 'd'.repeat(40) })) },
      { name: 'secret', reason: 'secret-shaped content', bytes: rawZip(J({ ...goodResult, agent: fakeKey }), J(goodMeta)) },
      { name: 'resultSchema', reason: 'schema invalid: devdigest-result.json', bytes: rawZip('{"nope":1}', J(goodMeta)) },
      { name: 'metaSchema', reason: 'schema invalid: devdigest-run.json', bytes: rawZip(J(goodResult), '{"nope":1}') },
      { name: 'workflowPath', reason: 'workflow path mismatch', run: { path: '.github/workflows/other.yml' }, bytes: rawZip(J(goodResult), J(goodMeta)) },
    ];
    for (const c of cases) {
      it(`${c.name} → failed row with the reason, no counts, no agent run`, async () => {
        const gh = new MockGitHubClient({
          workflowRuns: [run(1, c.run)],
          artifacts: { 1: [{ ...art(11), ...c.artifact }] },
          artifactZips: c.bytes ? { 11: c.bytes } : {},
        });
        const h = harness([inst()], gh);
        const out = await h.service.refresh('ws', false);
        expect(out).toMatchObject({ ingested: 0, failed: 1 });
        expect(h.claimed.get('1')).toMatchObject({
          status: 'failed',
          failureReason: c.reason,
          findingsCount: null,
          critical: null,
          warning: null,
          suggestion: null,
          costUsd: null,
        });
        expect(h.agentRuns).toHaveLength(0);
        if (c.noDownload) expect(gh.calls.filter((x) => x.method === 'downloadArtifact')).toHaveLength(0);
        const text = JSON.stringify([h.claimed.get('1'), h.logs]);
        expect(text).not.toContain(fakeKey);
      });
    }
  });

  it('logs the error message when the agent run mirror fails, keeping the ci_runs row', async () => {
    const gh = new MockGitHubClient({
      workflowRuns: [run(1)],
      artifacts: { 1: [art(11)] },
      artifactZips: { 11: zip(goodResult) },
    });
    const h = harness([inst()], gh);
    const svc = new CiRefreshService({
      repo: (h.service as unknown as { deps: { repo: CiRepository } }).deps.repo,
      agents: { getById: async () => undefined },
      secretValues: { list: async () => [] },
      githubConnection: { hasToken: async () => true },
      runWriter: { insertCompletedCiRun: async () => { throw new Error('db down'); } },
      github: async () => gh,
      clock: { now: () => NOW },
    });
    const logs: { o: object; msg: string }[] = [];
    await svc.refresh('ws', false, { info: () => {}, warn: (o, msg) => void logs.push({ o, msg }) });
    expect(h.claimed.has('1')).toBe(true);
    expect(logs).toEqual([{ o: { run_id: 1, ci_run_id: 'ci-1', reason: 'db down' }, msg: 'ci run mirror failed' }]);
  });

  it('stores nothing for success / skipped / cancelled runs without an artifact (AC-85, EC-25)', async () => {
    const gh = new MockGitHubClient({
      workflowRuns: [run(1, { conclusion: 'success' }), run(2, { conclusion: 'skipped' }), run(3, { conclusion: 'cancelled' })],
    });
    const h = harness([inst()], gh);
    const out = await h.service.refresh('ws', false);
    expect(h.claimed.size).toBe(0);
    expect(h.agentRuns).toHaveLength(0);
    expect(out).toMatchObject({ ingested: 0, failed: 0 });
  });

  it('stores a failure run without an artifact as failed, no counts, no agent run (AC-77)', async () => {
    const h = harness([inst()], new MockGitHubClient({ workflowRuns: [run(1, { conclusion: 'failure' })] }));
    const out = await h.service.refresh('ws', false);
    expect(h.claimed.get('1')).toMatchObject({
      status: 'failed',
      failureReason: 'no result artifact',
      findingsCount: null,
      critical: null,
      costUsd: null,
    });
    expect(h.agentRuns).toHaveLength(0);
    expect(out.failed).toBe(1);
  });

  it('rejects a repository mismatch as failed with no counts (AC-75)', async () => {
    const gh = new MockGitHubClient({
      workflowRuns: [run(1, { repository_id: 5 })],
      artifacts: { 1: [art(11)] },
      artifactZips: { 11: zip(goodResult) },
    });
    const h = harness([inst()], gh);
    await h.service.refresh('ws', false);
    expect(h.claimed.get('1')).toMatchObject({ status: 'failed', failureReason: 'repository mismatch', findingsCount: null });
  });

  it('keeps counts for a failed post (EC-18) and mirrors the run', async () => {
    const gh = new MockGitHubClient({
      workflowRuns: [run(1)],
      artifacts: { 1: [art(11)] },
      artifactZips: { 11: zip({ ...goodResult, post_outcome: 'post_failed' }) },
    });
    const h = harness([inst()], gh);
    const out = await h.service.refresh('ws', false);
    expect(h.claimed.get('1')).toMatchObject({ status: 'failed', failureReason: 'posting to GitHub failed', findingsCount: 3 });
    expect(out).toMatchObject({ ingested: 0, failed: 1 });
  });

  it('does not store the same run id twice across refreshes (AC-78, EC-22)', async () => {
    const gh = new MockGitHubClient({
      workflowRuns: [run(1), run(1, { run_attempt: 2 })],
      artifacts: { 1: [art(11)] },
      artifactZips: { 11: zip(goodResult) },
    });
    const h = harness([inst()], gh);
    await h.service.refresh('ws', true);
    const first = { ...h.claimed.get('1')! };
    await h.service.refresh('ws', true);
    expect(h.claimed.size).toBe(1);
    expect(h.claimed.get('1')).toEqual(first);
    expect(h.agentRuns).toHaveLength(1);
  });

  it('persists installation states from the PR state and promotes ingested ones to active (AC-58)', async () => {
    const gh = new MockGitHubClient({
      prStates: { 1: 'merged', 2: 'closed', 3: 'open' },
      workflowRuns: [],
    });
    const h = harness(
      [
        inst({ id: 'a', repo: 'acme/a', prUrl: 'https://github.com/acme/a/pull/1' }),
        inst({ id: 'b', repo: 'acme/b', prUrl: 'https://github.com/acme/b/pull/2' }),
        inst({ id: 'c', repo: 'acme/c', prUrl: 'https://github.com/acme/c/pull/3', state: 'pr_closed' }),
      ],
      gh,
    );
    await h.service.refresh('ws', false);
    expect(h.states.get('a')).toBe('active');
    expect(h.states.get('b')).toBe('pr_closed');
    expect(h.states.get('c')).toBe('pr_open');

    const gh2 = new MockGitHubClient({ workflowRuns: [run(1)], artifacts: { 1: [art(11)] }, artifactZips: { 11: zip(goodResult) } });
    const h2 = harness([inst()], gh2);
    await h2.service.refresh('ws', false);
    expect(h2.states.get('inst-1')).toBe('active');
  });

  it('skips a non-forced refresh within the debounce window without GitHub calls (AC-74, NFR-5)', async () => {
    const gh = new MockGitHubClient({ workflowRuns: [run(1)] });
    const recent = new Date(NOW.getTime() - REFRESH_DEBOUNCE_MS + 1000);
    const h = harness([inst({ lastRefreshedAt: recent })], gh);
    const out = await h.service.refresh('ws', false);
    expect(out).toEqual({ checked: 0, ingested: 0, failed: 0, skipped_debounced: 1, degraded: false, reason: null });
    expect(h.claimed.size).toBe(0);
    expect(h.touched).toEqual([]);
    const forced = await h.service.refresh('ws', true);
    expect(forced.checked).toBe(1);
  });

  it('reports degraded with a reason on a GitHub error and keeps the other installations going (EC-14)', async () => {
    class PerRepoGitHub extends MockGitHubClient {
      override async listWorkflowRuns(repo: { owner: string; name: string }): Promise<WorkflowRun[]> {
        if (repo.name === 'bad') throw Object.assign(new Error('boom'), { status: 503 });
        return [run(1, { conclusion: 'failure' })];
      }
    }
    const h = harness([inst({ id: 'bad', repo: 'acme/bad' }), inst({ id: 'good', repo: 'acme/good' })], new PerRepoGitHub());
    const out = await h.service.refresh('ws', false);
    expect(out).toMatchObject({ checked: 2, failed: 1, degraded: true, reason: 'GitHub is unavailable' });
    expect(h.touched).toEqual(['good']);
  });

  it('flags a rate limit as the degraded reason (EC-14)', async () => {
    const gh = new MockGitHubClient({ workflowRuns: Object.assign(new Error('API rate limit exceeded'), { status: 429 }) });
    const h = harness([inst()], gh);
    const out = await h.service.refresh('ws', false);
    expect(out).toMatchObject({ degraded: true, reason: 'GitHub rate limit reached', ingested: 0 });
  });

  it('leaves an in-progress run alone (EC-15)', async () => {
    const gh = new MockGitHubClient({ workflowRuns: [run(1, { status: 'in_progress', conclusion: null })] });
    const h = harness([inst()], gh);
    await h.service.refresh('ws', false);
    expect(h.claimed.size).toBe(0);
  });

  it('logs one summary line and one line per failed run, without secrets (NFR-11, AC-81)', async () => {
    const gh = new MockGitHubClient({ workflowRuns: [run(1, { conclusion: 'failure' })] });
    const h = harness([inst()], gh);
    await h.service.refresh('ws', false);
    const summary = h.logs.filter((l) => l.level === 'info');
    expect(summary).toHaveLength(1);
    expect(summary[0]!.o).toMatchObject({ checked: 1, failed: 1 });
    expect(h.logs.filter((l) => l.level === 'warn')).toEqual([
      { level: 'warn', o: { run_id: 1, reason: 'no result artifact' }, msg: 'ci run failed' },
    ]);
  });

  it('refreshes 10 installations of 20 runs at 100 ms latency within 10 s (NFR-4)', async () => {
    class SlowGitHub extends MockGitHubClient {
      override async listWorkflowRuns(): Promise<WorkflowRun[]> {
        await new Promise((r) => setTimeout(r, 100));
        return Array.from({ length: 20 }, (_, i) => run(i + 1, { conclusion: 'success' }));
      }
      override async listRunArtifacts(): Promise<RunArtifact[]> {
        await new Promise((r) => setTimeout(r, 100));
        return [];
      }
      override async getPullRequestState(): Promise<'open'> {
        await new Promise((r) => setTimeout(r, 100));
        return 'open';
      }
    }
    const installs = Array.from({ length: 10 }, (_, i) => inst({ id: `i${i}`, repo: `acme/r${i}` }));
    const h = harness(installs, new SlowGitHub());
    const started = Date.now();
    await h.service.refresh('ws', true);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});
