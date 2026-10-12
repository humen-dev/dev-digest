/**
 * SPEC-07 AC-11 — repo-scoped memory rows → `.devdigest/memory.jsonl`. One
 * `{kind, content}` JSON object per line and nothing else (no embeddings, no
 * sources, no confidence). Zero rows → empty string.
 */

export interface MemoryExportRow {
  kind: string;
  content: string;
}

export function renderMemoryJsonl(rows: readonly MemoryExportRow[]): string {
  if (rows.length === 0) return '';
  return rows.map((r) => JSON.stringify({ kind: r.kind, content: r.content })).join('\n') + '\n';
}
