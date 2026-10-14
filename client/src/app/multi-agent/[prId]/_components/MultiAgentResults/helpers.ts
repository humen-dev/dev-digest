import type { AgentColumn } from "@devdigest/shared";
import type { GroupIndex } from "../AgentsChip";

export function buildGroupIndex(columns: AgentColumn[]): GroupIndex {
  const index: GroupIndex = new Map();
  for (const col of columns) {
    for (const finding of col.findings) {
      const members = index.get(finding.group_id) ?? [];
      members.push({ runId: col.run_id, agentName: col.agent_name, finding });
      index.set(finding.group_id, members);
    }
  }
  return index;
}

/** Agent runs that finished successfully — the only ones that take part in a comparison. */
export function participatingCount(columns: AgentColumn[]): number {
  return columns.filter((c) => c.status === "done").length;
}

export function anyRunning(columns: AgentColumn[]): boolean {
  return columns.some((c) => c.status === "running");
}

export function allFailed(columns: AgentColumn[]): boolean {
  return columns.length > 0 && columns.every((c) => c.status === "failed");
}

/** The one reason when EVERY run failed with the same error (shared pre-work failed); else null. */
export function sharedFailureReason(columns: AgentColumn[]): string | null {
  if (columns.length < 2 || !allFailed(columns)) return null;
  const first = columns[0]?.error;
  if (!first) return null;
  return columns.every((c) => c.error === first) ? first : null;
}

export interface StatusFlip {
  agent: string;
  status: AgentColumn["status"];
}

/** Columns whose status differs from the previous snapshot (none on the first load). */
export function statusFlips(
  previous: Record<string, AgentColumn["status"]> | null,
  columns: AgentColumn[],
): StatusFlip[] {
  if (!previous) return [];
  return columns
    .filter((c) => previous[c.run_id] !== undefined && previous[c.run_id] !== c.status)
    .map((c) => ({ agent: c.agent_name, status: c.status }));
}

export function statusSnapshot(columns: AgentColumn[]): Record<string, AgentColumn["status"]> {
  return Object.fromEntries(columns.map((c) => [c.run_id, c.status]));
}
