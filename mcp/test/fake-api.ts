// Test double for the DevDigestApi port + a ToolContext with a fake clock.
import { randomUUID } from 'node:crypto';
import { DEFAULT_API_URL, DEFAULTS, type McpConfig } from '../src/config.js';
import { ApiUnreachableError } from '../src/errors.js';
import type {
  ApiActiveRun, ApiAgent, ApiConventionBoard, ApiPull, ApiRepo, ApiReview, ApiRun,
} from '../src/domain/types.js';
import type { DevDigestApi } from '../src/ports.js';
import type { ToolContext } from '../src/tools/types.js';

export interface FakeData {
  repos: ApiRepo[];
  pulls: Record<string, ApiPull[]>; // repoId → pulls
  agents: ApiAgent[];
  runs: Record<string, ApiRun[]>; // prId → runs (newest first)
  active: Record<string, ApiActiveRun[]>; // prId → active runs
  reviews: Record<string, ApiReview[]>; // prId → reviews (newest first)
  conventions: Record<string, ApiConventionBoard>; // repoId → board
}

export interface FakeApiOptions {
  unreachable?: boolean; // every call throws ApiUnreachableError('http://fake')
  failOn?: Partial<Record<keyof DevDigestApi, Error>>;
  runStatusScript?: Record<string, (string | null)[]>; // runId → statuses returned by successive listRuns polls
}

export type FakeApi = DevDigestApi & {
  calls: { method: keyof DevDigestApi; args: unknown[] }[];
  data: FakeData;
};

export const IDS = {
  repo: '11111111-1111-4111-8111-111111111111',
  pull: '22222222-2222-4222-8222-222222222222',
  agentGeneral: '33333333-3333-4333-8333-333333333333',
  agentSecurity: '44444444-4444-4444-8444-444444444444',
} as const;

export function defaultData(): FakeData {
  return {
    repos: [{ id: IDS.repo, owner: 'acme', name: 'payments-api', full_name: 'acme/payments-api' }],
    pulls: {
      [IDS.repo]: [{ id: IDS.pull, number: 482, title: 'Add refund endpoint', status: 'open' }],
    },
    agents: [
      { id: IDS.agentGeneral, name: 'General', description: 'General-purpose reviewer', provider: 'openrouter', model: 'anthropic/claude-sonnet-5', enabled: true, ci_fail_on: 'critical' },
      { id: IDS.agentSecurity, name: 'Security', description: 'Security-focused reviewer', provider: 'openrouter', model: 'anthropic/claude-sonnet-5', enabled: true, ci_fail_on: 'warning' },
    ],
    runs: {},
    active: {},
    reviews: {},
    conventions: {},
  };
}

export function createFakeApi(seed?: Partial<FakeData>, opts: FakeApiOptions = {}): FakeApi {
  const data: FakeData = { ...defaultData(), ...seed };
  const calls: FakeApi['calls'] = [];
  const script = new Map(Object.entries(opts.runStatusScript ?? {}).map(([k, v]) => [k, [...v]]));

  async function enter(method: keyof DevDigestApi, args: unknown[]): Promise<void> {
    calls.push({ method, args });
    if (opts.unreachable) throw new ApiUnreachableError('http://fake');
    const err = opts.failOn?.[method];
    if (err) throw err;
  }

  const api: DevDigestApi = {
    async listRepos() {
      await enter('listRepos', []);
      return data.repos;
    },
    async listPulls(repoId) {
      await enter('listPulls', [repoId]);
      return data.pulls[repoId] ?? [];
    },
    async warmPull(prId) {
      await enter('warmPull', [prId]);
    },
    async listAgents() {
      await enter('listAgents', []);
      return data.agents;
    },
    async startReview(prId, agentId) {
      await enter('startReview', [prId, agentId]);
      const agent = data.agents.find((a) => a.id === agentId);
      const run_id = randomUUID();
      const agent_name = agent?.name ?? 'unknown';
      (data.runs[prId] ??= []).unshift({
        run_id, agent_id: agentId, agent_name, status: 'running', error: null,
        score: null, blockers: null, findings_count: null, ran_at: new Date(0).toISOString(),
      });
      (data.active[prId] ??= []).unshift({ run_id, agent_id: agentId, agent_name });
      return { run_id, agent_id: agentId, agent_name };
    },
    async listRuns(prId) {
      await enter('listRuns', [prId]);
      const runs = data.runs[prId] ?? [];
      for (const run of runs) {
        const statuses = script.get(run.run_id);
        if (statuses && statuses.length > 0) {
          run.status = statuses.length > 1 ? statuses.shift()! : statuses[0]!;
        }
      }
      return runs.map((r) => ({ ...r }));
    },
    async listActiveRuns(prId) {
      await enter('listActiveRuns', [prId]);
      return data.active[prId] ?? [];
    },
    async listReviews(prId) {
      await enter('listReviews', [prId]);
      return data.reviews[prId] ?? [];
    },
    async getConventions(repoId) {
      await enter('getConventions', [repoId]);
      return data.conventions[repoId] ?? { candidates: [], last_scan: null };
    },
  };

  return Object.assign(api, { calls, data });
}

export type FakeCtx = ToolContext & { progressEvents: unknown[] };

/** Fake clock: now() advances by each sleep(ms); sleep resolves immediately. */
export function makeCtx(api: DevDigestApi, over: Partial<ToolContext> = {}): FakeCtx {
  let clock = 0;
  const progressEvents: unknown[] = [];
  const config: McpConfig = { apiUrl: DEFAULT_API_URL, ...DEFAULTS };
  const ctx: ToolContext = {
    api,
    config,
    async progress(p) {
      progressEvents.push(p);
    },
    signal: new AbortController().signal,
    log() {},
    now: () => clock,
    async sleep(ms) {
      clock += ms;
    },
    ...over,
  };
  return Object.assign(ctx, { progressEvents });
}
