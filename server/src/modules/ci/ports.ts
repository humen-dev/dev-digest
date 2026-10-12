import type {
  CiFailOn,
  CiInstallationState,
  CiPostAs,
  CiRunStatus,
  CiRunSummary,
  CiRunsPage,
  CiRunsQuery,
  CiTarget,
  CiTrigger,
  Provider,
  ReviewStrategy,
  RunTrace,
  Verdict,
} from '@devdigest/shared';

/**
 * SPEC-07 — the CI module's ports (application ring). Plain interfaces: no ORM,
 * no framework, no SDK types. The `Container` adapts the agents / repos modules
 * and the filesystem to these shapes; the module never imports them.
 */

export interface CiAgentRecord {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  version: number;
}

export interface CiAgentSource {
  getById(ws: string, id: string): Promise<CiAgentRecord | undefined>;
}

/** Linked skills of an agent in the agent's order (enabled or not). */
export interface CiSkillSource {
  linkedSkills(agentId: string): Promise<{ name: string; body: string; enabled: boolean }[]>;
}

export interface CiRepoLookup {
  findByFullName(ws: string, fullName: string): Promise<{ id: string } | undefined>;
}

export interface RunnerBundleFile {
  relPath: string;
  contents: string;
}

/** `null` or `[]` means the bundle has not been built (EC-4). */
export interface RunnerBundleSource {
  load(): Promise<RunnerBundleFile[] | null>;
}

/** Every non-empty stored secret value — used only to refuse leaking them (AC-42). */
export interface WorkspaceSecretValues {
  list(): Promise<string[]>;
}

export interface GithubConnection {
  hasToken(): Promise<boolean>;
}

/** Writes the `agent_runs` row (+ trace) that mirrors an ingested CI run. */
export interface CiAgentRunWriter {
  insertCompletedCiRun(i: {
    workspaceId: string;
    agentId: string | null;
    model: string | null;
    ranAt: Date;
    durationMs: number | null;
    costUsd: number | null;
    findingsCount: number;
    blockers: number | null;
    trace: RunTrace;
  }): Promise<string>;
}

export interface CiLogger {
  info(o: object, msg: string): void;
  warn(o: object, msg: string): void;
}

export interface CiClock {
  now(): Date;
}

/** `CiInstallation` minus `outdated` / `last_run`, with Dates and the workspace id. */
export interface CiInstallationRecord {
  id: string;
  workspaceId: string;
  agentId: string;
  repo: string;
  targetType: CiTarget;
  githubRepoId: number | null;
  manifestSlug: string | null;
  triggers: CiTrigger[];
  postAs: CiPostAs | null;
  workflowVersion: string | null;
  generatorVersion: number | null;
  agentVersion: number | null;
  exportedCiFailOn: CiFailOn | null;
  prUrl: string | null;
  state: CiInstallationState | null;
  installedAt: Date;
  updatedAt: Date | null;
  lastRefreshedAt: Date | null;
}

export interface UpsertInstallationInput {
  workspaceId: string;
  agentId: string;
  repo: string;
  targetType: CiTarget;
  githubRepoId: number | null;
  /** Only used on insert — an existing row keeps its slug (AC-86). */
  manifestSlug: string;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  workflowVersion: string;
  generatorVersion: number;
  agentVersion: number;
  exportedCiFailOn: CiFailOn;
  prUrl: string | null;
  state: CiInstallationState;
}

export interface NewCiRunInput {
  workspaceId: string;
  ciInstallationId: string | null;
  agentId: string | null;
  repo: string;
  providerRunId: string;
  prNumber: number | null;
  prTitle: string | null;
  prUrl: string | null;
  commitSha: string | null;
  agentName: string | null;
  ranAt: Date;
  status: CiRunStatus;
  findingsCount: number | null;
  critical: number | null;
  warning: number | null;
  suggestion: number | null;
  verdict: Verdict | null;
  blockers: number | null;
  costUsd: number | null;
  durationMs: number | null;
  /** The GitHub Actions job URL. */
  jobUrl: string | null;
  failureReason: string | null;
  ingestedAt: Date;
}

export interface CiRepository {
  findInstallationByRepo(ws: string, repo: string): Promise<CiInstallationRecord | undefined>;
  listInstallations(ws: string, agentId?: string): Promise<CiInstallationRecord[]>;
  /** Keeps an existing `manifest_slug`. */
  upsertInstallation(i: UpsertInstallationInput): Promise<{ record: CiInstallationRecord; created: boolean }>;
  setInstallationState(id: string, state: CiInstallationState): Promise<void>;
  touchRefreshed(id: string, at: Date): Promise<void>;
  /** Read-only: memory rows with scope 'repo' for one imported repository. */
  memoryForRepo(ws: string, repoId: string): Promise<{ kind: string; content: string }[]>;
  hasRun(ws: string, providerRunId: string): Promise<boolean>;
  /** ON CONFLICT (workspace_id, provider_run_id) DO NOTHING; null when already stored. */
  claimRun(i: NewCiRunInput): Promise<string | null>;
  linkAgentRun(ciRunId: string, agentRunId: string): Promise<void>;
  listRuns(ws: string, q: CiRunsQuery): Promise<CiRunsPage>;
  lastRuns(ws: string, installationIds: string[]): Promise<Map<string, CiRunSummary>>;
  agentNames(ws: string): Promise<{ id: string; name: string }[]>;
}

/** Everything the service reads from outside its own module (container-wired). */
export interface CiSources {
  agents: CiAgentSource;
  skills: CiSkillSource;
  repos: CiRepoLookup;
  bundle: RunnerBundleSource;
  secretValues: WorkspaceSecretValues;
  githubConnection: GithubConnection;
}
