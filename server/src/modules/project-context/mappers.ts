import type { LinkedSkillDocs } from './ports.js';

/**
 * Pure row ⇄ contract mapping for the project-context module. No I/O. Most of
 * this module's repository methods already return plain-shaped data
 * structurally matching the port (see `ports.ts`'s note on `skills/ports.ts`'s
 * pattern), so the one mapping worth pulling out here is the skill/doc join:
 * `linkedSkillDocs` reads a flat, possibly-repeated-per-path row set (one
 * skill LEFT JOINed to its context docs) and this groups it back into one
 * `LinkedSkillDocs` per skill, in agent-skill-link order, with its paths in
 * stored position order.
 */

/** One row of the `agent_skills` → `skills` → LEFT JOIN `skill_context_docs` query. */
export interface LinkedSkillDocRow {
  skillId: string;
  skillName: string;
  enabled: boolean;
  body: string;
  /** `agent_skills.order` — the agent's own skill-link order. */
  order: number;
  /** Null when the skill has no context docs (LEFT JOIN miss). */
  path: string | null;
  position: number | null;
}

export function groupLinkedSkillDocs(rows: readonly LinkedSkillDocRow[]): LinkedSkillDocs[] {
  const bySkill = new Map<
    string,
    { skillName: string; enabled: boolean; body: string; order: number; paths: { path: string; position: number }[] }
  >();
  for (const row of rows) {
    let entry = bySkill.get(row.skillId);
    if (!entry) {
      entry = { skillName: row.skillName, enabled: row.enabled, body: row.body, order: row.order, paths: [] };
      bySkill.set(row.skillId, entry);
    }
    if (row.path !== null && row.position !== null) entry.paths.push({ path: row.path, position: row.position });
  }
  return [...bySkill.values()]
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({
      skillName: entry.skillName,
      enabled: entry.enabled,
      body: entry.body,
      paths: entry.paths.sort((a, b) => a.position - b.position).map((p) => p.path),
    }));
}
