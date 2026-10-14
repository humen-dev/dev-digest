export type GithubErrorKind = 'not_found' | 'permission' | 'rate_limited' | 'unavailable';

interface ErrorLike {
  status?: unknown;
  message?: unknown;
  response?: { status?: unknown; headers?: Record<string, unknown> };
}

/**
 * Classify an error thrown by the GitHub adapter (Octokit `RequestError` keeps a
 * numeric `status`). Services use this instead of importing the adapter.
 */
export function classifyGithubError(err: unknown): GithubErrorKind {
  const e = (typeof err === 'object' && err !== null ? err : {}) as ErrorLike;
  const status =
    typeof e.status === 'number' ? e.status : typeof e.response?.status === 'number' ? e.response.status : undefined;

  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) {
    const remaining = e.response?.headers?.['x-ratelimit-remaining'];
    const message = typeof e.message === 'string' ? e.message : '';
    if (String(remaining) === '0' || /rate limit/i.test(message)) return 'rate_limited';
    return 'permission';
  }
  return 'unavailable';
}
