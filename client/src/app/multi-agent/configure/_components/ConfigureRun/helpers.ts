/** `?agents=a,b` → ["a", "b"]; missing or empty → []. */
export function parseAgentsParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}
