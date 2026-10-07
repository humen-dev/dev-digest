import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { groupLinkedSkillDocs } from './mappers.js';
import type { DocOwnerRef, LinkedSkillDocs, ProjectContextRepository } from './ports.js';

/**
 * Drizzle implementation of `ProjectContextRepository` (ports.ts, Wave 0).
 * Owns `agent_context_docs` and `skill_context_docs`; reads `repos`, `agents`
 * and `skills` only for existence/scoping checks (never writes them).
 * `replaceAgentDocs` / `replaceSkillDocs` run delete+insert in ONE transaction
 * (plan step 2) so a reorder is atomic — a reader never observes an empty list
 * mid-write.
 */
export class DrizzleProjectContextRepository implements ProjectContextRepository {
  constructor(private db: Db) {}

  async getRepoClone(workspaceId: string, repoId: string): Promise<{ id: string; clonePath: string | null } | null> {
    const [row] = await this.db
      .select({ id: t.repos.id, clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  async agentExists(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row !== undefined;
  }

  async listEnabledAgentIds(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)))
      .orderBy(asc(t.agents.createdAt), asc(t.agents.id));
    return rows.map((r) => r.id);
  }

  async skillExists(workspaceId: string, skillId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return row !== undefined;
  }

  async getAgentDocs(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId))
      .orderBy(asc(t.agentContextDocs.position));
    return rows.map((r) => r.path);
  }

  async replaceAgentDocs(agentId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
      if (paths.length > 0) {
        await tx.insert(t.agentContextDocs).values(paths.map((path, position) => ({ agentId, path, position })));
      }
    });
  }

  async getSkillDocs(skillId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(asc(t.skillContextDocs.position));
    return rows.map((r) => r.path);
  }

  async replaceSkillDocs(skillId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
      if (paths.length > 0) {
        await tx.insert(t.skillContextDocs).values(paths.map((path, position) => ({ skillId, path, position })));
      }
    });
  }

  /** Agent's own skill-link order, each skill LEFT JOINed to its context docs. */
  async linkedSkillDocs(agentId: string): Promise<LinkedSkillDocs[]> {
    const rows = await this.db
      .select({
        skillId: t.skills.id,
        skillName: t.skills.name,
        enabled: t.skills.enabled,
        body: t.skills.body,
        order: t.agentSkills.order,
        path: t.skillContextDocs.path,
        position: t.skillContextDocs.position,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .leftJoin(t.skillContextDocs, eq(t.skillContextDocs.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId));
    return groupLinkedSkillDocs(rows);
  }

  /** How many agents (within the workspace) directly attach each path. */
  async agentCountsByPath(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path, count: sql<number>`count(*)::int` })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agentContextDocs.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId))
      .groupBy(t.agentContextDocs.path);
    return new Map(rows.map((r) => [r.path, r.count]));
  }

  async usageByPath(workspaceId: string, path: string): Promise<{ agents: DocOwnerRef[]; skills: DocOwnerRef[] }> {
    const agentRows = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agentContextDocs.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agentContextDocs.path, path)));
    const skillRows = await this.db
      .select({ id: t.skills.id, name: t.skills.name })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skillContextDocs.skillId, t.skills.id))
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skillContextDocs.path, path)));
    return { agents: agentRows, skills: skillRows };
  }
}
