/* Pure helpers for choosing agents for a multi-agent run: estimate summary,
   seconds formatting and the remembered selection (localStorage). */
import type { Agent } from "@devdigest/shared";
import { formatCost } from "./format-cost";

const STORAGE_KEY = "dd-multi-agent-selection";

/** Slowest selected agent (they run in parallel) and the summed known cost. A
    null estimate is skipped, never counted as 0; null when nothing is known. */
export function summariseEstimate(
  agents: Agent[],
  selected: string[],
): { maxDurationMs: number | null; costUsd: number | null } {
  const chosen = new Set(selected);
  let maxDurationMs: number | null = null;
  let costUsd: number | null = null;
  for (const a of agents) {
    if (!chosen.has(a.id)) continue;
    if (a.est_duration_ms != null) {
      maxDurationMs = maxDurationMs == null ? a.est_duration_ms : Math.max(maxDurationMs, a.est_duration_ms);
    }
    if (a.est_cost_usd != null) costUsd = (costUsd ?? 0) + a.est_cost_usd;
  }
  return { maxDurationMs, costUsd };
}

/** "8.2s · $0.060" for an agent with run history; null when it has none. */
export function formatAgentEstimate(agent: Agent): string | null {
  if (!agent.has_history || agent.est_duration_ms == null) return null;
  return `${formatSeconds(agent.est_duration_ms)} · ${formatCost(agent.est_cost_usd)}`;
}

/** 8200 → "8.2s". */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Last selection used for a run; garbage or unavailable storage → []. */
export function readRememberedSelection(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function rememberSelection(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable — the selection is just not remembered */
  }
}

/** remembered ∩ enabled (stale ids dropped); when nothing survives → all enabled. */
export function preselect(enabled: Agent[], remembered: string[]): string[] {
  const known = new Set(remembered);
  const kept = enabled.filter((a) => known.has(a.id)).map((a) => a.id);
  return kept.length > 0 ? kept : enabled.map((a) => a.id);
}
