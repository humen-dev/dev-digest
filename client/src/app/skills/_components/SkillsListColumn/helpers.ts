import type { Skill } from "@devdigest/shared";

/** Case-insensitive filter over a skill's name + description (mirrors agents/_components/AgentsListView/helpers.ts). */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.description}`.toLowerCase().includes(q));
}
