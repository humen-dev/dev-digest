import type { FindingRecord } from '@devdigest/shared';
import type { RunsCursor } from './domain/runs-cursor.js';

/**
 * Ports of the multi-agent use case (application ring). Plain interfaces only —
 * no ORM, row or adapter types (server INSIGHTS 2026-09-22).
 */

export interface MultiRunRecord {
  id: string;
  prId: string;
  ranAt: Date;
}

export interface MultiRunRefRecord {
  id: string;
  prId: string;
  prNumber: number;
}

export interface LinkedRunInput {
  workspaceId: string;
  agentId: string;
  prId: string;
  provider: string | null;
  model: string | null;
  multiRunId: string;
}

/** One agent run of a multi-run with its (optional) agent, review and findings. */
export interface MultiRunColumnRecord {
  runId: string;
  agentId: string | null;
  /** null when the agent was deleted. */
  agentName: string | null;
  agentDescription: string | null;
  provider: string | null;
  model: string | null;
  status: string | null;
  error: string | null;
  durationMs: number | null;
  costUsd: number | null;
  score: number | null;
  ranAt: Date;
  finishedAt: Date | null;
  verdict: string | null;
  summary: string | null;
  reviewScore: number | null;
  findings: FindingRecord[];
}

/** One multi-run of the runs list, with its PR and repository. */
export interface MultiRunListRecord {
  id: string;
  prId: string;
  prNumber: number;
  prTitle: string;
  /** repos.full_name ("owner/name"). */
  repoName: string;
  ranAt: Date;
  /** ran_at as UTC text with microsecond precision — the keyset cursor value. */
  ranAtCursor: string;
}

/** One agent run of a listed multi-run (no findings, no review). */
export interface MultiRunAgentRecord {
  multiRunId: string;
  /** null when the agent was deleted. */
  agentName: string | null;
  status: string | null;
  finishedAt: Date | null;
  costUsd: number | null;
}

export interface PullSummary {
  id: string;
  number: number;
  title: string;
}

export interface MultiAgentRepositoryPort {
  getPull(workspaceId: string, prId: string): Promise<PullSummary | undefined>;
  /** A `running` agent run of the PR that belongs to a multi-run. */
  findInFlight(prId: string): Promise<{ multiRunId: string } | undefined>;
  /**
   * Atomically insert the multi-run and one `running` agent run per entry, all
   * linked to it (one transaction). `runIds` are in the order of `runs`.
   */
  createMultiRunWithRuns(
    workspaceId: string,
    prId: string,
    runs: Omit<LinkedRunInput, 'workspaceId' | 'prId' | 'multiRunId'>[],
  ): Promise<{ multiRun: MultiRunRecord; runIds: string[] }>;
  getRun(workspaceId: string, multiRunId: string): Promise<MultiRunRecord | undefined>;
  latestRunForPr(workspaceId: string, prId: string): Promise<MultiRunRecord | undefined>;
  latestRunForWorkspace(workspaceId: string): Promise<MultiRunRefRecord | undefined>;
  /** Ordered by agent_runs.ran_at, id. */
  columns(multiRunId: string): Promise<MultiRunColumnRecord[]>;
  /** Workspace multi-runs, `ran_at DESC, id DESC`, strictly older than `after` (keyset), at most `take`. */
  listRunsPage(workspaceId: string, after: RunsCursor | null, take: number): Promise<MultiRunListRecord[]>;
  /** Agent runs of the given multi-runs, ordered by agent_runs.ran_at, id. */
  agentRunsOf(multiRunIds: string[]): Promise<MultiRunAgentRecord[]>;
}

export interface MultiAgentAgentsPort {
  getById(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; name: string; provider: string; model: string } | undefined>;
}

/** Starts the concurrent execution of already-created runs (fire-and-forget after load). */
export interface MultiAgentBatchPort {
  start(
    workspaceId: string,
    prId: string,
    jobs: { agentId: string; runId: string }[],
    logger?: BatchLogger,
  ): Promise<void>;
}

export type BatchLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};
