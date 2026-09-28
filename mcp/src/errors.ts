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

/** Thrown by the HTTP adapter: connection refused / DNS / timeout. */
export class ApiUnreachableError extends Error {
  constructor(readonly baseUrl: string, cause?: unknown) {
    super(`DevDigest API not reachable at ${baseUrl}`);
    this.name = 'ApiUnreachableError';
    (this as { cause?: unknown }).cause = cause;
  }
}

/** Wire shape of every isError tool result (content[0].text = JSON.stringify(this)). */
export interface ToolErrorPayload { error: ToolErrorCode; message: string; next: string }

/** Maps any thrown value to a ToolErrorPayload (pure). */
export function toErrorPayload(err: unknown, apiUrl: string): ToolErrorPayload {
  void err;
  void apiUrl;
  throw new Error('not implemented');
}
