import type { EvalSkillRef } from '@devdigest/shared';
import { hasInjection } from '../../_shared/injection.js';

interface PromptSkillLike {
  enabled: boolean;
  body: string;
}

/** Skills that actually reach the prompt: enabled and not injection-flagged, in link order. */
export function promptSkills<T extends PromptSkillLike>(skills: readonly T[]): T[] {
  return skills.filter((s) => s.enabled && !hasInjection(s.body));
}

/** Fingerprint of the skills sent to the prompt (callers pass `promptSkills(...)` output). */
export function fingerprint(skills: readonly { skill_id: string; name: string; version: number }[]): EvalSkillRef[] {
  return skills.map((s) => ({ skill_id: s.skill_id, name: s.name, version: s.version }));
}
