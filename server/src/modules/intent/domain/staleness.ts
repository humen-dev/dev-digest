/**
 * `pr_intent.head_sha` is null only for legacy rows written before this column
 * existed — those are always stale, same as a row whose head no longer matches
 * the PR's current head.
 */
export function isStale(intentHead: string | null, currentHead: string): boolean {
  return intentHead === null || intentHead !== currentHead;
}
