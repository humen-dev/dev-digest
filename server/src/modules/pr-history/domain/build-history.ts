import type { PrHistoryItem } from '@devdigest/shared';
import type { PathPrHits } from '../ports.js';

/**
 * Pure: fold per-path merged-PR hits into ranked history items.
 * Drops the current PR and unmerged entries; `files_overlap` is the sorted set
 * of looked-up paths a PR touched. `notes` is always '' (no LLM involved).
 */
export function buildPrHistory(
  hits: PathPrHits[],
  opts: { currentNumber: number; maxItems: number },
): PrHistoryItem[] {
  const byNumber = new Map<number, { title: string; mergedAt: string; author: string; files: Set<string> }>();
  for (const hit of hits) {
    for (const pr of hit.prs) {
      if (pr.number === opts.currentNumber || !pr.mergedAt) continue;
      const entry = byNumber.get(pr.number);
      if (entry) entry.files.add(hit.path);
      else byNumber.set(pr.number, { title: pr.title, mergedAt: pr.mergedAt, author: pr.author, files: new Set([hit.path]) });
    }
  }
  const items: PrHistoryItem[] = [...byNumber.entries()].map(([number, e]) => ({
    pr_number: number,
    title: e.title,
    merged_at: new Date(e.mergedAt).toISOString(),
    author: e.author || 'unknown',
    files_overlap: [...e.files].sort(),
    notes: '',
  }));
  items.sort(
    (a, b) =>
      b.files_overlap.length - a.files_overlap.length ||
      (a.merged_at < b.merged_at ? 1 : a.merged_at > b.merged_at ? -1 : 0) ||
      b.pr_number - a.pr_number,
  );
  return items.slice(0, opts.maxItems);
}
