// src/api/http-client.ts — ring 3: the only file that calls `fetch`.
import type { McpConfig } from '../config.js';
import { ApiError, ApiUnreachableError } from '../errors.js';
import type { DevDigestApi } from '../ports.js';
import type {
  ApiActiveRun, ApiAgent, ApiBlastRadius, ApiConventionBoard, ApiPull, ApiRepo, ApiReview, ApiRun, ApiStartedRun,
} from '../domain/types.js';
import {
  ApiActiveRunListSchema,
  ApiAgentListSchema,
  ApiBlastRadiusSchema,
  ApiConventionBoardSchema,
  ApiErrorEnvelopeSchema,
  ApiPullListSchema,
  ApiRepoListSchema,
  ApiReviewListSchema,
  ApiRunListSchema,
  StartReviewResponseSchema,
} from './schemas.js';
import type { ZodTypeDef, ZodType } from 'zod';

/** Constrains T by the schema's OUTPUT only — zod's `ZodType<T>` defaults its
 *  Input generic to T too, which makes TS infer T from a transform's INPUT
 *  shape instead when Input !== Output (see `ApiPullSchema`'s id transform). */
type OutputSchema<T> = ZodType<T, ZodTypeDef, unknown>;

/** Minimal logger, injected so `HttpDevDigestApi` never touches stdout. */
export interface HttpLogger {
  (msg: string, data?: Record<string, unknown>): void;
}

const noopLogger: HttpLogger = () => {};

function isTimeoutLike(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === 'AbortError' || err.name === 'TimeoutError';
  return (err as { name?: string })?.name === 'AbortError' || (err as { name?: string })?.name === 'TimeoutError';
}

/** Network error codes that prove the request never left: nothing to double-run. */
const NEVER_SENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

/** Could the server have acted on this request so that a retry would repeat a
 *  side effect? Never for a GET (reads are safe to retry). For the POST: a
 *  timeout, or any failure other than a proven never-sent error (e.g.
 *  ECONNRESET after the body was written) — assume yes. */
function maybeProcessed(method: string, err: unknown): boolean {
  if (method !== 'POST') return false;
  if (isTimeoutLike(err)) return true;
  const code = (err as { cause?: { code?: string } })?.cause?.code;
  return !(code !== undefined && NEVER_SENT.has(code));
}

/** Thin HTTP client over the running DevDigest API. Never imports Drizzle/Fastify/DB. */
export class HttpDevDigestApi implements DevDigestApi {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: McpConfig,
    fetchImpl: typeof fetch = fetch,
    private readonly log: HttpLogger = noopLogger,
    private readonly callSignal?: AbortSignal,
  ) {
    this.fetchImpl = fetchImpl;
  }

  /** Same client, but every request also aborts when the tool call is cancelled. */
  withSignal(signal: AbortSignal): HttpDevDigestApi {
    return new HttpDevDigestApi(this.config, this.fetchImpl, this.log, signal);
  }

  async listRepos(): Promise<ApiRepo[]> {
    return this.request('GET', '/repos', ApiRepoListSchema);
  }

  async listPulls(repoId: string): Promise<ApiPull[]> {
    return this.request('GET', `/repos/${encodeURIComponent(repoId)}/pulls`, ApiPullListSchema, {
      timeoutMs: this.config.requestTimeoutMs * 2,
    });
  }

  async warmPull(prId: string): Promise<void> {
    await this.request<void>('GET', `/pulls/${encodeURIComponent(prId)}`, undefined, {
      timeoutMs: this.config.requestTimeoutMs * 2,
      discardBody: true,
    });
  }

  async listAgents(): Promise<ApiAgent[]> {
    return this.request('GET', '/agents', ApiAgentListSchema);
  }

  async startReview(prId: string, agentId: string): Promise<ApiStartedRun> {
    const body = await this.request(
      'POST',
      `/pulls/${encodeURIComponent(prId)}/review`,
      StartReviewResponseSchema,
      { jsonBody: { agentId } },
    );
    return body.runs[0]!;
  }

  async listRuns(prId: string): Promise<ApiRun[]> {
    return this.request('GET', `/pulls/${encodeURIComponent(prId)}/runs`, ApiRunListSchema);
  }

  async listActiveRuns(prId: string): Promise<ApiActiveRun[]> {
    return this.request(
      'GET',
      `/pulls/${encodeURIComponent(prId)}/runs/active`,
      ApiActiveRunListSchema,
    );
  }

  async listReviews(prId: string): Promise<ApiReview[]> {
    return this.request('GET', `/pulls/${encodeURIComponent(prId)}/reviews`, ApiReviewListSchema);
  }

  async getConventions(repoId: string): Promise<ApiConventionBoard> {
    return this.request(
      'GET',
      `/repos/${encodeURIComponent(repoId)}/conventions`,
      ApiConventionBoardSchema,
    );
  }

  async getBlastRadius(prId: string): Promise<ApiBlastRadius> {
    return this.request('GET', `/pulls/${encodeURIComponent(prId)}/blast`, ApiBlastRadiusSchema);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    schema: OutputSchema<T> | undefined,
    opts: { timeoutMs?: number; jsonBody?: unknown; discardBody?: boolean } = {},
  ): Promise<T> {
    // Relative resolution keeps a path prefix in DEVDIGEST_API_URL (e.g. http://h/api).
    const url = new URL(path.replace(/^\/+/, ''), `${this.config.apiUrl}/`);
    const timeoutMs = opts.timeoutMs ?? this.config.requestTimeoutMs;
    const start = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          accept: 'application/json',
          ...(opts.jsonBody !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(opts.jsonBody !== undefined ? { body: JSON.stringify(opts.jsonBody) } : {}),
        signal: this.callSignal
          ? AbortSignal.any([this.callSignal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // The caller cancelled the tool call: not an API failure, the result is discarded.
      if (this.callSignal?.aborted) throw err;
      if (err instanceof TypeError || isTimeoutLike(err)) {
        this.log('api_unreachable', { method, path, ms: Date.now() - start });
        throw new ApiUnreachableError(this.config.apiUrl, err, maybeProcessed(method, err));
      }
      throw err;
    }
    const ms = Date.now() - start;
    this.log('api_response', { method, path, status: res.status, ms });

    if (!res.ok) {
      let code: string | null = null;
      let message = `HTTP ${res.status}`;
      try {
        const raw: unknown = await res.json();
        const parsed = ApiErrorEnvelopeSchema.safeParse(raw);
        if (parsed.success) {
          code = parsed.data.error.code ?? null;
          message = parsed.data.error.message ?? message;
        }
      } catch {
        // body wasn't JSON — keep the generic message.
      }
      // A 5xx on the POST may come after the run was created (or from a proxy
      // after forwarding): never let it read as "retry once". 4xx = rejected.
      throw new ApiError(res.status, code, message, method === 'POST' && res.status >= 500);
    }

    if (opts.discardBody || !schema) {
      await res.arrayBuffer().catch(() => undefined);
      return undefined as T;
    }

    // A 2xx POST was ACCEPTED (the review run exists): an unreadable body must
    // not turn into a "retry once" hint that starts a second paid review.
    const badBody = (cause?: unknown): Error =>
      method === 'POST'
        ? new ApiUnreachableError(this.config.apiUrl, cause, true)
        : new ApiError(502, 'bad_response', `Unexpected response shape from ${path}`);

    let raw: unknown;
    try {
      raw = await res.json();
    } catch (err) {
      if (this.callSignal?.aborted) throw err;
      // The body stream broke (timeout / reset after the headers): a transport
      // failure, not a schema bug. A GET is safe to retry; the POST keeps badBody.
      if (method !== 'POST' && (err instanceof TypeError || isTimeoutLike(err))) {
        this.log('api_unreachable', { method, path, ms: Date.now() - start, phase: 'body' });
        throw new ApiUnreachableError(this.config.apiUrl, err, false);
      }
      throw badBody(err);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw badBody();
    return parsed.data;
  }
}
