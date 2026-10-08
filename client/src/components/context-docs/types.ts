import type { ProjectDocStatus } from "@devdigest/shared";

/**
 * One row in a Context tab's document list — a project doc's own fields
 * (when it is still present in the working tree) merged with this agent's or
 * skill's attachment state. `status`/`missing`/`inheritedVia` are only ever
 * populated for the agent tab, which has a server-computed effective-context
 * preview (D6, `ProjectContextService.resolveEffective`); the skill tab has no
 * such endpoint and infers `missing` from the doc's absence in the current
 * working-tree scan instead (see helpers.ts).
 */
export interface ContextDocRow {
  path: string;
  fileName: string;
  folder: string;
  bucket: string;
  estimatedTokens: number | null;
  attached: boolean;
  missing: boolean;
  inheritedVia: string | null;
  status: ProjectDocStatus | null;
}
