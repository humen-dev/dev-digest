/* helpers.ts — pure functions shared by the agent and skill Context tabs and
   by the DocRow/DocPreviewDrawer/DocFilter widgets. No React, no I/O. */
import type { EffectiveContextDoc, ProjectDocument } from "@devdigest/shared";
import type { ContextDocRow } from "./types";

/** >4,000 estimated tokens gets the critical-colour over-budget badge (AC-25:
 *  4,001 is over, 4,000 is not — save stays enabled either way). */
export const TOKEN_CRITICAL_THRESHOLD = 4000;

export function isOverTokenThreshold(totalTokens: number): boolean {
  return totalTokens > TOKEN_CRITICAL_THRESHOLD;
}

export function fileNameOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

export function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** reviewer-core's bucket "root" (first path segment, or 'root' for a
 *  top-level file) — mirrored here only for display grouping; the server
 *  already assigns `ProjectDocument.bucket`, this module never recomputes it
 *  from a path. */
export const ROOT_BUCKET = "root";

/** Bucket display order: specs, docs, insights, every other bucket A→Z, root
 *  last. Duplicates reviewer-core's `compareBuckets` (D2 keeps that the
 *  engine's rule) because the skill tab's "Serializes as" preview has no
 *  server endpoint to group for it — only the agent's effective-context
 *  preview (`EffectiveContextPreview.documents`) arrives pre-grouped. */
const BUCKET_PRIORITY: Record<string, number> = { specs: 0, docs: 1, insights: 2 };

export function compareBuckets(a: string, b: string): number {
  if (a === b) return 0;
  if (a === ROOT_BUCKET) return 1;
  if (b === ROOT_BUCKET) return -1;
  const pa = BUCKET_PRIORITY[a];
  const pb = BUCKET_PRIORITY[b];
  if (pa != null && pb != null) return pa - pb;
  if (pa != null) return -1;
  if (pb != null) return 1;
  return a.localeCompare(b);
}

/** Stable grouping by bucket, in `compareBuckets` order. */
export function groupByBucket<T extends { bucket: string }>(
  docs: readonly T[],
): { bucket: string; docs: T[] }[] {
  const order: string[] = [];
  const byBucket = new Map<string, T[]>();
  for (const doc of docs) {
    let list = byBucket.get(doc.bucket);
    if (!list) {
      list = [];
      byBucket.set(doc.bucket, list);
      order.push(doc.bucket);
    }
    list.push(doc);
  }
  return order
    .slice()
    .sort(compareBuckets)
    .map((bucket) => ({ bucket, docs: byBucket.get(bucket)! }));
}

function toRow(
  path: string,
  docByPath: Map<string, ProjectDocument>,
  previewByPath: Map<string, EffectiveContextDoc>,
  attachedSet: Set<string>,
): ContextDocRow {
  const doc = docByPath.get(path);
  const preview = previewByPath.get(path);
  const attached = attachedSet.has(path);
  const inheritedVia =
    !attached && preview?.source.startsWith("skill:") ? preview.source.slice("skill:".length) : null;
  return {
    path,
    fileName: fileNameOf(path),
    folder: folderOf(path),
    bucket: doc?.bucket ?? preview?.bucket ?? ROOT_BUCKET,
    estimatedTokens: doc?.estimated_tokens ?? preview?.tokens ?? null,
    attached,
    missing: attached && preview?.status === "skipped_missing",
    inheritedVia,
    status: preview?.status ?? null,
  };
}

/**
 * Agent Context tab rows: attached paths first (in the agent's stored order),
 * then every other repo doc in path order (AC-17). A path the agent attached
 * that no longer resolves (deleted/renamed) still gets a row — via the
 * effective-context preview, not the live doc scan — so it can show "not
 * found" (AC-26) and still be detached (AC-27). A path reached only through a
 * linked skill (`preview.source === 'skill:<name>'`) is folded into "the
 * rest" and marked `inheritedVia` (AC-24).
 */
export function buildAgentContextRows(
  docs: readonly ProjectDocument[],
  attachedPaths: readonly string[],
  previewDocs: readonly EffectiveContextDoc[] | undefined,
): ContextDocRow[] {
  const docByPath = new Map(docs.map((d) => [d.path, d] as const));
  const previewByPath = new Map((previewDocs ?? []).map((e) => [e.path, e] as const));
  const attachedSet = new Set(attachedPaths);
  const attachedRows = attachedPaths.map((p) => toRow(p, docByPath, previewByPath, attachedSet));
  const restRows = docs.filter((d) => !attachedSet.has(d.path)).map((d) => toRow(d.path, docByPath, previewByPath, attachedSet));
  return [...attachedRows, ...restRows];
}

/**
 * Skill Context tab rows — same attached-first/path-order shape, but there is
 * no effective-context preview for a skill (3.2 lists none), so "missing" is
 * inferred from the path's absence in the current working-tree scan.
 */
export function buildSkillContextRows(
  docs: readonly ProjectDocument[],
  attachedPaths: readonly string[],
): ContextDocRow[] {
  const docByPath = new Map(docs.map((d) => [d.path, d] as const));
  const attachedSet = new Set(attachedPaths);
  const toSkillRow = (path: string): ContextDocRow => {
    const doc = docByPath.get(path);
    const attached = attachedSet.has(path);
    return {
      path,
      fileName: fileNameOf(path),
      folder: folderOf(path),
      bucket: doc?.bucket ?? ROOT_BUCKET,
      estimatedTokens: doc?.estimated_tokens ?? null,
      attached,
      missing: attached && !doc,
      inheritedVia: null,
      status: null,
    };
  };
  const attachedRows = attachedPaths.map(toSkillRow);
  const restRows = docs.filter((d) => !attachedSet.has(d.path)).map((d) => toSkillRow(d.path));
  return [...attachedRows, ...restRows];
}

/** The exact bucket heading text reviewer-core's `renderProjectContext` emits
 *  (plan §3.5) — byte-exact English, never translated, because the skill
 *  tab's "Serializes as" preview exists to show the user what the engine
 *  actually sends, the same contract as a Markdown preview showing a body
 *  verbatim. */
export function bucketHeading(bucket: string): string {
  if (bucket === "specs") return "Project specifications";
  if (bucket === "docs") return "Project docs";
  if (bucket === "insights") return "Project insights";
  return `Project ${bucket}`;
}

/** Path or folder substring match, case-insensitive (AC-20). Empty query matches everything. */
export function matchesFilter(row: ContextDocRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.path.toLowerCase().includes(q) || row.folder.toLowerCase().includes(q);
}

/** Move the item at `from` to `to` within an attached-paths list. Out-of-range
 *  or a no-op move returns a fresh copy of the input unchanged. */
export function moveAttached(paths: readonly string[], from: number, to: number): string[] {
  if (from < 0 || to < 0 || from >= paths.length || to >= paths.length || from === to) return [...paths];
  const next = [...paths];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Drop `fromPath` onto `toPath` within an attached-paths list (native HTML5
 *  DnD, D7). Only the attached rows are orderable — the "rest" of the list is
 *  always presented in path order. */
export function reorderAttached(paths: readonly string[], fromPath: string, toPath: string): string[] {
  const from = paths.indexOf(fromPath);
  const to = paths.indexOf(toPath);
  if (from < 0 || to < 0 || from === to) return [...paths];
  return moveAttached(paths, from, to);
}
