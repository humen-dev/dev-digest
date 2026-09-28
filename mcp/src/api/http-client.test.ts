import { describe, expect, it, vi } from 'vitest';
import { HttpDevDigestApi } from './http-client.js';
import { ApiError, ApiUnreachableError } from '../errors.js';
import { DEFAULTS, DEFAULT_API_URL, type McpConfig } from '../config.js';

function config(): McpConfig {
  return { apiUrl: DEFAULT_API_URL, waitMs: DEFAULTS.waitMs, pollMs: DEFAULTS.pollMs, requestTimeoutMs: DEFAULTS.requestTimeoutMs };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HttpDevDigestApi', () => {
  it('hits the exact method + path for every port method', async () => {
    const calls: { method: string; url: string }[] = [];
    const fetchStub = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET') as string;
      calls.push({ method, url });
      if (url.endsWith('/repos')) return jsonResponse([{ id: 'r1', owner: 'acme', name: 'payments-api', full_name: 'acme/payments-api' }]);
      if (url.endsWith('/repos/r1/pulls')) return jsonResponse([{ id: 'p1', number: 482, title: 'Add refund endpoint', status: 'open' }]);
      if (url.endsWith('/pulls/p1') && method === 'GET') return jsonResponse({});
      if (url.endsWith('/agents')) return jsonResponse([{ id: 'a1', name: 'General', description: 'd', provider: 'openrouter', model: 'm', enabled: true, ci_fail_on: 'critical' }]);
      if (url.endsWith('/pulls/p1/review') && method === 'POST') {
        return jsonResponse({ runs: [{ run_id: 'run1', agent_id: 'a1', agent_name: 'General' }] });
      }
      if (url.endsWith('/pulls/p1/runs')) return jsonResponse([{ run_id: 'run1', agent_id: 'a1', agent_name: 'General', status: 'done', error: null, score: 80, blockers: 0, findings_count: 1, ran_at: '2026-01-01T00:00:00Z' }]);
      if (url.endsWith('/pulls/p1/runs/active')) return jsonResponse([{ run_id: 'run1', agent_id: 'a1', agent_name: 'General' }]);
      if (url.endsWith('/pulls/p1/reviews')) return jsonResponse([{ id: 'rev1', run_id: 'run1', agent_id: 'a1', agent_name: 'General', kind: 'review', verdict: 'approve', summary: 's', score: 80, created_at: '2026-01-01T00:00:00Z', findings: [] }]);
      if (url.endsWith('/repos/r1/conventions')) return jsonResponse({ candidates: [], last_scan: null });
      throw new Error(`unexpected url in test: ${url}`);
    });

    const api = new HttpDevDigestApi(config(), fetchStub as unknown as typeof fetch);

    await api.listRepos();
    await api.listPulls('r1');
    await api.warmPull('p1');
    await api.listAgents();
    await api.startReview('p1', 'a1');
    await api.listRuns('p1');
    await api.listActiveRuns('p1');
    await api.listReviews('p1');
    await api.getConventions('r1');

    expect(calls).toEqual([
      { method: 'GET', url: `${DEFAULT_API_URL}/repos` },
      { method: 'GET', url: `${DEFAULT_API_URL}/repos/r1/pulls` },
      { method: 'GET', url: `${DEFAULT_API_URL}/pulls/p1` },
      { method: 'GET', url: `${DEFAULT_API_URL}/agents` },
      { method: 'POST', url: `${DEFAULT_API_URL}/pulls/p1/review` },
      { method: 'GET', url: `${DEFAULT_API_URL}/pulls/p1/runs` },
      { method: 'GET', url: `${DEFAULT_API_URL}/pulls/p1/runs/active` },
      { method: 'GET', url: `${DEFAULT_API_URL}/pulls/p1/reviews` },
      { method: 'GET', url: `${DEFAULT_API_URL}/repos/r1/conventions` },
    ]);
  });

  it('POSTs a JSON {agentId} body to start a review', async () => {
    let seenBody: unknown;
    const fetchStub = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      seenBody = init?.body ? JSON.parse(String(init.body)) : undefined;
      return jsonResponse({ runs: [{ run_id: 'run1', agent_id: 'a1', agent_name: 'General' }] });
    });
    const api = new HttpDevDigestApi(config(), fetchStub as unknown as typeof fetch);
    const started = await api.startReview('p1', 'a1');
    expect(seenBody).toEqual({ agentId: 'a1' });
    expect(started).toEqual({ run_id: 'run1', agent_id: 'a1', agent_name: 'General' });
  });

  it('maps a connection failure (TypeError) to ApiUnreachableError carrying baseUrl', async () => {
    const fetchStub = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const api = new HttpDevDigestApi(config(), fetchStub as unknown as typeof fetch);
    await expect(api.listRepos()).rejects.toMatchObject({
      name: 'ApiUnreachableError',
      baseUrl: DEFAULT_API_URL,
    });
  });

  it('maps a timeout (AbortError) to ApiUnreachableError', async () => {
    const fetchStub = vi.fn(async () => {
      const err = new DOMException('The operation was aborted', 'TimeoutError');
      throw err;
    });
    const api = new HttpDevDigestApi(config(), fetchStub as unknown as typeof fetch);
    await expect(api.listRepos()).rejects.toMatchObject({ name: 'ApiUnreachableError', timedOut: true });
  });

  it('marks a refused connection as not timed out', async () => {
    const fetchStub = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const api = new HttpDevDigestApi(config(), fetchStub as unknown as typeof fetch);
    await expect(api.listRepos()).rejects.toMatchObject({ name: 'ApiUnreachableError', timedOut: false });
  });

  it('maps a 404 error envelope to ApiError(404, code, message)', async () => {
    const fetchStub = vi.fn(async () =>
      jsonResponse({ error: { code: 'not_found', message: 'Pull request not found' } }, 404),
    );
    const api = new HttpDevDigestApi(config(), fetchStub as unknown as typeof fetch);
    await expect(api.listPulls('r1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      apiCode: 'not_found',
      message: 'Pull request not found',
    });
  });

  it('maps a 429 to ApiError(429, ...)', async () => {
    const fetchStub = vi.fn(async () =>
      jsonResponse({ error: { code: 'rate_limited', message: 'Too many requests' } }, 429),
    );
    const api = new HttpDevDigestApi(config(), fetchStub as unknown as typeof fetch);
    await expect(api.startReview('p1', 'a1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
    });
  });

  it('strips unknown extra fields (e.g. system_prompt is not present on ApiAgent)', async () => {
    const fetchStub = vi.fn(async () =>
      jsonResponse([
        {
          id: 'a1', name: 'General', description: 'd', provider: 'openrouter', model: 'm',
          enabled: true, ci_fail_on: 'critical', system_prompt: 'SECRET PROMPT', output_schema: { foo: 1 },
        },
      ]),
    );
    const api = new HttpDevDigestApi(config(), fetchStub as unknown as typeof fetch);
    const agents = await api.listAgents();
    expect(agents[0]).not.toHaveProperty('system_prompt');
    expect(agents[0]).not.toHaveProperty('output_schema');
    expect(agents[0]).toEqual({
      id: 'a1', name: 'General', description: 'd', provider: 'openrouter', model: 'm',
      enabled: true, ci_fail_on: 'critical',
    });
  });

  it('maps a malformed / schema-invalid body to ApiError(502, "bad_response", ...)', async () => {
    const fetchStub = vi.fn(async () => jsonResponse({ not: 'an array' }));
    const api = new HttpDevDigestApi(config(), fetchStub as unknown as typeof fetch);
    await expect(api.listAgents()).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      apiCode: 'bad_response',
    });
  });

  it('maps a non-JSON body to ApiError(502, "bad_response", ...)', async () => {
    const fetchStub = vi.fn(async () => new Response('not json', { status: 200 }));
    const api = new HttpDevDigestApi(config(), fetchStub as unknown as typeof fetch);
    await expect(api.listAgents()).rejects.toMatchObject({ name: 'ApiError', status: 502 });
  });

  it('warmPull discards the body and resolves void', async () => {
    const fetchStub = vi.fn(async () => jsonResponse({ huge: 'payload'.repeat(1000) }));
    const api = new HttpDevDigestApi(config(), fetchStub as unknown as typeof fetch);
    await expect(api.warmPull('p1')).resolves.toBeUndefined();
  });

  it('non-2xx with an unparsable body falls back to a generic ApiError message', async () => {
    const fetchStub = vi.fn(async () => new Response('oops', { status: 500 }));
    const api = new HttpDevDigestApi(config(), fetchStub as unknown as typeof fetch);
    await expect(api.listRepos()).rejects.toMatchObject({ name: 'ApiError', status: 500 });
  });

  it('keeps a path prefix in the configured API URL', async () => {
    const fetchStub = vi.fn(async (_url: URL) => jsonResponse([]));
    const api = new HttpDevDigestApi({ ...config(), apiUrl: 'http://127.0.0.1:3001/api' }, fetchStub as unknown as typeof fetch);
    await api.listRepos();
    expect(String(fetchStub.mock.calls[0]![0])).toBe('http://127.0.0.1:3001/api/repos');
  });

  it('drops pulls without an id instead of producing an empty path segment', async () => {
    const fetchStub = vi.fn(async () =>
      jsonResponse([
        { id: 'p1', number: 1, title: 'a', status: 'open' },
        { id: null, number: 2, title: 'b', status: 'open' },
        { number: 3, title: 'c', status: 'open' },
      ]),
    );
    const api = new HttpDevDigestApi(config(), fetchStub as unknown as typeof fetch);
    await expect(api.listPulls('r1')).resolves.toEqual([{ id: 'p1', number: 1, title: 'a', status: 'open' }]);
  });
});
