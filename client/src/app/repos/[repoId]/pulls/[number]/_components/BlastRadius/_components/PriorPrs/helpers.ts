export const OVERLAP_PREVIEW = 3;
const EMPTY_DATE = "—";

/** ISO timestamp -> YYYY-MM-DD (UTC), or "—" when it cannot be parsed. */
export function mergedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EMPTY_DATE;
  return d.toISOString().slice(0, 10);
}

/** First `max` files to show plus how many are hidden. */
export function overlapPreview(files: string[], max: number): { shown: string[]; more: number } {
  return { shown: files.slice(0, max), more: Math.max(0, files.length - max) };
}
