import { githubBlobUrl } from "@/lib/github-urls";
import { BLAST_REASONS } from "./constants";

/** GitHub blob link for a caller line, or null until repo + sha are known. */
export function callerHref(
  repoFullName: string | null,
  headSha: string | null,
  caller: { file: string; line: number },
): string | null {
  if (!repoFullName || !headSha) return null;
  return githubBlobUrl(repoFullName, headSha, caller.file, caller.line);
}

export function isKnownReason(reason: string | null): reason is (typeof BLAST_REASONS)[number] {
  return reason !== null && (BLAST_REASONS as readonly string[]).includes(reason);
}
