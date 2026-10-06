/**
 * SPEC-01 (U7) — ReviewRunExecutor's project-context integration, pure unit
 * level: `container.projectContextService.resolveEffective` is STUBBED (no
 * DB, no real filesystem — that behavior is `project-context-service.test.ts`
 * / `project-context.it.test.ts`), so these tests exercise exactly what U7
 * owns: the run-executor's handling of the resolved result — what reaches
 * the engine/LLM, what the Live Log says, and what lands in the run trace.
 *
 * `ReviewRunExecutor.runOneAgent` is private; called here via an `any`
 * escape hatch (common white-box pattern for a class with one narrow
 * internal method under test) so each test can supply `diff`/`intentResult`
 * directly and skip `executeRuns`' DB-backed diff load entirely.
 */
import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import { RunLogger, type PinoLike } from '../src/platform/run-logger.js';
import { RunBus } from '../src/platform/sse.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { renderProjectContext } from '@devdigest/reviewer-core';
import type { Review } from '@devdigest/shared';
import type { Container } from '../src/platform/container.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';
import type { EnsureIntentResult, IntentForReviewPort } from '../src/modules/intent/ports.js';

const APPROVE_FIXTURE: Review = { verdict: 'approve', summary: 'Looks fine.', score: 95, findings: [] };

const UNAVAILABLE_INTENT: EnsureIntentResult = {
  status: 'unavailable',
  intent: null,
  record: null,
  reason: 'test',
};

/** Minimal `IntentForReviewPort` — never consulted by the assertions below. */
const INTENT_PORT: IntentForReviewPort = {
  ensureForReview: async () => UNAVAILABLE_INTENT,
};

const PULL = { id: 'pr-1', repoId: 'repo-1', number: 482, title: 'Add rate limiting', author: 'marisa.koch', body: null, headSha: 'a1b2c3' };
type RepoRowFixture = { id: string; owner: string; name: string; clonePath: string | null };
const REPO_ROW: RepoRowFixture = { id: 'repo-1', owner: 'acme', name: 'payments-api', clonePath: '/fake/clone' };
const AGENT = {
  id: 'agent-1',
  name: 'Sec',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt: 'You are a reviewer.',
  strategy: 'single-pass',
  repoIntel: false, // skip callers/repoMap/rank — irrelevant here, keeps the container fake minimal
  ciFailOn: 'never',
  version: 1,
};
const DIFF = { raw: '@@ -1 +1 @@\n+test line', files: [] };

type Entry = { path: string; source: string; tokens: number | null; status: string; bucket: string };
type Doc = { path: string; text: string };
type Resolved = { cloned: boolean; entries: Entry[]; docs: Doc[] };

/** `ReviewRepository`-shaped fake: records every trace + completion for assertions. */
function makeFakeRepo() {
  const traces: { runId: string; trace: any }[] = [];
  const completions: { runId: string; values: any }[] = [];
  const repo = {
    insertReview: vi.fn(async (values: any) => ({ id: 'review-1', ...values })),
    insertFindings: vi.fn(async (_reviewId: string, findings: any[]) => findings),
    markReviewed: vi.fn(async () => undefined),
    saveRunTrace: vi.fn(async (runId: string, trace: any) => {
      traces.push({ runId, trace });
    }),
    completeAgentRun: vi.fn(async (runId: string, values: any) => {
      completions.push({ runId, values });
    }),
  };
  return { repo: repo as unknown as ReviewRepository, traces, completions };
}

/**
 * Wires a `ReviewRunExecutor` with a fake `Container` exposing only what
 * `runOneAgent` touches when `agent.repoIntel: false` (llm, runBus,
 * projectContextService) — repo-intel/tokenizer are never reached.
 */
function setup(resolveEffective: (...args: unknown[]) => Promise<Resolved>, llm?: () => Promise<unknown>) {
  const runBus = new RunBus();
  const pino: PinoLike = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const { repo, traces, completions } = makeFakeRepo();
  const agents = { linkedSkills: vi.fn(async () => []) } as unknown as Container['agentsRepo'];
  const container = {
    runBus,
    projectContextService: { resolveEffective },
    llm: llm ?? (async () => new MockLLMProvider('openai', { structured: APPROVE_FIXTURE })),
  } as unknown as Container;
  const executor = new ReviewRunExecutor(container, repo, agents, INTENT_PORT);
  const runId = randomUUID();
  const parentLog = new RunLogger(runBus, [runId], pino);

  /** Calls the private `runOneAgent` directly (see file header). */
  const run = (overrides: { repoRow?: RepoRowFixture; diff?: typeof DIFF; agent?: typeof AGENT } = {}) =>
    (executor as any).runOneAgent(
      'ws-1',
      PULL,
      overrides.repoRow ?? REPO_ROW,
      overrides.diff ?? DIFF,
      overrides.agent ?? AGENT,
      runId,
      parentLog,
      UNAVAILABLE_INTENT,
    );

  return { run, runBus, pino, traces, completions, runId };
}

describe('ReviewRunExecutor — project context (SPEC-01, U7)', () => {
  it('no included doc → no projectContext reaches the engine; call count matches a run with attachments — AC-44, AC-45', async () => {
    const llmWithout = new MockLLMProvider('openai', { structured: APPROVE_FIXTURE });
    const withoutDocs = setup(async () => ({ cloned: true, entries: [], docs: [] }), async () => llmWithout);
    await withoutDocs.run();
    const reqWithout = llmWithout.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { role: string; content: string }[];
    };
    expect(reqWithout.messages.find((m) => m.role === 'user')!.content).not.toContain('## Project context');

    const llmWith = new MockLLMProvider('openai', { structured: APPROVE_FIXTURE });
    const withDocs = setup(
      async () => ({
        cloned: true,
        entries: [{ path: 'specs/a.md', source: 'agent', tokens: 3, status: 'included', bucket: 'specs' }],
        docs: [{ path: 'specs/a.md', text: 'Security baseline text' }],
      }),
      async () => llmWith,
    );
    await withDocs.run();

    expect(llmWithout.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(llmWith.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
  });

  it('a 30,000-token doc is sent whole, byte-identical — AC-47', async () => {
    const bigText = 'word '.repeat(30_000);
    const llm = new MockLLMProvider('openai', { structured: APPROVE_FIXTURE });
    const { run, traces } = setup(
      async () => ({
        cloned: true,
        entries: [{ path: 'specs/huge.md', source: 'agent', tokens: 30_000, status: 'included', bucket: 'specs' }],
        docs: [{ path: 'specs/huge.md', text: bigText }],
      }),
      async () => llm,
    );
    await run();
    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { role: string; content: string }[];
    };
    expect(req.messages.find((m) => m.role === 'user')!.content).toContain(bigText);
    expect(traces[0]!.trace.prompt_assembly.specs).toContain(bigText);
  });

  it('specs_read / project_context / prompt_assembly.specs for 1 included + 1 missing — AC-50, AC-51, AC-52', async () => {
    const entries: Entry[] = [
      { path: 'specs/a.md', source: 'agent', tokens: 5, status: 'included', bucket: 'specs' },
      { path: 'docs/gone.md', source: 'agent', tokens: null, status: 'skipped_missing', bucket: 'docs' },
    ];
    const docs: Doc[] = [{ path: 'specs/a.md', text: 'Baseline rules.' }];
    const llm = new MockLLMProvider('openai', { structured: APPROVE_FIXTURE });
    const { run, traces } = setup(async () => ({ cloned: true, entries, docs }), async () => llm);
    await run();

    const trace = traces[0]!.trace;
    expect(trace.specs_read).toEqual(['specs/a.md']);
    expect(trace.project_context).toEqual(entries);

    const expectedBlock = renderProjectContext(docs);
    expect(trace.prompt_assembly.specs).toBe(expectedBlock);
    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { role: string; content: string }[];
    };
    expect(req.messages.find((m) => m.role === 'user')!.content).toContain(expectedBlock!);
  });

  it('EC-2: a repo with a null clone path → no block, all entries skipped_not_cloned', async () => {
    const entries: Entry[] = [
      { path: 'specs/a.md', source: 'agent', tokens: null, status: 'skipped_not_cloned', bucket: 'specs' },
    ];
    const llm = new MockLLMProvider('openai', { structured: APPROVE_FIXTURE });
    const resolveEffective = vi.fn(async () => ({ cloned: false, entries, docs: [] }));
    const { run, traces } = setup(resolveEffective, async () => llm);
    await run({ repoRow: { ...REPO_ROW, clonePath: null } });

    expect(resolveEffective).toHaveBeenCalledWith('ws-1', AGENT.id, null);
    const trace = traces[0]!.trace;
    expect(trace.specs_read).toEqual([]);
    expect(trace.project_context).toEqual(entries);
    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { role: string; content: string }[];
    };
    expect(req.messages.find((m) => m.role === 'user')!.content).not.toContain('## Project context');
  });

  it('UT-8 (run): a secret doc is skipped_secret — its text never reaches the prompt or the trace', async () => {
    const entries: Entry[] = [
      { path: 'docs/leak.md', source: 'agent', tokens: null, status: 'skipped_secret', bucket: 'docs' },
    ];
    const llm = new MockLLMProvider('openai', { structured: APPROVE_FIXTURE });
    const { run, traces, runBus, runId } = setup(async () => ({ cloned: true, entries, docs: [] }), async () => llm);
    await run();

    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { role: string; content: string }[];
    };
    expect(req.messages.find((m) => m.role === 'user')!.content).not.toContain('docs/leak.md');
    expect(traces[0]!.trace.specs_read).toEqual([]);
    const lines = runBus.buffer(runId).map((e) => e.msg);
    expect(lines).toContain('Project context: docs/leak.md — skipped_secret');
  });

  it('NFR-3, NFR-10: Live Log — one line per non-included entry, then the pulled-counts summary', async () => {
    const entries: Entry[] = [
      { path: 'specs/a.md', source: 'agent', tokens: 5, status: 'included', bucket: 'specs' },
      { path: 'docs/b.md', source: 'agent', tokens: 5, status: 'included', bucket: 'docs' },
      { path: 'docs/gone.md', source: 'agent', tokens: null, status: 'skipped_missing', bucket: 'docs' },
    ];
    const docs: Doc[] = [
      { path: 'specs/a.md', text: 'a' },
      { path: 'docs/b.md', text: 'b' },
    ];
    const llm = new MockLLMProvider('openai', { structured: APPROVE_FIXTURE });
    const { run, runBus, runId } = setup(async () => ({ cloned: true, entries, docs }), async () => llm);
    await run();

    const lines = runBus.buffer(runId).map((e) => e.msg);
    expect(lines).toContain('Project context: docs/gone.md — skipped_missing');
    expect(lines).toContain('Pulled 0 memory items, 2 project specs');
    expect(lines.some((l) => l.startsWith('Project context: specs/a.md'))).toBe(false);
    expect(lines.some((l) => l.startsWith('Project context: docs/b.md'))).toBe(false);
  });

  it('NFR-7: a stubbed resolveEffective throw → the run still completes done, with one Live Log line', async () => {
    const llm = new MockLLMProvider('openai', { structured: APPROVE_FIXTURE });
    const { run, traces, completions, runBus, runId } = setup(async () => {
      throw new Error('db unavailable');
    }, async () => llm);
    await run();

    expect(completions[0]!.values.status).toBe('done');
    expect(traces[0]!.trace.specs_read).toEqual([]);
    expect(traces[0]!.trace.project_context).toEqual([]);
    const lines = runBus.buffer(runId).map((e) => e.msg);
    expect(lines).toContain('Project context unavailable: db unavailable — reviewing without it');
  });

  it('EC-16, EC-26: a model context-length error → the run fails; specs_read=[], project_context=null, error persisted', async () => {
    const entries: Entry[] = [{ path: 'specs/a.md', source: 'agent', tokens: 5, status: 'included', bucket: 'specs' }];
    const docs: Doc[] = [{ path: 'specs/a.md', text: 'rules' }];
    const failingLlm = {
      id: 'openai' as const,
      completeStructured: async () => {
        throw new Error('context_length_exceeded: the request exceeds the model maximum context length');
      },
    };
    const { run, traces, completions } = setup(async () => ({ cloned: true, entries, docs }), async () => failingLlm);

    await expect(run()).rejects.toThrow(/context_length_exceeded/);

    expect(completions[0]!.values.status).toBe('failed');
    expect(completions[0]!.values.error).toMatch(/context_length_exceeded/);
    expect(traces[0]!.trace.specs_read).toEqual([]);
    expect(traces[0]!.trace.project_context).toBeNull();
  });

  it("NFR-4: an attached doc's sentinel text never reaches a pino log call", async () => {
    const sentinel = 'TOP-SECRET-SENTINEL-9d2f';
    const entries: Entry[] = [{ path: 'specs/a.md', source: 'agent', tokens: 5, status: 'included', bucket: 'specs' }];
    const docs: Doc[] = [{ path: 'specs/a.md', text: sentinel }];
    const llm = new MockLLMProvider('openai', { structured: APPROVE_FIXTURE });
    const { run, pino } = setup(async () => ({ cloned: true, entries, docs }), async () => llm);
    await run();

    // The doc text DID reach the engine (sanity) — just never the stdout mirror.
    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { role: string; content: string }[];
    };
    expect(req.messages.find((m) => m.role === 'user')!.content).toContain(sentinel);
    for (const spy of [pino.info, pino.warn, pino.error, pino.debug]) {
      for (const call of (spy as ReturnType<typeof vi.fn>).mock.calls) {
        expect(JSON.stringify(call)).not.toContain(sentinel);
      }
    }
  });
});
