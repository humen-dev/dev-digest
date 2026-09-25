import { describe, it, expect, beforeEach } from 'vitest';
import type { CodeMatch, LLMProvider, RepoRef, StructuredRequest } from '@devdigest/shared';
import { ConventionsService } from '../src/modules/conventions/service.js';
import type {
  ConventionsDeps,
  RepoBasics,
  SkillCreateInput,
} from '../src/modules/conventions/ports.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { AppError, ConfigError } from '../src/platform/errors.js';
import { InMemoryConventionsRepo } from './helpers/conventions-fakes.js';

const WS = 'ws-1';
const REPO_ID = 'repo-1';

const USERS = [
  "import { db } from '@/lib/db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
].join('\n');
const REDIS = "import Redis from 'ioredis';\nexport const redis = new Redis(config.redisUrl);";
const USERS_TEST = "import { describe, it } from 'vitest';\ndescribe('users', () => {\n  it('works', () => {});\n});";

const FILES = {
  'package.json': '{ "name": "payments-api" }',
  'src/api/users.ts': USERS,
  'src/lib/redis.ts': REDIS,
  'test/users.test.ts': USERS_TEST,
};

const PROPOSALS = [
  {
    rule: 'Always use async/await instead of .then() chains',
    rationale: 'Flag new .then() chains.',
    evidence_path: 'src/api/users.ts',
    evidence_line: 9,
    evidence_snippet: 'const user = await db.users.find(id);',
    grep_literal: 'await db.',
    category: 'style',
    confidence: 0.91,
  },
  {
    rule: 'Invented rule citing code that does not exist',
    rationale: null,
    evidence_path: 'src/api/users.ts',
    evidence_line: 2,
    evidence_snippet: 'return fetch(url).then((r) => r.json());',
    grep_literal: null,
    category: 'api',
    confidence: 0.95,
  },
  {
    rule: 'Redis access goes through the src/lib/redis.ts singleton',
    rationale: null,
    evidence_path: 'src/lib/redis.ts',
    evidence_line: 2,
    evidence_snippet: 'export const redis = new Redis(config.redisUrl);',
    grep_literal: 'new Redis(config.redisUrl)',
    category: 'data_access',
    confidence: 0.85,
  },
  {
    rule: 'Files must end with a trailing newline',
    rationale: null,
    evidence_path: 'package.json',
    evidence_line: 1,
    evidence_snippet: '{ "name": "payments-api" }',
    grep_literal: null,
    category: 'style',
    confidence: 0.6,
  },
  {
    rule: 'Tests use vitest describe/it blocks',
    rationale: null,
    evidence_path: 'test/users.test.ts',
    evidence_line: 1,
    evidence_snippet: "import { describe, it } from 'vitest';",
    grep_literal: "from 'vitest'",
    category: 'testing',
    confidence: 0.8,
  },
];

class FakeCodeIndex {
  calls: string[] = [];
  constructor(private byPattern: (pattern: string) => CodeMatch[] | Error) {}
  async grep(_repo: RepoRef, pattern: string): Promise<CodeMatch[]> {
    this.calls.push(pattern);
    const r = this.byPattern(pattern);
    if (r instanceof Error) throw r;
    return r;
  }
}

const files = (n: number): CodeMatch[] =>
  Array.from({ length: n }, (_, i) => ({ path: `src\\f${i}.ts`, line: 1, text: 'x' }));

interface Setup {
  repo?: Partial<RepoBasics> | null;
  samples?: string[];
  llm?: LLMProvider | (() => Promise<LLMProvider>);
  apiCost?: number | null;
  proposals?: unknown[];
}

function build(opts: Setup = {}) {
  const conventions = new InMemoryConventionsRepo();
  const llm =
    opts.llm ??
    new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: { conventions: opts.proposals ?? PROPOSALS } } });
  const codeIndex = new FakeCodeIndex((pattern) => {
    if (pattern.includes('await')) return files(5);
    if (pattern.includes('Redis')) return files(1);
    if (pattern.includes('vitest')) return new Error('rg exploded');
    return [];
  });
  const created: Array<{ ws: string; input: SkillCreateInput }> = [];
  const repo: RepoBasics | undefined =
    opts.repo === null
      ? undefined
      : {
          id: REPO_ID,
          owner: 'acme',
          name: 'payments-api',
          fullName: 'acme/payments-api',
          defaultBranch: 'main',
          clonePath: '/clones/acme/payments-api',
          ...opts.repo,
        };
  const deps: ConventionsDeps = {
    conventions,
    repos: { getById: async (ws, id) => (ws === WS && id === REPO_ID ? repo : undefined) },
    repoIntel: {
      getConventionSamples: async () => opts.samples ?? ['src/api/users.ts', 'src/lib/redis.ts'],
      getRankedPaths: async () =>
        ['src/api/users.ts', 'src/lib/redis.ts', 'test/users.test.ts'].map((path, i) => ({ path, rank: 10 - i })),
    },
    files: new MockGitClient({ files: FILES, head: 'abc123' }),
    codeIndex,
    llm: typeof llm === 'function' ? llm : async () => llm,
    resolveModel: async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }),
    skills: {
      create: async (ws, input) => {
        created.push({ ws, input });
        return {
          id: 'skill-1',
          name: input.name,
          description: input.description,
          type: input.type,
          source: input.source,
          body: input.body,
          enabled: input.enabled,
          version: 1,
          evidence_files: input.evidenceFiles,
          body_tokens: 10,
          agent_count: 0,
        };
      },
    },
    tokenizer: { count: (t) => Math.ceil(t.length / 4) },
  };
  return { service: new ConventionsService(deps), conventions, codeIndex, llm, created };
}

async function expectAppError(p: Promise<unknown>, code: string, status: number) {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  expect((err as AppError).statusCode).toBe(status);
}

describe('ConventionsService.extract', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it('runs sample → propose → gate → dedupe → frequency and persists pending rows + a scan', async () => {
    ctx.conventions.seed({ workspaceId: WS, repoId: REPO_ID, rule: 'Every file ends with a trailing newline', status: 'rejected' });

    const board = await ctx.service.extract(WS, REPO_ID);

    const scan = board.last_scan!;
    expect(scan).toMatchObject({
      proposed: 5,
      dropped_ungrounded: 1,
      dropped_duplicate: 1,
      dropped_rare: 1,
      kept: 2,
      model: 'deepseek/deepseek-v4-flash',
      api_cost_usd: 0.001,
      head_sha: 'abc123',
    });
    expect(scan.sampled_files).toEqual(
      expect.arrayContaining(['package.json', 'src/api/users.ts', 'src/lib/redis.ts', 'test/users.test.ts']),
    );

    const pending = board.candidates.filter((c) => c.status === 'pending');
    expect(pending.map((c) => c.rule)).toEqual([
      'Always use async/await instead of .then() chains',
      'Tests use vitest describe/it blocks',
    ]);
    const asyncRule = pending[0]!;
    expect(asyncRule).toMatchObject({
      evidence_path: 'src/api/users.ts',
      evidence_line: 4, // corrected from the claimed 9
      evidence_snippet: 'const user = await db.users.find(id);',
      occurrences: 5,
      category: 'style',
    });
    // rg failed for the vitest literal → kept, unmeasured.
    expect(pending[1]!.occurrences).toBeNull();
  });

  it('passes decided rules to the model and the sample as untrusted, line-numbered blocks', async () => {
    ctx.conventions.seed({ workspaceId: WS, repoId: REPO_ID, rule: 'Use the @/ import alias', status: 'accepted' });
    ctx.conventions.seed({ workspaceId: WS, repoId: REPO_ID, rule: 'Files end with a newline', status: 'rejected' });
    await ctx.service.extract(WS, REPO_ID);

    const mock = ctx.llm as MockLLMProvider;
    const req = mock.calls.find((c) => c.method === 'completeStructured')!.req as StructuredRequest<unknown>;
    expect(req.schemaName).toBe('ConventionExtraction');
    expect(req.model).toBe('deepseek/deepseek-v4-flash');
    const user = req.messages[1]!.content;
    expect(user).toContain('<untrusted source="rejected-rules">\n- Files end with a newline');
    expect(user).toContain('<untrusted source="accepted-rules">\n- Use the @/ import alias');
    expect(user).toContain('<untrusted source="code:test/users.test.ts">');
    expect(user).toContain('4 │   const user = await db.users.find(id);');
  });

  it('a re-scan replaces only pending rows; decided rows survive untouched', async () => {
    const accepted = ctx.conventions.seed({ workspaceId: WS, repoId: REPO_ID, rule: 'Redis via singleton only', status: 'accepted' });
    const rejected = ctx.conventions.seed({ workspaceId: WS, repoId: REPO_ID, rule: 'Something rejected', status: 'rejected' });
    ctx.conventions.seed({ workspaceId: WS, repoId: REPO_ID, rule: 'Stale pending rule', status: 'pending' });

    const board = await ctx.service.extract(WS, REPO_ID);
    const rules = board.candidates.map((c) => c.rule);
    expect(rules).toContain(accepted.rule);
    expect(rules).toContain(rejected.rule);
    expect(rules).not.toContain('Stale pending rule');
    expect(board.candidates.find((c) => c.id === rejected.id)!.status).toBe('rejected');
  });

  it('stores a null cost when the provider reports no real cost (never the estimate)', async () => {
    const base = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: { conventions: [] } } });
    const llm: LLMProvider = {
      ...base,
      id: 'openai',
      listModels: () => base.listModels(),
      complete: (r) => base.complete(r),
      embed: (t) => base.embed(t),
      completeStructured: async (r) => ({ ...(await base.completeStructured(r)), costUsd: 0.5, apiCostUsd: null }),
    };
    const board = await build({ llm }).service.extract(WS, REPO_ID);
    expect(board.last_scan!.api_cost_usd).toBeNull();
    expect(board.last_scan!.kept).toBe(0);
  });

  it('404 for an unknown repo, 422 before any model call when there is no clone / no index', async () => {
    await expect(ctx.service.extract(WS, 'nope')).rejects.toMatchObject({ statusCode: 404 });

    const noClone = build({ repo: { clonePath: null } });
    await expectAppError(noClone.service.extract(WS, REPO_ID), 'repo_not_cloned', 422);
    expect((noClone.llm as MockLLMProvider).calls).toHaveLength(0);

    const noIndex = build({ samples: [] });
    await expectAppError(noIndex.service.extract(WS, REPO_ID), 'repo_not_indexed', 422);
  });

  it('422 model_not_configured when the provider key is missing', async () => {
    const svc = build({
      llm: async () => {
        throw new ConfigError('OPENROUTER_API_KEY is not configured');
      },
    }).service;
    await expectAppError(svc.extract(WS, REPO_ID), 'model_not_configured', 422);
  });

  it('409 while a scan of the same repo is already running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const base = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: { conventions: [] } } });
    const slow = build({
      llm: async () => {
        await gate;
        return base;
      },
    });
    const first = slow.service.extract(WS, REPO_ID);
    await expectAppError(slow.service.extract(WS, REPO_ID), 'scan_in_progress', 409);
    release();
    await first;
    // lock released → a new scan may start
    await expect(slow.service.extract(WS, REPO_ID)).resolves.toBeDefined();
  });
});

describe('ConventionsService triage + skill', () => {
  it('updates status / inline edits and 404s on an unknown id', async () => {
    const { service, conventions } = build();
    const row = conventions.seed({ workspaceId: WS, repoId: REPO_ID, rule: 'Old rule' });
    const updated = await service.update(WS, row.id, { rule: 'New rule', category: 'naming', status: 'accepted' });
    expect(updated).toMatchObject({ rule: 'New rule', category: 'naming', status: 'accepted' });
    await expect(service.update(WS, 'missing', { status: 'rejected' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('bulk status only touches this repo', async () => {
    const { service, conventions } = build();
    const a = conventions.seed({ workspaceId: WS, repoId: REPO_ID, rule: 'A', status: 'accepted' });
    const other = conventions.seed({ workspaceId: WS, repoId: 'other-repo', rule: 'B', status: 'accepted' });
    const board = await service.setStatusMany(WS, REPO_ID, [a.id, other.id], 'pending');
    expect(board.candidates.find((c) => c.id === a.id)!.status).toBe('pending');
    expect(other.status).toBe('accepted');
  });

  it('skill-draft merges accepted rows only and 422s when none are accepted', async () => {
    const { service, conventions } = build();
    await expectAppError(service.skillDraft(WS, REPO_ID), 'no_accepted_conventions', 422);

    conventions.seed({ workspaceId: WS, repoId: REPO_ID, rule: 'Accepted rule one', status: 'accepted', category: 'naming', evidencePath: 'src/b.ts' });
    conventions.seed({ workspaceId: WS, repoId: REPO_ID, rule: 'Accepted rule two', status: 'accepted', evidencePath: 'src/a.ts' });
    conventions.seed({ workspaceId: WS, repoId: REPO_ID, rule: 'Rejected rule', status: 'rejected' });
    const draft = await service.skillDraft(WS, REPO_ID);
    expect(draft).toMatchObject({
      name: 'payments-api-conventions',
      description: '2 house conventions extracted from payments-api',
      type: 'convention',
      enabled: true,
      evidence_files: ['src/a.ts', 'src/b.ts'],
    });
    expect(draft.body).toContain('Accepted rule one');
    expect(draft.body).not.toContain('Rejected rule');
    expect(draft.body_tokens).toBeGreaterThan(0);
  });

  it('createSkill persists ONE extracted skill and refuses non-accepted conventions', async () => {
    const { service, conventions, created } = build();
    const ok = conventions.seed({ workspaceId: WS, repoId: REPO_ID, rule: 'R1', status: 'accepted', evidencePath: 'src/x.ts' });
    const pending = conventions.seed({ workspaceId: WS, repoId: REPO_ID, rule: 'R2', status: 'pending' });
    const input = {
      name: 'payments-api-conventions',
      description: '1 house convention extracted from payments-api',
      type: 'convention' as const,
      enabled: true,
      body: '# edited body',
    };

    await expectAppError(
      service.createSkill(WS, REPO_ID, { ...input, convention_ids: [ok.id, pending.id] }),
      'conventions_not_accepted',
      422,
    );
    expect(created).toHaveLength(0);

    const skill = await service.createSkill(WS, REPO_ID, { ...input, convention_ids: [ok.id] });
    expect(skill.source).toBe('extracted');
    expect(created[0]!.input).toMatchObject({ body: '# edited body', source: 'extracted', evidenceFiles: ['src/x.ts'] });
  });

});
