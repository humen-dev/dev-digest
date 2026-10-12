import { CiResultArtifact, CiRunMeta } from '@devdigest/shared';
import { WORKFLOW_PATH } from '../constants.js';
import { isCredentialShaped } from './secret-scan.js';
import type { CiFailureKey } from './artifact-zip.js';

export interface VerifyRunInput {
  run: { repository_id: number | null; path: string; head_sha: string };
  installation: { githubRepoId: number | null; repo: string };
  resultText: string | undefined;
  metaText: string | undefined;
  /** Stored workspace secret values; a verbatim hit rejects the artifact. */
  secretValues: readonly string[];
}

/** On rejection only a reason key is returned — never any matched text (UT-7). */
export type VerifyRunResult =
  | { accepted: true; artifact: CiResultArtifact; meta: CiRunMeta }
  | { accepted: false; reason: CiFailureKey };

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const INT32_MAX = 2_147_483_647;
const COUNT_FIELDS = ['findings_count', 'critical', 'warning', 'suggestion', 'blockers', 'duration_ms'] as const;

/** DB columns are int32; an out-of-range value would make the INSERT throw (B-1). */
function withinDbRange(a: CiResultArtifact): boolean {
  for (const f of COUNT_FIELDS) {
    const v = a[f];
    if (v !== null && v !== undefined && (v < 0 || v > INT32_MAX)) return false;
  }
  return a.cost_usd === null || (Number.isFinite(a.cost_usd) && a.cost_usd >= 0);
}

/** The run's `path` may carry an `@ref` suffix (`<path>@refs/heads/main`). */
function stripRef(path: string): string {
  const at = path.indexOf('@');
  return at === -1 ? path : path.slice(0, at);
}

/** Checks run in the spec's order; the first failure is returned (§3.4). */
export function verifyRun(input: VerifyRunInput): VerifyRunResult {
  const { run, installation, resultText, metaText } = input;

  if (run.repository_id === null || run.repository_id !== installation.githubRepoId) {
    return { accepted: false, reason: 'repoMismatch' };
  }
  if (stripRef(run.path) !== WORKFLOW_PATH) return { accepted: false, reason: 'workflowPath' };
  if (resultText === undefined) return { accepted: false, reason: 'noResult' };

  const resultParsed = CiResultArtifact.safeParse(parseJson(resultText));
  if (!resultParsed.success || !withinDbRange(resultParsed.data)) {
    return { accepted: false, reason: 'resultSchema' };
  }
  if (metaText === undefined) return { accepted: false, reason: 'metaSchema' };
  const metaParsed = CiRunMeta.safeParse(parseJson(metaText));
  if (!metaParsed.success) return { accepted: false, reason: 'metaSchema' };

  const meta = metaParsed.data;
  if (
    meta.repository_id !== installation.githubRepoId ||
    meta.repository.toLowerCase() !== installation.repo.toLowerCase() ||
    meta.commit_sha !== run.head_sha
  ) {
    return { accepted: false, reason: 'metadataMismatch' };
  }

  if (isCredentialShaped(resultText, input.secretValues) || isCredentialShaped(metaText, input.secretValues)) {
    return { accepted: false, reason: 'secret' };
  }

  return { accepted: true, artifact: resultParsed.data, meta };
}
