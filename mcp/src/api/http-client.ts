// src/api/http-client.ts — ring 3: the only file that calls `fetch`.
import type { McpConfig } from '../config.js';
import { ApiError, ApiUnreachableError } from '../errors.js';
import type { DevDigestApi } from '../ports.js';
import type {
  ApiActiveRun, ApiAgent, ApiConventionBoard, ApiPull, ApiRepo, ApiReview, ApiRun, ApiStartedRun,
} from '../domain/types.js';
import {
  ApiActiveRunListSchema,
  ApiAgentListSchema,
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

/** Thin HTTP client over the running DevDigest API. Never imports Drizzle/Fastify/DB. */
export class HttpDevDigestApi implements DevDigestApi {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: McpConfig,
    fetchImpl: typeof fetch = fetch,
    private readonly log: HttpLogger = noopLogger,
  ) {
    this.fetchImpl = fetchImpl;
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
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof TypeError || isTimeoutLike(err)) {
        this.log('api_unreachable', { method, path, ms: Date.now() - start });
        throw new ApiUnreachableError(this.config.apiUrl, err, isTimeoutLike(err));
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
      throw new ApiError(res.status, code, message);
    }

    if (opts.discardBody || !schema) {
      await res.arrayBuffer().catch(() => undefined);
      return undefined as T;
    }

    let raw: unknown;
    try {
      raw = await res.json();
    } catch {
      throw new ApiError(502, 'bad_response', `Unexpected response shape from ${path}`);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(502, 'bad_response', `Unexpected response shape from ${path}`);
    }
    return parsed.data;
  }
}
