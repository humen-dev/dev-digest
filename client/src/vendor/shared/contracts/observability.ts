import { z } from 'zod';
import { Severity } from './findings.js';
import { FindingRecord, ReviewRunTarget } from './review-api.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of GET /pulls/:id/multi-agent
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  match groups and each agent's take on them
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review (SPEC-07)
// ---------------------------------------------------------------------------

/** Body of POST /pulls/:id/multi-agent-run. [] → 422 (AC-29), > 50 → 422 (UT-9). */
export const MultiAgentRunRequest = z.object({
  agentIds: z.array(z.string().uuid()).min(1).max(50),
});
export type MultiAgentRunRequest = z.infer<typeof MultiAgentRunRequest>;

/** Response of POST /pulls/:id/multi-agent-run — returned before any agent completes (AC-23). */
export const MultiAgentRunTriggerResult = z.object({
  id: z.string(),
  pr_id: z.string(),
  targets: z.array(ReviewRunTarget),
});
export type MultiAgentRunTriggerResult = z.infer<typeof MultiAgentRunTriggerResult>;

/** A finding in a multi-agent column: the full persisted finding + its match group. */
export const AgentColumnFinding = FindingRecord.extend({ group_id: z.string() });
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

export const AgentRunStatus = z.enum(['running', 'done', 'failed', 'cancelled']);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  /** null when the agent was deleted (EC-4). */
  agent_id: z.string().nullable(),
  /** "Unknown agent" when the agent was deleted (EC-4). */
  agent_name: z.string(),
  /** '' when the agent was deleted. */
  agent_description: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: AgentRunStatus,
  /** Failure reason, secret-masked (UT-8). */
  error: z.string().nullable(),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(AgentColumnFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent run's stance on a match group. */
export const ConflictTake = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  /** Agent name. */
  persona: z.string(),
  /** Highest severity the agent gave in the group, or 'ignored' when it did not flag it. */
  verdict: z.union([Severity, z.literal('ignored')]),
  /** !== 'done' → the client shows the run status instead of a verdict (AC-53). */
  run_status: AgentRunStatus,
  /** Finding title (AC-51) | agent description (AC-52) | ''. */
  note: z.string(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * A match group: findings of one multi-agent run that share a file and whose
 * inclusive line ranges overlap (directly or transitively). The API returns
 * EVERY match group; `is_conflict` marks the ones where a participating agent
 * did not flag the location or participants' severities differ — the client
 * filters on it ("Show only conflicts"). Computed from persisted findings on
 * read; not stored.
 */
export const Conflict = z.object({
  /** `${file}#${line}` */
  id: z.string(),
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  is_conflict: z.boolean(),
  finding_ids: z.array(z.string()),
  /** One per agent run, in column order. */
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Response of GET /pulls/:id/multi-agent. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  pr_title: z.string().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  /** ran_at → max(finished_at); while running: now − ran_at. */
  total_duration_ms: z.number().int(),
  /** Sum of known cost_usd; null when none is known. */
  total_cost_usd: z.number().nullable(),
  /** Agent runs whose cost_usd is null. */
  unpriced_count: z.number().int(),
  /** Ordered by agent_runs.ran_at, id. */
  columns: z.array(AgentColumn),
  /** Ordered by file, then line (NFR-5). */
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

/** Pointer to a latest multi-agent run (GET …/multi-agent/latest). */
export const MultiAgentRunRef = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int(),
});
export type MultiAgentRunRef = z.infer<typeof MultiAgentRunRef>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
