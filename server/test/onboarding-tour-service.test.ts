import { describe, it, expect, vi } from 'vitest';
import type { RepoRef } from '@devdigest/shared';
import { OnboardingTourService } from '../src/modules/onboarding/service.js';
import { isCommandSourcePath } from '../src/modules/onboarding/constants.js';
import type { OnboardingDeps, RepoBasics } from '../src/modules/onboarding/ports.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { AppError, ConfigError } from '../src/platform/errors.js';
import { EXCLUDED_DIRS, MAX_FILE_SIZE } from '../src/modules/repo-intel/types.js';
import {
  DeferredLLMProvider,
  FakeTourGit,
  InMemoryOnboardingRepo,
  fakeRepoIntel,
  type FakeRepoIntelOpts,
} from './helpers/onboarding-fakes.js';

const WS = 'ws-1';
const REPO_ID = 'repo-1';

const PACKAGE_JSON = JSON.stringify({ name: 'demo', scripts: { test: 'vitest run' } });
const MAKEFILE = 'build:\n\techo build\n';
const SECRET_FILE = 'token = ghp_abcdefghijklmnopqrstuvwxyz0123456789';

const FILES: Record<string, string> = {
  'README.md': 'Demo repo.',
  'src/app.ts': "import { db } from './lib/db';\nexport function main() { return db; }",
  'src/lib/db.ts': 'export const db = {};',
  'package.json': PACKAGE_JSON,
  Makefile: MAKEFILE,
};

const DRAFT = {
  overview: 'Entry point is `src/app.ts`.',
  diagram: '',
  critical_paths: [{ path: 'src/lib/db.ts', note: 'DB layer' }],
  how_to_run: [{ command: 'npm test', note: 'runs the tests' }],
  guided_reading: [{ path: 'src/app.ts', reason: 'entry point' }],
  first_tasks: [{ title: 'Add a test', target: 'src/new.test.ts', complexity: 'low' as const }],
};

const EMPTY_DRAFT = {
  overview: '',
  diagram: '',
  critical_paths: [],
  how_to_run: [],
  guided_reading: [],
  first_tasks: [],
};

interface LogCalls {
  info: unknown[];
  warn: unknown[];
}

function fakeLog(): { log: { info: (o: unknown) => void; warn: (o: unknown) => void }; calls: LogCalls } {
  const calls: LogCalls = { info: [], warn: [] };
  return { log: { info: (o) => calls.info.push(o), warn: (o) => calls.warn.push(o) }, calls };
}

interface Setup {
  repo?: Partial<RepoBasics> | null;
  files?: Record<string, string>;
  sizes?: Record<string, number>;
  repoIntel?: FakeRepoIntelOpts;
  llm?: unknown;
  llmFactory?: OnboardingDeps['llm'];
  excludedDirs?: string[];
  timeoutMs?: number;
  now?: () => number;
  /** Share one backing store across builds (AC-35, EC-10, EC-17, getState staleness). */
  onboarding?: InMemoryOnboardingRepo;
}

function build(opts: Setup = {}) {
  const onboarding = opts.onboarding ?? new InMemoryOnboardingRepo();
  const git = new FakeTourGit(opts.files ?? FILES, opts.sizes ?? {});
  const llm = opts.llm ?? new MockLLMProvider('openai', { structuredBySchema: { OnboardingTourDraft: DRAFT } });
  const repoIntel = fakeRepoIntel({
    topFiles: ['src/app.ts'],
    criticalPaths: [['src/app.ts', 'src/lib/db.ts']],
    rankedPaths: [
      { path: 'src/app.ts', rank: 10 },
      { path: 'src/lib/db.ts', rank: 9 },
      { path: 'package.json', rank: 8 },
      { path: 'Makefile', rank: 7 },
      { path: 'README.md', rank: 6 },
    ],
    importerCounts: { 'src/lib/db.ts': 3 },
    ...opts.repoIntel,
  });
  const repo: RepoBasics | undefined =
    opts.repo === null
      ? undefined
      : {
          id: REPO_ID,
          owner: 'acme',
          name: 'demo',
          fullName: 'acme/demo',
          defaultBranch: 'main',
          clonePath: '/clones/acme/demo',
          ...opts.repo,
        };

  const deps: OnboardingDeps = {
    onboarding,
    repos: { getById: async (ws, id) => (ws === WS && id === REPO_ID ? repo : undefined) },
    git,
    repoIntel,
    llm: opts.llmFactory ?? (async () => llm as never),
    resolveModel: async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }),
    tokenizer: { count: (text: string) => Math.ceil(text.length / 4) },
    loadSystemPrompt: async () => 'SYSTEM PROMPT',
    excludedDirs: opts.excludedDirs ?? [...EXCLUDED_DIRS],
    maxFileBytes: MAX_FILE_SIZE,
    timeoutMs: opts.timeoutMs ?? 120_000,
    now: opts.now,
  };
  const service = new OnboardingTourService(deps);
  return { service, onboarding, git, repoIntel, llm, deps };
}

describe('OnboardingTourService.generate — happy path', () => {
  it('grounds the draft, fills importer_count, and persists one row (AC-27, AC-37, AC-38, AC-54)', async () => {
    const { service, onboarding, llm } = build();
    const { log, calls } = fakeLog();

    const tour = await service.generate(WS, REPO_ID, log);

    expect(tour.tour_commit).toBe('sha-a'); // AC-38: pinned to the indexed commit
    expect(tour.model).toBe('deepseek/deepseek-v4-flash');
    expect(tour.api_cost_usd).toBe(0.001); // AC-54: real provider cost stored
    expect(tour.tracked_file_count).toBe(5);
    expect(tour.indexed_file_count).toBe(10);
    expect(tour.architecture.overview_paths).toEqual(['src/app.ts']);
    expect(tour.critical_paths).toEqual([{ path: 'src/lib/db.ts', note: 'DB layer', importer_count: 3 }]); // AC-27
    expect(tour.guided_reading).toEqual([{ path: 'src/app.ts', reason: 'entry point', importer_count: 0 }]);
    expect(tour.how_to_run).toEqual([{ command: 'npm test', note: 'runs the tests', source: 'package.json' }]);
    expect(tour.first_tasks).toEqual([
      { title: 'Add a test', target: 'src/new.test.ts', complexity: 'low', new_file: true },
    ]);

    expect(onboarding.rows.size).toBe(1);
    expect((llm as MockLLMProvider).calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    const req = (llm as MockLLMProvider).calls.find((c) => c.method === 'completeStructured')!.req as {
      maxTokens?: number;
    };
    expect(req.maxTokens).toBe(4000); // AC-37, NFR-2

    // NFR-6: one log line, required fields present, never file text.
    expect(calls.info).toHaveLength(1);
    const line = JSON.stringify(calls.info[0]);
    expect(line).toContain('"repoId":"repo-1"');
    expect(line).toContain('"commit":"sha-a"');
    expect(line).not.toContain('Demo repo'); // README.md's content never logged
  });

  it('AC-35: a second generation replaces the stored row with the new content', async () => {
    const { service, onboarding } = build();
    await service.generate(WS, REPO_ID);
    expect(onboarding.rows.size).toBe(1);

    const secondDraft = { ...DRAFT, overview: 'Second `src/app.ts` overview.' };
    const { service: service2 } = build({
      onboarding,
      llm: new MockLLMProvider('openai', { structuredBySchema: { OnboardingTourDraft: secondDraft } }),
    });
    const tour2 = await service2.generate(WS, REPO_ID);

    expect(onboarding.rows.size).toBe(1);
    expect(tour2.architecture.overview).toBe('Second `src/app.ts` overview.');
  });

  it('NFR-5: the same mock output twice yields equal tours apart from time/duration/cost', async () => {
    const run = async () => {
      const { service } = build();
      return service.generate(WS, REPO_ID);
    };
    const [a, b] = await Promise.all([run(), run()]);
    const strip = (t: typeof a) => ({ ...t, generated_at: '', duration_ms: 0, api_cost_usd: null });
    expect(strip(a)).toEqual(strip(b));
  });

  it('AC-42: a config-excluded dir drops its file from the candidate set; without it, the file is kept', async () => {
    const files = { ...FILES, 'resources/lib/x.js': 'export const x = 1;' };
    const repoIntelOpts: FakeRepoIntelOpts = {
      topFiles: ['src/app.ts', 'resources/lib/x.js'],
      criticalPaths: [['src/app.ts', 'src/lib/db.ts']],
      rankedPaths: [{ path: 'resources/lib/x.js', rank: 5 }],
      importerCounts: {},
    };

    const excluded = build({ files, repoIntel: repoIntelOpts, excludedDirs: [...EXCLUDED_DIRS, 'lib'] });
    await excluded.service.generate(WS, REPO_ID);
    expect(excluded.git.readFileAtCalls).not.toContain('resources/lib/x.js');

    const included = build({ files, repoIntel: repoIntelOpts });
    await included.service.generate(WS, REPO_ID);
    expect(included.git.readFileAtCalls).toContain('resources/lib/x.js');
  });

  it('AC-43: resolveModel\'s choice is used; the service never hardcodes a model', async () => {
    const { service, llm } = build();
    await service.generate(WS, REPO_ID);
    const req = (llm as MockLLMProvider).calls.find((c) => c.method === 'completeStructured')!.req as {
      model?: string;
    };
    expect(req.model).toBe('deepseek/deepseek-v4-flash');
  });

  it('AC-54: apiCostUsd null + costUsd set stores a null cost (model/duration/counters still stored)', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { OnboardingTourDraft: DRAFT } });
    const { service, onboarding } = build({
      llmFactory: async () => ({
        ...llm,
        completeStructured: async (req: Parameters<MockLLMProvider['completeStructured']>[0]) => {
          const r = await llm.completeStructured(req);
          return { ...r, apiCostUsd: null };
        },
      }) as never,
    });
    const tour = await service.generate(WS, REPO_ID);
    expect(tour.api_cost_usd).toBeNull();
    expect(tour.model).toBeTruthy();
    expect(tour.duration_ms).toBeGreaterThanOrEqual(0);
    expect(onboarding.rows.get(REPO_ID)?.apiCostUsd).toBeNull();
  });
});

describe('OnboardingTourService.generate — AC-39, AC-40, NFR-1 caps', () => {
  it('a large repo is capped to ≤ 20 excerpts, ≤ 300 tree entries, ≤ 20,000 counted tokens', async () => {
    const TRACKED_COUNT = 350; // more than the 300-entry tree cap
    const CANDIDATE_COUNT = 30; // more than the 20-excerpt cap

    const files: Record<string, string> = {};
    for (let i = 0; i < TRACKED_COUNT; i++) {
      files[`file${String(i).padStart(4, '0')}.ts`] = `export const v${i} = ${i};\n`;
    }
    const trackedPaths = Object.keys(files);
    const topFiles = trackedPaths.slice(0, CANDIDATE_COUNT); // rank order
    const rankedPaths = trackedPaths.map((path, idx) => ({ path, rank: TRACKED_COUNT - idx }));

    const { service, llm } = build({
      files,
      repoIntel: { topFiles, criticalPaths: [], rankedPaths, importerCounts: {} },
    });

    await service.generate(WS, REPO_ID);

    const req = (llm as MockLLMProvider).calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { role: string; content: string }[];
    };
    const userMessage = req.messages.find((m) => m.role === 'user')!.content;

    const excerptMatch = userMessage.match(/## Key file excerpts \((\d+)\)/);
    expect(excerptMatch).not.toBeNull();
    expect(Number(excerptMatch![1])).toBeLessThanOrEqual(20); // AC-40

    const treeMatch = userMessage.match(/## File tree \((\d+)\)/);
    expect(treeMatch).not.toBeNull();
    expect(Number(treeMatch![1])).toBeLessThanOrEqual(300); // AC-39

    // Same counting rule the service wires in (build()'s tokenizer stub): chars / 4.
    const fullPromptText = req.messages.map((m) => m.content).join('\n');
    expect(Math.ceil(fullPromptText.length / 4)).toBeLessThanOrEqual(20_000); // NFR-1
  });
});

describe('OnboardingTourService.generate — grounding + secrets', () => {
  it('UT-7: a tracked file containing a secret-shaped token never reaches the prompt', async () => {
    const files = { ...FILES, 'src/leak.ts': SECRET_FILE };
    const { service, llm } = build({
      files,
      repoIntel: {
        topFiles: ['src/app.ts', 'src/leak.ts'],
        criticalPaths: [['src/app.ts', 'src/lib/db.ts']],
        rankedPaths: [{ path: 'src/leak.ts', rank: 11 }],
        importerCounts: {},
      },
    });
    await service.generate(WS, REPO_ID);
    const prompt = JSON.stringify((llm as MockLLMProvider).calls[0]!.req);
    expect(prompt).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('UT-6/UT-12: `.env` and an oversized file are never read', async () => {
    const files = { ...FILES, '.env': 'SECRET=1', 'big.bin': 'x'.repeat(10) };
    const { service, git } = build({
      files,
      sizes: { 'big.bin': MAX_FILE_SIZE + 1 },
      repoIntel: {
        topFiles: ['src/app.ts', '.env', 'big.bin'],
        criticalPaths: [['src/app.ts', 'src/lib/db.ts']],
        rankedPaths: [],
        importerCounts: {},
      },
    });
    await service.generate(WS, REPO_ID);
    expect(git.readFileAtCalls).not.toContain('.env');
    expect(git.readFileAtCalls).not.toContain('big.bin');
  });

  it('EC-14: an all-invented draft grounds to nothing → 422 nothing_grounded, no row written', async () => {
    const { service, onboarding } = build({
      llm: new MockLLMProvider('openai', {
        structuredBySchema: {
          OnboardingTourDraft: {
            overview: '',
            diagram: '',
            critical_paths: [{ path: 'does/not/exist.ts', note: 'x' }],
            how_to_run: [{ command: 'totally made up command', note: '' }],
            guided_reading: [],
            first_tasks: [],
          },
        },
      }),
    });
    await expect(service.generate(WS, REPO_ID)).rejects.toMatchObject({ code: 'nothing_grounded', statusCode: 422 });
    expect(onboarding.rows.size).toBe(0);
  });

  it('EC-16: an empty repo → 422 repo_empty, 0 completeStructured calls', async () => {
    const { service, llm } = build({ files: {} });
    await expect(service.generate(WS, REPO_ID)).rejects.toMatchObject({ code: 'repo_empty', statusCode: 422 });
    expect((llm as MockLLMProvider).calls.filter((c) => c.method === 'completeStructured')).toHaveLength(0);
  });
});

describe('isCommandSourcePath — root / one-level-below restriction (B-1)', () => {
  it.each([
    ['README.md', true],
    ['README.rst', true],
    ['docs/README.md', true], // one level below root
    ['a/b/README.md', false], // two levels below root — excluded
    ['CONTRIBUTING.md', true],
    ['docs/CONTRIBUTING.md', true],
    ['a/b/CONTRIBUTING.md', false],
    ['setup.cfg', true],
    ['backend/setup.cfg', true],
    ['a/b/setup.cfg', false],
    ['package.json', true],
    ['server/package.json', true],
    ['packages/api/package.json', false],
  ])('%s → %s', (path, expected) => {
    expect(isCommandSourcePath(path)).toBe(expected);
  });
});

describe('OnboardingTourService.generate — command source classification (B-1)', () => {
  it('a README-only command repo grounds a verbatim command with source README.md', async () => {
    const readme = 'Install:\n\n    curl https://example.com/install.sh | sh\n';
    const files = { 'README.md': readme, 'src/app.ts': FILES['src/app.ts']! };
    const draft = {
      ...EMPTY_DRAFT,
      how_to_run: [{ command: 'curl https://example.com/install.sh | sh', note: 'install' }],
    };
    const { service } = build({
      files,
      repoIntel: {
        topFiles: ['src/app.ts'],
        criticalPaths: [],
        rankedPaths: [
          { path: 'README.md', rank: 5 },
          { path: 'src/app.ts', rank: 10 },
        ],
        importerCounts: {},
      },
      llm: new MockLLMProvider('openai', { structuredBySchema: { OnboardingTourDraft: draft } }),
    });

    const tour = await service.generate(WS, REPO_ID);

    // Went through the service's real classification (isCommandSourcePath +
    // groundCommand), not a hand-built commandSources Map — AC-49, AC-50.
    expect(tour.how_to_run).toEqual([
      { command: 'curl https://example.com/install.sh | sh', note: 'install', source: 'README.md' },
    ]);
  });

  it('CONTRIBUTING.md and setup.cfg are read as command sources and ground their verbatim commands', async () => {
    const contributing = 'Lint with:\n\n    make lint\n';
    const setupCfg = '[metadata]\nname = demo\n\n# Run:\n#   python setup.py check\n';
    const files = {
      'CONTRIBUTING.md': contributing,
      'setup.cfg': setupCfg,
      'src/app.ts': FILES['src/app.ts']!,
    };
    const draft = {
      ...EMPTY_DRAFT,
      how_to_run: [
        { command: 'make lint', note: 'lint' },
        { command: 'python setup.py check', note: 'check' },
      ],
    };
    const { service } = build({
      files,
      repoIntel: {
        topFiles: ['src/app.ts'],
        criticalPaths: [],
        rankedPaths: [
          { path: 'CONTRIBUTING.md', rank: 5 },
          { path: 'setup.cfg', rank: 4 },
          { path: 'src/app.ts', rank: 10 },
        ],
        importerCounts: {},
      },
      llm: new MockLLMProvider('openai', { structuredBySchema: { OnboardingTourDraft: draft } }),
    });

    const tour = await service.generate(WS, REPO_ID);

    expect(tour.how_to_run).toEqual([
      { command: 'make lint', note: 'lint', source: 'CONTRIBUTING.md' },
      { command: 'python setup.py check', note: 'check', source: 'setup.cfg' },
    ]);
  });
});

describe('OnboardingTourService.generate — check order + error taxonomy', () => {
  it('404 when the repo does not exist', async () => {
    const { service } = build({ repo: null });
    await expect(service.generate(WS, REPO_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('EC-4: no clone → 422 repo_not_cloned, 0 calls', async () => {
    const { service, llm } = build({ repo: { clonePath: null } });
    await expect(service.generate(WS, REPO_ID)).rejects.toMatchObject({ code: 'repo_not_cloned', statusCode: 422 });
    expect((llm as MockLLMProvider).calls).toHaveLength(0);
  });

  it('EC-34: no repo_index_state row → 422 repo_not_indexed, 0 calls', async () => {
    const { service, llm } = build({ repoIntel: { indexState: null } });
    await expect(service.generate(WS, REPO_ID)).rejects.toMatchObject({ code: 'repo_not_indexed', statusCode: 422 });
    expect((llm as MockLLMProvider).calls).toHaveLength(0);
  });

  for (const status of ['failed', 'degraded'] as const) {
    it(`EC-34: index status "${status}" → 422 index_not_ready, 0 calls`, async () => {
      const { service, llm } = build({ repoIntel: { indexState: { status } } });
      await expect(service.generate(WS, REPO_ID)).rejects.toMatchObject({ code: 'index_not_ready', statusCode: 422 });
      expect((llm as MockLLMProvider).calls).toHaveLength(0);
    });
  }

  it('EC-34: index status "partial" → 200 (generation proceeds)', async () => {
    const { service } = build({ repoIntel: { indexState: { status: 'partial' } } });
    await expect(service.generate(WS, REPO_ID)).resolves.toBeTruthy();
  });

  it('EC-9: a provider ConfigError → 422 model_not_configured, naming both Settings pages', async () => {
    const { service } = build({
      llmFactory: async () => {
        throw new ConfigError('OPENROUTER_API_KEY is not configured');
      },
    });
    await expect(service.generate(WS, REPO_ID)).rejects.toMatchObject({ code: 'model_not_configured', statusCode: 422 });
    try {
      await service.generate(WS, REPO_ID);
      throw new Error('expected generate() to reject');
    } catch (err) {
      expect((err as AppError).message).toContain('Settings → API keys');
      expect((err as AppError).message).toContain('Settings → Models');
    }
  });

  it('EC-10: a stub that throws → 502 external_service_error, previous tour intact', async () => {
    const onboarding = new InMemoryOnboardingRepo();
    const { service: good } = build({ onboarding });
    const first = await good.generate(WS, REPO_ID);

    const { service: bad } = build({
      onboarding,
      llmFactory: async () => ({
        id: 'openai',
        listModels: async () => [],
        complete: async () => {
          throw new Error('boom');
        },
        completeStructured: async () => {
          throw new Error('provider exploded');
        },
        embed: async () => [],
      }),
    });
    await expect(bad.generate(WS, REPO_ID)).rejects.toMatchObject({ code: 'external_service_error', statusCode: 502 });

    const stillThere = await onboarding.get(REPO_ID);
    expect(stillThere?.tourCommit).toBe(first.tour_commit);
  });

  it('EC-17: the repo is deleted mid-generation → replace() returns false, no row', async () => {
    const onboarding = new InMemoryOnboardingRepo();
    onboarding.existingRepoIds = new Set(); // repo already "gone" by the time replace() runs
    const deferred = new DeferredLLMProvider();
    const { service } = build({ onboarding, llmFactory: async () => deferred });

    const pending = service.generate(WS, REPO_ID);
    await vi.waitFor(() => expect(deferred.calls).toBe(1));
    deferred.resolveWith(DRAFT);
    await expect(pending).resolves.toBeTruthy();
    expect(onboarding.rows.size).toBe(0);
  });
});

describe('OnboardingTourService — in-flight + timeout', () => {
  it('EC-7: a second POST while one is running → 409 generation_in_progress; GET shows generating: true', async () => {
    const deferred = new DeferredLLMProvider();
    const { service } = build({ llmFactory: async () => deferred });

    const first = service.generate(WS, REPO_ID);
    await vi.waitFor(() => expect(deferred.calls).toBe(1));

    await expect(service.generate(WS, REPO_ID)).rejects.toMatchObject({
      code: 'generation_in_progress',
      statusCode: 409,
    });
    const state = await service.getState(WS, REPO_ID);
    expect(state.generating).toBe(true);

    deferred.resolveWith(DRAFT);
    await expect(first).resolves.toBeTruthy();
    expect(deferred.calls).toBe(1);

    const settled = await service.getState(WS, REPO_ID);
    expect(settled.generating).toBe(false);
  });

  it('EC-12, NFR-3: a 120s-silent stub → 504 generation_timeout; a late result is never stored', async () => {
    vi.useFakeTimers();
    try {
      const deferred = new DeferredLLMProvider();
      const onboarding = new InMemoryOnboardingRepo();
      const { service } = build({ onboarding, llmFactory: async () => deferred, timeoutMs: 120_000 });

      const pending = service.generate(WS, REPO_ID);
      const assertion = expect(pending).rejects.toMatchObject({ code: 'generation_timeout', statusCode: 504 });
      await vi.advanceTimersByTimeAsync(120_000);
      await assertion;

      // The stub now resolves — AFTER the race already lost.
      deferred.resolveWith(DRAFT);
      await vi.runOnlyPendingTimersAsync();
      expect(onboarding.rows.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('OnboardingTourService.getState', () => {
  it('AC-67, EC-36: stale when the stored commit differs from the current index; false with no index row', async () => {
    const { service, onboarding } = build();
    await service.generate(WS, REPO_ID);

    const stateAtA = await service.getState(WS, REPO_ID);
    expect(stateAtA.stale).toBe(false);
    expect(stateAtA.current_commit).toBe('sha-a');

    const { service: serviceAtB } = build({ onboarding, repoIntel: { indexState: { lastIndexedSha: 'sha-b' } } });
    const stateAtB = await serviceAtB.getState(WS, REPO_ID);
    expect(stateAtB.stale).toBe(true);
    expect(stateAtB.current_commit).toBe('sha-b');

    const { service: serviceNoIndex } = build({ onboarding, repoIntel: { indexState: null } });
    const stateNoIndex = await serviceNoIndex.getState(WS, REPO_ID);
    expect(stateNoIndex.stale).toBe(false);
    expect(stateNoIndex.current_commit).toBeNull();
    expect(stateNoIndex.index_status).toBeNull();
  });

  it('EC-19: a legacy {sections:[...]} row maps to tour: null', async () => {
    const { service, onboarding } = build();
    onboarding.seedLegacy(REPO_ID);
    const state = await service.getState(WS, REPO_ID);
    expect(state.tour).toBeNull();
  });

  it('cloned reflects repo.clonePath', async () => {
    const { service } = build({ repo: { clonePath: null } });
    const state = await service.getState(WS, REPO_ID);
    expect(state.cloned).toBe(false);
  });
});
