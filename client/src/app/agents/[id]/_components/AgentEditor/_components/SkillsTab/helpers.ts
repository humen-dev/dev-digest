/** Reorder active skills while preserving every inactive link and its slot. */
export function reorderEnabledSkills(
  linkedIds: string[], enabledIds: string[], fromId: string, toId: string,
): string[] {
  const from = enabledIds.indexOf(fromId);
  const to = enabledIds.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return linkedIds;
  const reordered = [...enabledIds];
  const [item] = reordered.splice(from, 1);
  reordered.splice(to, 0, item!);
  const enabled = new Set(enabledIds);
  let index = 0;
  return linkedIds.map((id) => enabled.has(id) ? reordered[index++]! : id);
}
