import type {
  EvalCase,
  EvalCaseMeta,
  EvalCaseOutcome,
  EvalExpectation,
  EvalRunDetail,
  EvalRunMetrics,
  EvalRunRecord,
  EvalSkillRef,
  LLMProvider,
  Provider,
  ReviewStrategy,
  UnifiedDiff,
} from '@devdigest/shared';

export interface FindingSource {
  finding_id: string;
  file: string;
  start_line: number;
  end_line: number;
  title: string;
  severity: string;
  category: string;
  accepted_at: string | null;
  dismissed_at: string | null;
  agent_id: string | null;
  pr_id: string;
  pr_number: number;
  pr_title: string;
  pr_body: string | null;
}

export interface AgentSnapshot {
  agent_id: string;
  name: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  strategy: ReviewStrategy | null;
  version: number;
  skills: { skill_id: string; name: string; type: string; body: string; enabled: boolean; version: number }[];
}

export interface NewCase {
  workspace_id: string;
  owner_id: string;
  name: string;
  notes: string | null;
  input_diff: string;
  input_files: string[];
  input_meta: EvalCaseMeta;
  expectation: EvalExpectation;
  source_finding_id: string | null;
  severity: string | null;
  category: string | null;
}

export interface NewRun {
  workspace_id: string;
  owner_id: string;
  agent_version: number;
  skills_fingerprint: EvalSkillRef[];
  case_ids: string[];
}

export interface RunResult {
  metrics: EvalRunMetrics;
  per_case: EvalCaseOutcome[];
  duration_ms: number;
  cost_usd: number | null;
}

export interface EvalRepositoryPort {
  findingSource(ws: string, findingId: string): Promise<FindingSource | null>;
  findingLink(ws: string, findingId: string): Promise<{ repo_id: string; pr_number: number } | null>;
  caseBySourceFinding(ws: string, findingId: string): Promise<EvalCase | null>;
  caseNames(ws: string, agentId: string): Promise<string[]>;
  /** ON CONFLICT (workspace_id, source_finding_id) returns the existing case with `created: false`. */
  insertCase(c: NewCase): Promise<{ case: EvalCase; created: boolean }>;
  getCase(ws: string, id: string): Promise<EvalCase | null>;
  listCases(ws: string, agentId: string): Promise<EvalCase[]>;
  countCases(ws: string, agentId: string): Promise<number>;
  updateCase(ws: string, id: string, patch: Partial<NewCase>): Promise<EvalCase | null>;
  deleteCase(ws: string, id: string): Promise<boolean>;
  agentSnapshot(ws: string, agentId: string): Promise<AgentSnapshot | null>;
  /** `agent_versions.config_json.system_prompt` for the given version. */
  agentSystemPrompt(agentId: string, version: number): Promise<string | null>;
  agentsWithCases(ws: string): Promise<{ agent_id: string; name: string; model: string; cases_total: number }[]>;
  /** `running` AND `heartbeat_at < cutoff` become `errored` with reason `interrupted`. Returns rows changed. */
  reconcileStale(cutoff: Date, ws?: string): Promise<number>;
  runningRun(ws: string, agentId: string): Promise<EvalRunRecord | null>;
  /** Null on an `eval_runs_one_running_uq` conflict. */
  insertRun(r: NewRun): Promise<string | null>;
  runExists(id: string): Promise<boolean>;
  heartbeat(id: string): Promise<void>;
  /** Applies only WHERE status = 'running'. */
  completeRun(id: string, r: RunResult): Promise<void>;
  /** Applies only WHERE status = 'running'. */
  failRun(id: string, reason: string): Promise<void>;
  getRun(ws: string, id: string): Promise<EvalRunDetail | null>;
  /** Newest first, no `per_case`, `skills_delta` = false. */
  listRuns(ws: string, agentId: string): Promise<EvalRunRecord[]>;
  /** No `per_case`. */
  recentRuns(ws: string, limit: number): Promise<EvalRunRecord[]>;
  completedOutcomes(ws: string, agentId: string, limit: number): Promise<{ run_id: string; per_case: EvalCaseOutcome[] }[]>;
}

export interface PrDiffSource {
  loadPrDiff(ws: string, prId: string): Promise<UnifiedDiff>;
}

export interface DiffParser {
  parse(raw: string): UnifiedDiff;
}

/** Throws `ConfigError` when the provider key is missing. */
export type LlmResolver = (provider: Provider) => Promise<LLMProvider>;

export interface EvalLog {
  info(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}
