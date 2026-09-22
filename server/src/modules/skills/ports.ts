import type { SkillRow, SkillVersionRow, SkillWithCount } from './repository.js';
import type { InsertSkill, UpdateSkill } from './types.js';

/**
 * The narrow port `SkillsService` depends on — NOT the whole `Container`.
 * `SkillsRepository` implements this; unit tests can supply a plain object
 * fixture instead of standing up Postgres. Keeping this narrow (rather than
 * handing the service the full repository class, let alone the container) is
 * what keeps `service.ts` out of the depcruise dependency graph onto
 * `platform/container.ts` — see `AGENTS.md` / the module's onion-architecture
 * note (`repo-intel` is the other module that follows this shape).
 */
export interface AgentSummaryRow {
  id: string;
  name: string;
  enabled: boolean;
}

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
