import { hasInjection } from './injection.js';

/**
 * The minimal shape `renderSkillBlocks` needs from a linked-skill row.
 * Deliberately NOT imported from `../agents/repository.js` — reaching into
 * another module's internal file is a `no-cross-module-internals` depcruise
 * violation. `AgentsRepository.linkedSkills`'s `LinkedSkillRow.skill` (a
 * `typeof t.skills.$inferSelect`) structurally satisfies this, so callers
 * pass it straight through with no adapter needed.
 */
export interface SkillLinkForPrompt {
  skill: { name: string; type: string; body: string; enabled: boolean };
}

/**
 * Render an agent's linked skills into `## Skills / rules` prompt blocks
 * (Skills feature — L02). `links` is already ordered by `agent_skills.order`
 * (see `AgentsRepository.linkedSkills`); this only filters out disabled
 * skills and formats each survivor as `### Skill: <name> (<type>)\n<body>`.
 * A disabled skill — or one whose body trips the injection detector, even if a
 * legacy row is still enabled — never reaches the prompt. Pure — no tokenizer,
 * no I/O; `run-executor.ts` counts tokens over the joined result.
 *
 * Lives in `_shared/` so the reviews and eval modules render skills identically.
 */
export function renderSkillBlocks(links: SkillLinkForPrompt[]): string[] {
  return links
    .filter((l) => l.skill.enabled && !hasInjection(l.skill.body))
    .map((l) => `### Skill: ${l.skill.name} (${l.skill.type})\n${l.skill.body}`);
}
