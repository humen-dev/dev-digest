import type { SkillSource, SkillType } from '@devdigest/shared';
import type { InsertSkill, UpdateSkill } from './types.js';

/**
 * The narrow port `SkillsService` depends on — NOT the whole `Container`.
 * `SkillsRepository` implements this; unit tests can supply a plain object
 * fixture instead of standing up Postgres. Keeping this narrow (rather than
 * handing the service the full repository class, let alone the container) is
 * what keeps `service.ts` out of the depcruise dependency graph onto
 * `platform/container.ts` — see `AGENTS.md` / the module's onion-architecture
 * note (`repo-intel` is the other module that follows this shape).
 *
 * Row shapes are declared here as PLAIN interfaces, not imported from
 * `repository.ts` (`typeof t.skills.$inferSelect`) — a port depending on the
 * repository's Drizzle-inferred type is both a domain→infrastructure
 * dependency (`domain-no-outer-layers`) and, since `repository.ts` imports
 * this port, a cycle. `SkillsRepository`'s actual return values are
 * structurally assignable to these (same field names/types), so no mapping
 * or cast is needed at the boundary.
 */
export interface AgentSummaryRow {
  id: string;
  name: string;
  enabled: boolean;
}

export interface SkillRow {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
  createdAt: Date;
}

export interface SkillVersionRow {
  skillId: string;
  version: number;
  body: string;
  message: string | null;
  createdAt: Date;
}

export type SkillWithCount = SkillRow & { agentCount: number };

export interface SkillsRepositoryPort {
  list(workspaceId: string): Promise<SkillRow[]>;
  listWithCounts(workspaceId: string): Promise<SkillWithCount[]>;
  getById(workspaceId: string, id: string): Promise<SkillRow | undefined>;
  insert(values: InsertSkill): Promise<SkillRow>;
  update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined>;
  deleteById(workspaceId: string, id: string): Promise<boolean>;
  listVersions(skillId: string): Promise<SkillVersionRow[]>;
  getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined>;
  restoreVersion(workspaceId: string, id: string, version: number): Promise<SkillRow | undefined>;
  countAgents(skillId: string): Promise<number>;
  agentsUsing(skillId: string): Promise<AgentSummaryRow[]>;
}
