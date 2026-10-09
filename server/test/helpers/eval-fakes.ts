import { randomUUID } from 'node:crypto';
import type {
  EvalCase,
  EvalCaseOutcome,
  EvalRunDetail,
  EvalRunRecord,
  LLMProvider,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import type {
  AgentSnapshot,
  EvalLog,
  EvalRepositoryPort,
  FindingSource,
  NewCase,
  NewRun,
  RunResult,
} from '../../src/modules/eval/ports.js';

export const WS = 'w1';
export const OTHER_WS = 'w2';

/** A diff whose first hunk covers new lines 1-3 of `a.ts`. */
export const FIXTURE_DIFF = [
  'diff --git a/a.ts b/a.ts',
  '--- a/a.ts',
  '+++ b/a.ts',
  '@@ -1,2 +1,3 @@',
  ' keep',
  '+const fixtureSecretMarker = 1;',
  ' tail',
  'diff --git a/b.ts b/b.ts',
  '--- a/b.ts',
  '+++ b/b.ts',
  '@@ -1,1 +1,2 @@',
  ' one',
  '+const other = 2;',
  '',
].join('\n');

export const uuid = (): string => randomUUID();

/** Plain in-memory logger that records every call as a JSON string. */
export class CapturingLog implements EvalLog {
  lines: string[] = [];
  info(obj: Record<string, unknown>, msg: string): void {
    this.lines.push(JSON.stringify({ obj, msg }));
  }
  error(obj: Record<string, unknown>, msg: string): void {
    this.lines.push(JSON.stringify({ obj, msg }));
  }
}

export function snapshotOf(id: string, over: Partial<AgentSnapshot> = {}): AgentSnapshot {
  return {
    agent_id: id,
    name: `Agent ${id.slice(0, 4)}`,
    provider: 'openai',
    model: 'gpt-test',
    system_prompt: 'PROMPT-V1',
    strategy: null,
    version: 1,
    skills: [],
    ...over,
  };
}

export function findingSource(over: Partial<FindingSource> = {}): FindingSource {
  return {
    finding_id: uuid(),
    file: 'a.ts',
    start_line: 2,
    end_line: 2,
    title: 'Missing null check',
    severity: 'WARNING',
    category: 'bug',
    accepted_at: '2026-10-01T10:00:00.000Z',
    dismissed_at: null,
    agent_id: null,
    pr_id: uuid(),
    pr_number: 7,
    pr_title: 'Add parser',
    pr_body: 'Body text',
    ...over,
  };
}

interface StoredRun {
  ws: string;
  detail: EvalRunDetail;
  heartbeat: number;
}

/** In-memory `EvalRepositoryPort` with the same workspace scoping and guards as the Drizzle one. */
export class FakeEvalRepo implements EvalRepositoryPort {
  private tick = Date.now();
  /** Strictly increasing so run ordering never ties within a millisecond. */
  clock = (): number => (this.tick += 1);
  agents = new Map<string, { ws: string; snap: AgentSnapshot; prompts: Map<number, string> }>();
  findings = new Map<string, { ws: string; src: FindingSource }>();
  cases: { ws: string; c: EvalCase }[] = [];
  runs = new Map<string, StoredRun>();
  calls: string[] = [];
  heartbeatThrows = false;

  seedAgent(ws: string, snap: AgentSnapshot): void {
    this.agents.set(snap.agent_id, { ws, snap, prompts: new Map([[snap.version, snap.system_prompt]]) });
  }
  seedFinding(ws: string, src: FindingSource): void {
    this.findings.set(src.finding_id, { ws, src });
  }
  seedCase(ws: string, agentId: string, over: Partial<EvalCase> = {}): EvalCase {
    const c: EvalCase = {
      id: uuid(),
      owner_kind: 'agent',
      owner_id: agentId,
      name: `case-${this.cases.length + 1}`,
      notes: null,
      input_diff: FIXTURE_DIFF,
      input_files: ['a.ts', 'b.ts'],
      input_meta: { pr_id: null, pr_number: null, title: 'T', body: null },
      expectation: { type: 'must_find', file: 'a.ts', start_line: 2, end_line: 2 },
      source_finding_id: null,
      severity: null,
      category: null,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      ...over,
    };
    this.cases.push({ ws, c });
    return c;
  }
  /** Inserts a running run directly (as a previous process / tab would have left it). */
  seedRunningRun(ws: string, agentId: string, heartbeatAgeMs = 0): string {
    const id = this.insertSync({ workspace_id: ws, owner_id: agentId, agent_version: 1, skills_fingerprint: [], case_ids: [] });
    this.runs.get(id)!.heartbeat = this.clock() - heartbeatAgeMs;
    return id;
  }
  allRuns(): EvalRunDetail[] {
    return [...this.runs.values()].map((r) => r.detail);
  }

  private insertSync(r: NewRun): string {
    const id = uuid();
    const agent = this.agents.get(r.owner_id);
    this.runs.set(id, {
      ws: r.workspace_id,
      heartbeat: this.clock(),
      detail: {
        id,
        agent_id: r.owner_id,
        agent_name: agent?.snap.name ?? null,
        agent_version: r.agent_version,
        skills_fingerprint: r.skills_fingerprint,
        skills_delta: false,
        status: 'running',
        error_reason: null,
        started_at: new Date(this.clock()).toISOString(),
        finished_at: null,
        duration_ms: null,
        cost_usd: null,
        case_ids: r.case_ids,
        metrics: null,
        per_case: [],
      },
    });
    return id;
  }

  async findingSource(ws: string, id: string) {
    const f = this.findings.get(id);
    return f && f.ws === ws ? f.src : null;
  }
  async findingLink(ws: string, id: string) {
    const f = this.findings.get(id);
    return f && f.ws === ws ? { repo_id: 'repo-1', pr_number: f.src.pr_number } : null;
  }
  async caseBySourceFinding(ws: string, id: string) {
    return this.cases.find((x) => x.ws === ws && x.c.source_finding_id === id)?.c ?? null;
  }
  async caseNames(ws: string, agentId: string) {
    return this.cases.filter((x) => x.ws === ws && x.c.owner_id === agentId).map((x) => x.c.name);
  }
  async insertCase(n: NewCase) {
    if (n.source_finding_id) {
      const dup = await this.caseBySourceFinding(n.workspace_id, n.source_finding_id);
      if (dup) return { case: dup, created: false };
    }
    const { workspace_id, ...rest } = n;
    const c = this.seedCase(workspace_id, n.owner_id, rest);
    return { case: c, created: true };
  }
  async getCase(ws: string, id: string) {
    return this.cases.find((x) => x.ws === ws && x.c.id === id)?.c ?? null;
  }
  async listCases(ws: string, agentId: string) {
    return this.cases.filter((x) => x.ws === ws && x.c.owner_id === agentId).map((x) => x.c);
  }
  async countCases(ws: string, agentId: string) {
    return (await this.listCases(ws, agentId)).length;
  }
  async updateCase(ws: string, id: string, patch: Partial<NewCase>) {
    const row = this.cases.find((x) => x.ws === ws && x.c.id === id);
    if (!row) return null;
    const { workspace_id: _w, owner_id: _o, ...rest } = patch;
    row.c = { ...row.c, ...rest, updated_at: new Date(this.clock()).toISOString() };
    return row.c;
  }
  async deleteCase(ws: string, id: string) {
    const before = this.cases.length;
    this.cases = this.cases.filter((x) => !(x.ws === ws && x.c.id === id));
    return this.cases.length < before;
  }
  async agentSnapshot(ws: string, agentId: string) {
    const a = this.agents.get(agentId);
    return a && a.ws === ws ? structuredClone(a.snap) : null;
  }
  async agentSystemPrompt(agentId: string, version: number) {
    return this.agents.get(agentId)?.prompts.get(version) ?? null;
  }
  async agentsWithCases(ws: string) {
    const out: { agent_id: string; name: string; model: string; cases_total: number }[] = [];
    for (const [id, a] of this.agents) {
      if (a.ws !== ws) continue;
      const n = this.cases.filter((x) => x.ws === ws && x.c.owner_id === id).length;
      if (n > 0) out.push({ agent_id: id, name: a.snap.name, model: a.snap.model, cases_total: n });
    }
    return out;
  }
  async reconcileStale(cutoff: Date, ws?: string) {
    let n = 0;
    for (const r of this.runs.values()) {
      if (r.detail.status === 'running' && r.heartbeat < cutoff.getTime() && (!ws || r.ws === ws)) {
        r.detail = { ...r.detail, status: 'errored', error_reason: 'interrupted', finished_at: new Date().toISOString() };
        n++;
      }
    }
    return n;
  }
  async runningRun(ws: string, agentId: string) {
    const r = [...this.runs.values()].find(
      (x) => x.ws === ws && x.detail.agent_id === agentId && x.detail.status === 'running',
    );
    return r ? this.record(r.detail) : null;
  }
  async insertRun(r: NewRun) {
    const running = [...this.runs.values()].some(
      (x) => x.detail.agent_id === r.owner_id && x.detail.status === 'running',
    );
    if (running) return null;
    this.calls.push('insertRun');
    return this.insertSync(r);
  }
  async runExists(id: string) {
    return this.runs.has(id);
  }
  async heartbeat(id: string) {
    if (this.heartbeatThrows) throw new Error('heartbeat store down');
    const r = this.runs.get(id);
    if (r) r.heartbeat = this.clock();
  }
  async completeRun(id: string, res: RunResult) {
    const r = this.runs.get(id);
    if (!r || r.detail.status !== 'running') return;
    r.detail = {
      ...r.detail,
      status: 'completed',
      metrics: res.metrics,
      per_case: res.per_case,
      duration_ms: res.duration_ms,
      cost_usd: res.cost_usd,
      finished_at: new Date(this.clock()).toISOString(),
    };
  }
  async failRun(id: string, reason: string) {
    const r = this.runs.get(id);
    if (!r || r.detail.status !== 'running') return;
    r.detail = { ...r.detail, status: 'errored', error_reason: reason, finished_at: new Date(this.clock()).toISOString() };
  }
  async getRun(ws: string, id: string) {
    const r = this.runs.get(id);
    return r && r.ws === ws ? structuredClone(r.detail) : null;
  }
  async listRuns(ws: string, agentId: string) {
    return this.sorted(ws, agentId).map((d) => this.record(d));
  }
  async recentRuns(ws: string, limit: number) {
    return this.sorted(ws).slice(0, limit).map((d) => this.record(d));
  }
  async completedOutcomes(ws: string, agentId: string, limit: number) {
    return this.sorted(ws, agentId)
      .filter((d) => d.status === 'completed')
      .slice(0, limit)
      .map((d) => ({ run_id: d.id, per_case: d.per_case as EvalCaseOutcome[] }));
  }

  private sorted(ws: string, agentId?: string): EvalRunDetail[] {
    return [...this.runs.values()]
      .filter((r) => r.ws === ws && (!agentId || r.detail.agent_id === agentId))
      .map((r) => r.detail)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
  }
  private record(d: EvalRunDetail): EvalRunRecord {
    const { per_case: _p, ...rec } = d;
    return rec;
  }
}

export const REVIEW_ON_A2 = {
  verdict: 'comment',
  summary: 's',
  score: 80,
  findings: [
    { id: 'f1', severity: 'WARNING', category: 'bug', title: 'ok', file: 'a.ts', start_line: 2, end_line: 2, rationale: 'r', confidence: 0.9 },
  ],
};

export interface StubLlm extends LLMProvider {
  calls: { system: string; user: string }[];
}

/** An LLM whose structured calls are answered by `handler` (receives the 0-based call index). */
export function stubLlm(handler: (n: number, req: StructuredRequest<unknown>) => Promise<unknown> | unknown): StubLlm {
  const calls: { system: string; user: string }[] = [];
  return {
    id: 'openai',
    calls,
    listModels: async () => [],
    complete: async () => {
      throw new Error('unexpected complete');
    },
    embed: async () => [],
    async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const n = calls.length;
      calls.push({
        system: req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n'),
        user: req.messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n'),
      });
      const data = await handler(n, req as StructuredRequest<unknown>);
      return { data: data as T, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0.5, apiCostUsd: 0.25, raw: '{}', attempts: 1 };
    },
  };
}
