import type { AgentColumnFinding } from "@devdigest/shared";

/** One original finding of a match group, with the agent run that produced it. */
export interface GroupMember {
  runId: string;
  agentName: string;
  finding: AgentColumnFinding;
}

/** group_id → every original finding of that group, in column order. */
export type GroupIndex = Map<string, GroupMember[]>;
