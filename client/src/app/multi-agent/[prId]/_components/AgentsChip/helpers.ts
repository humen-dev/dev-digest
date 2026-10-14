import type { GroupMember } from "./types";

/** How many OTHER agent runs flagged the same group as the finding of `runId`. */
export function otherAgentCount(members: GroupMember[], runId: string): number {
  return new Set(members.filter((m) => m.runId !== runId).map((m) => m.runId)).size;
}
