import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import type { InsertSkill, UpdateSkill } from './types.js';
import type {
  AgentSummaryRow,
  SkillRow,
  SkillsRepositoryPort,
  SkillVersionRow,
  SkillWithCount,
} from './ports.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`; the `agent_skills`
 * link table is owned by the agents module (A2) — this repository only READS
 * it (for `agent_count` / `agentsUsing`), never writes it. Workspace-scoped
 * throughout except where the caller already resolved the skill's workspace.
 * Row types (`SkillRow` etc.) are the plain interfaces from `ports.ts` — the
 * Drizzle rows returned by `db.select()`/`.returning()` below satisfy them
 * structurally, no mapping needed.
 */

export class SkillsRepository implements SkillsRepositoryPort {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  /** `list` enriched with `agentCount` via one batched `IN (...)` query (no N+1). */
  async listWithCounts(workspaceId: string): Promise<SkillWithCount[]> {
    const rows = await this.list(workspaceId);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const counts = await this.db
      .select({ skillId: t.agentSkills.skillId, count: sql<number>`count(*)::int` })
      .from(t.agentSkills)
      .where(inArray(t.agentSkills.skillId, ids))
      .groupBy(t.agentSkills.skillId);
    const byId = new Map(counts.map((c) => [c.skillId, c.count]));
    return rows.map((r) => ({ ...r, agentCount: byId.get(r.id) ?? 0 }));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Insert a skill AND record version 1 in `skill_versions` (immutable snapshot). */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type,
        source: values.source ?? 'manual',
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
        evidenceFiles: values.evidenceFiles ?? null,
      })
      .returning();
    await this.insertVersionSnapshot(row!.id, INITIAL_SKILL_VERSION, row!.body);
    return row!;
  }

  /**
   * Update a skill. Only a `body` change bumps `version` and snapshots
   * `skill_versions` — editing name/description/type or toggling `enabled`
   * does not (matches the agents module's config-vs-toggle version rule).
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.source !== undefined ? { source: patch.source } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(bodyChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (bodyChanged && row) {
      await this.insertVersionSnapshot(id, nextVersion, row.body, patch.versionMessage ?? null);
    }
    return row;
  }

  /** Delete a skill (scoped to workspace); versions + agent links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  // ---- skill_versions (immutable body snapshots) --------------------------

  /** All version snapshots for a skill, newest first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  /**
   * Restore an old version's body as a NEW version — always bumps, even if
   * the restored body happens to match the current one, so "Restore" is an
   * unconditional, auditable action (the history stays append-only; nothing
   * is edited or removed).
   */
  async restoreVersion(workspaceId: string, id: string, version: number): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;
    const old = await this.getVersion(id, version);
    if (!old) return undefined;

    const nextVersion = existing.version + 1;
    const [row] = await this.db
      .update(t.skills)
      .set({ body: old.body, version: nextVersion })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();
    if (row) await this.insertVersionSnapshot(id, nextVersion, old.body);
    return row;
  }

  /** `message` is the author's optional "what changed" note; null for v1 and for restores. */
  private async insertVersionSnapshot(
    skillId: string,
    version: number,
    body: string,
    message: string | null = null,
  ): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId, version, body, message })
      .onConflictDoNothing();
  }

  // ---- agent_skills reads (A2 owns the writes) -----------------------------

  /** How many agents currently link this skill — for the Skill card / Stats tab. */
  async countAgents(skillId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.agentSkills)
      .where(eq(t.agentSkills.skillId, skillId));
    return row?.count ?? 0;
  }

  /** Agents that currently link this skill (for the Stats tab's agent list). */
  async agentsUsing(skillId: string): Promise<AgentSummaryRow[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agentSkills.skillId, skillId));
  }
}
