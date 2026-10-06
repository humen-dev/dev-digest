/* DocTree/helpers.ts — pure grouping (no React). Groups the already path-ordered
   document list from the API by its `bucket` (first path segment, or `root`,
   AC-6) into folder nodes, non-root buckets A–Z first and `root` last so a
   repository's top-level files read as a trailing flat list rather than
   breaking up the alphabetical folders. Within a bucket the server's path
   order is kept (no re-sort) — it is already stable. */
import type { ProjectDocument } from "@devdigest/shared";

export const ROOT_BUCKET = "root";

export interface DocFolder {
  bucket: string;
  docs: ProjectDocument[];
}

export function groupDocsByFolder(documents: readonly ProjectDocument[]): DocFolder[] {
  const order: string[] = [];
  const byBucket = new Map<string, ProjectDocument[]>();
  for (const doc of documents) {
    const bucket = doc.bucket;
    const existing = byBucket.get(bucket);
    if (existing) {
      existing.push(doc);
    } else {
      byBucket.set(bucket, [doc]);
      order.push(bucket);
    }
  }
  order.sort((a, b) => {
    if (a === ROOT_BUCKET) return b === ROOT_BUCKET ? 0 : 1;
    if (b === ROOT_BUCKET) return -1;
    return a.localeCompare(b);
  });
  return order.map((bucket) => ({ bucket, docs: byBucket.get(bucket)! }));
}

/** Last path segment, used as a file node's label. */
export function fileLabel(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}
