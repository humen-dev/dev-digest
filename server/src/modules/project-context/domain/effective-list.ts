/**
 * Effective project-context path list (SPEC-01 AC-38..AC-40): the agent's
 * own attachments first, then each linked skill's attachments in link
 * order; the first occurrence of a path wins. A disabled or
 * injection-blocked skill contributes no paths.
 *
 * Pure — no I/O. `hasInjection` is the same detector `skills` enforces on
 * write (server INSIGHTS 2026-09-24); it is re-run here, not imported from
 * `skills/`, because `no-cross-module-internals` only allows a module to
 * import another's `_shared/`, `index.ts`, `ports.ts` or `types.ts`.
 */
import { hasInjection } from '../../_shared/injection.js';

/** Structural shape of what this function needs from a linked skill — matches the port's `LinkedSkillDocs`. */
export interface SkillContextDocs {
  skillName: string;
  enabled: boolean;
  body: string;
  paths: string[];
}

export interface EffectiveListEntry {
  path: string;
  /** `'agent'` or `` `skill:${name}` ``. */
  source: string;
}

export function buildEffectiveList(
  agentPaths: readonly string[],
  skills: readonly SkillContextDocs[],
): EffectiveListEntry[] {
  const seen = new Set<string>();
  const out: EffectiveListEntry[] = [];

  for (const path of agentPaths) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, source: 'agent' });
  }

  for (const skill of skills) {
    if (!skill.enabled || hasInjection(skill.body)) continue;
    for (const path of skill.paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, source: `skill:${skill.skillName}` });
    }
  }

  return out;
}
