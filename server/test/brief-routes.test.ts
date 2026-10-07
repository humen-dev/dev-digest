import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { BriefPage, type PrBriefRecord } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import type { BriefPrFile, BriefPull, BriefRepositoryPort } from '../src/modules/brief/ports.js';

/**
 * DB-free route tests; `auth` MUST be mocked too (server INSIGHTS 2026-09-21).
 * Generation is NOT exercised here: `featureModels.resolve` reads Settings from
 * the DB, so POST-to-generated is covered in `brief.it.test.ts`; the service
 * pipeline itself is covered in `brief-service.test.ts`.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const WORKSPACE = 'w1'; // MockAuthProvider's default workspace id
const PR_ID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_ID = '00000000-0000-4000-8000-000000000001';
const HEAD = 'sha-head';

class FakeBriefRepo implements BriefRepositoryPort {
  stored: unknown = null;
  async getPull(ws: string, id: string): Promise<BriefPull | null> {
    if (ws !== WORKSPACE || id !== PR_ID) return null;
    return {
      id: PR_ID,
      workspaceId: WORKSPACE,
      repoId: 'repo-1',
      number: 1,
      title: 'Add limiter',
      body: 'body',
      headSha: HEAD,
      repo: { owner: 'acme', name: 'demo', clonePath: null },
    };
  }
  async listPrFiles(): Promise<BriefPrFile[]> {
    return [];
  }
  async getIntent() {
    return null;
  }
  async getStored() {
    return this.stored;
  }
  async upsert(_id: string, _record: PrBriefRecord) {
    /* not used */
  }
}

const record: PrBriefRecord = {
  brief: {
    summary: 'Stored summary.',
    risks: [],
    review_focus: [{ file: 'src/a.ts', line: 2, reason: 'check' }],
  },
  provenance: {
    head_sha: HEAD,
    generated_at: '2026-10-07T09:00:00.000Z',
    provider: 'openai',
    model: 'gpt-4.1',
    attempts: 1,
    tokens_in: 1,
    tokens_out: 1,
    cost_usd: null,
    context_docs: [],
    dropped_inputs: [],
    missing_sources: [],
  },
};

describe('brief routes (no DB)', () => {
  let app: FastifyInstance;
  const repo = new FakeBriefRepo();

  beforeAll(async () => {
    app = await buildApp({ config, overrides: { auth: new MockAuthProvider(), briefRepo: repo } });
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /pulls/:id/brief → none, then the stored brief as a contract-valid page', async () => {
    const none = await app.inject({ method: 'GET', url: `/pulls/${PR_ID}/brief` });
    expect(none.statusCode).toBe(200);
    expect(BriefPage.parse(none.json())).toMatchObject({ status: 'none', brief: null, current_head_sha: HEAD });

    repo.stored = record;
    const got = await app.inject({ method: 'GET', url: `/pulls/${PR_ID}/brief` });
    const page = BriefPage.parse(got.json());
    expect(page.status).toBe('generated');
    expect(page.brief?.review_focus).toEqual([{ file: 'src/a.ts', line: 2, reason: 'check' }]);
  });

  it('404 for a PR outside the workspace (GET, POST with and without a body, candidates)', async () => {
    const cases = [
      { method: 'GET', url: `/pulls/${OTHER_ID}/brief` },
      { method: 'POST', url: `/pulls/${OTHER_ID}/brief` },
      { method: 'POST', url: `/pulls/${OTHER_ID}/brief`, payload: { regenerate: true } },
      { method: 'GET', url: `/pulls/${OTHER_ID}/brief/context-candidates` },
    ] as const;
    for (const c of cases) {
      const res = await app.inject(c);
      expect(res.statusCode, `${c.method} ${c.url}: ${res.body.slice(0, 600)}`).toBe(404);
    }
  });

  it('422 for a bad id and for a body that violates the schema', async () => {
    expect((await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/brief' })).statusCode).toBe(422);
    for (const payload of [{ context_paths: [''] }, { regenerate: 'yes' }, { context_paths: Array(51).fill('a.md') }]) {
      const res = await app.inject({ method: 'POST', url: `/pulls/${PR_ID}/brief`, payload });
      expect(res.statusCode, JSON.stringify(payload).slice(0, 40)).toBe(422);
    }
  });
});
