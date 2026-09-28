import { clip } from './format/text.js';

export type ToolErrorCode =
  | 'api_unreachable' | 'api_error' | 'rate_limited' | 'invalid_argument'
  | 'repo_not_found' | 'pr_not_found'
  | 'agent_not_found' | 'agent_ambiguous' | 'agent_disabled'
  | 'run_not_found' | 'run_failed' | 'run_cancelled' | 'no_review'
  | 'no_conventions' | 'not_implemented';

/** A failure a tool reports to the calling agent. `next` names the concrete next step. */
export class ToolError extends Error {
  constructor(readonly code: ToolErrorCode, message: string, readonly next: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/** Thrown by the HTTP adapter: the API answered with a non-2xx status. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly apiCode: string | null, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown by the HTTP adapter: connection refused / DNS / timeout / reset.
 *  `maybeProcessed` = the request may have reached the server (a timeout, or a
 *  POST whose connection broke after it was sent), so it must not be blindly
 *  retried — a repeated paid review would start twice. */
export class ApiUnreachableError extends Error {
  constructor(readonly baseUrl: string, cause?: unknown, readonly maybeProcessed = false) {
    super(`DevDigest API not reachable at ${baseUrl}`);
    this.name = 'ApiUnreachableError';
    (this as { cause?: unknown }).cause = cause;
  }
}

/** Wire shape of every isError tool result (content[0].text = JSON.stringify(this)). */
export interface ToolErrorPayload { error: ToolErrorCode; message: string; next: string }

/** Maps any thrown value to a ToolErrorPayload (pure). */
export function toErrorPayload(err: unknown, apiUrl: string): ToolErrorPayload {
  if (err instanceof ToolError) {
    return { error: err.code, message: err.message, next: err.next };
  }
  if (err instanceof ApiUnreachableError && err.maybeProcessed) {
    return {
      error: 'api_unreachable',
      message: `DevDigest API at ${apiUrl} did not answer; the request may have been processed.`,
      next: 'Call get_findings(repo, pr) first (it also reports a review that is still running); retry run_agent_on_pr only if nothing is there.',
    };
  }
  if (err instanceof ApiUnreachableError) {
    return {
      error: 'api_unreachable',
      message: `DevDigest API not reachable at ${apiUrl}.`,
      next: 'Start it with ./scripts/dev.sh (or: cd server && pnpm dev), or set DEVDIGEST_API_URL; then retry.',
    };
  }
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return {
        error: 'rate_limited',
        message: clip(err.message, 200),
        next: 'DevDigest allows 10 review starts per minute; wait a minute and retry, or call get_findings for an existing run.',
      };
    }
    return {
      error: 'api_error',
      message: `DevDigest API error ${err.status}${err.apiCode ? ` ${clip(err.apiCode, 60)}` : ''}: ${clip(err.message, 200)}`,
      next: 'Check the DevDigest API log; retry once.',
    };
  }
  return {
    error: 'api_error',
    message: 'Internal error in devdigest-mcp.',
    next: 'Retry once; see the MCP server stderr log.',
  };
}
