import { Octokit } from 'octokit';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { ExternalServiceError } from '../../platform/errors.js';

/**
 * GitHub GraphQL source for "prior PRs touching these paths". Satisfies the
 * `PrHistorySourcePort` of modules/pr-history STRUCTURALLY — adapters never
 * import modules (depcruise `adapters-not-into-modules`), so the shapes are
 * declared locally.
 */
export interface HistoryPrRef {
  number: number;
  title: string;
  mergedAt: string | null;
  author: string;
}
export interface HistoryPathHits {
  path: string;
  prs: HistoryPrRef[];
}
export interface HistoryQuery {
  owner: string;
  name: string;
  ref: string;
  paths: string[];
  commitsPerPath: number;
}

const TIMEOUT_MS = 20_000;
/** associatedPullRequests(first: …) per commit. */
const PRS_PER_COMMIT = 3;

/**
 * One aliased `history(path: $pN)` block per path. Aliases are index-generated
 * (`f0..`) and paths travel as GraphQL variables — repo text never enters the
 * query string.
 */
export function buildHistoryQuery(pathCount: number): string {
  const vars = Array.from({ length: pathCount }, (_, i) => `$p${i}: String!`).join(', ');
  const blocks = Array.from(
    { length: pathCount },
    (_, i) =>
      `f${i}: history(first: $n, path: $p${i}) { nodes { associatedPullRequests(first: $k) { nodes { number title mergedAt author { login } } } } }`,
  ).join(' ');
  return `query PrHistory($owner: String!, $name: String!, $ref: String!, $n: Int!, $k: Int!${vars ? `, ${vars}` : ''}) { repository(owner: $owner, name: $name) { object(expression: $ref) { ... on Commit { ${blocks} } } } }`;
}

export function buildHistoryVariables(q: HistoryQuery, prsPerCommit = PRS_PER_COMMIT): Record<string, unknown> {
  const vars: Record<string, unknown> = {
    owner: q.owner,
    name: q.name,
    ref: q.ref,
    n: q.commitsPerPath,
    k: prsPerCommit,
  };
  q.paths.forEach((p, i) => {
    vars[`p${i}`] = p;
  });
  return vars;
}

interface RawPr {
  number?: number;
  title?: string;
  mergedAt?: string | null;
  author?: { login?: string } | null;
}
interface RawHistory {
  nodes?: Array<{ associatedPullRequests?: { nodes?: Array<RawPr | null> } | null } | null> | null;
}

/** Tolerant parse: a null repository/object gives []; PRs are deduped per path. */
export function parseHistoryResponse(data: unknown, paths: string[]): HistoryPathHits[] {
  const obj = (data as { repository?: { object?: Record<string, RawHistory | undefined> | null } | null } | null)
    ?.repository?.object;
  if (!obj) return [];
  return paths.map((path, i) => {
    const seen = new Map<number, HistoryPrRef>();
    for (const commit of obj[`f${i}`]?.nodes ?? []) {
      for (const pr of commit?.associatedPullRequests?.nodes ?? []) {
        if (!pr || typeof pr.number !== 'number' || seen.has(pr.number)) continue;
        seen.set(pr.number, {
          number: pr.number,
          title: pr.title ?? '',
          mergedAt: pr.mergedAt ?? null,
          author: pr.author?.login ?? 'unknown',
        });
      }
    }
    return { path, prs: [...seen.values()] };
  });
}

export function isRateLimited(err: unknown): boolean {
  const e = err as {
    status?: number;
    response?: { headers?: Record<string, string | number | undefined> };
    errors?: Array<{ type?: string }>;
  } | null;
  if (!e) return false;
  if (e.status === 429) return true;
  if (e.status === 403 && String(e.response?.headers?.['x-ratelimit-remaining']) === '0') return true;
  return Array.isArray(e.errors) && e.errors.some((x) => x?.type === 'RATE_LIMITED');
}

function isTransient(err: unknown): boolean {
  if (isRateLimited(err)) return false;
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === 'number') return status >= 500;
  const code = (err as { code?: string } | null)?.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND';
}

export class OctokitPrHistorySource {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async mergedPrsTouchingPaths(q: HistoryQuery): Promise<HistoryPathHits[]> {
    if (q.paths.length === 0) return [];
    try {
      const data = await withRetry(
        () => withTimeout(this.octokit.graphql(buildHistoryQuery(q.paths.length), buildHistoryVariables(q)), TIMEOUT_MS),
        { retries: 1, isRetryable: isTransient },
      );
      return parseHistoryResponse(data, q.paths);
    } catch (err) {
      // Never leak the token or the paths: only a fixed message + the rate-limit flag.
      throw new ExternalServiceError('GitHub history lookup failed', { rateLimited: isRateLimited(err) });
    }
  }
}
