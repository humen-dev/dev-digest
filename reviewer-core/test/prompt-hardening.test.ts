/**
 * assemblePrompt / reviewPullRequest — `projectContext` slot (SPEC-01).
 * Pins: no-op when absent/empty (AC-44), the guard names "attached project
 * documents" once a doc is attached (UT-3), the legacy `specs` slot keeps
 * working until then (D3), and every map-reduce chunk sees the same block
 * (AC-45, AC-46, EC-25).
 */
import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { assemblePrompt } from '../src/prompt.js';
import { reviewPullRequest } from '../src/review/run.js';
import { parseUnifiedDiff } from '../../server/src/adapters/git/diff-parser.js';

const fixtureReview = {
  verdict: 'approve',
  summary: 'ok',
  score: 100,
  findings: [],
};

function threeFileDiffRaw(): string {
  return [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,2 +1,3 @@',
    ' line1',
    '+added a',
    ' line2',
    'diff --git a/src/b.ts b/src/b.ts',
    '--- a/src/b.ts',
    '+++ b/src/b.ts',
    '@@ -1,2 +1,3 @@',
    ' line1',
    '+added b',
    ' line2',
    'diff --git a/src/c.ts b/src/c.ts',
    '--- a/src/c.ts',
    '+++ b/src/c.ts',
    '@@ -1,2 +1,3 @@',
    ' line1',
    '+added c',
    ' line2',
  ].join('\n');
}

function recordingProvider(): { llm: LLMProvider; calls: { messages: { role: string; content: string }[]; tokensIn: number }[] } {
  const calls: { messages: { role: string; content: string }[]; tokensIn: number }[] = [];
  const llm: LLMProvider = {
    id: 'openrouter',
    async completeStructured<T>(req): Promise<StructuredResult<T>> {
      calls.push({ messages: req.messages as never, tokensIn: 10 });
      return {
        data: fixtureReview as unknown as T,
        model: req.model,
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0,
        apiCostUsd: null,
        raw: '',
        attempts: 1,
      };
    },
    async listModels() {
      return [];
    },
    async complete() {
      throw new Error('not used');
    },
    async embed() {
      return [];
    },
  };
  return { llm, calls };
}

describe('assemblePrompt — projectContext (SPEC-01)', () => {
  it('AC-44: empty/absent projectContext leaves messages + assembly unchanged', () => {
    const baseline = assemblePrompt({ system: 'AGENT-SYS', diff: 'DIFF', task: 'Review PR #1' });
    const withEmpty = assemblePrompt({
      system: 'AGENT-SYS',
      diff: 'DIFF',
      task: 'Review PR #1',
      projectContext: [],
    });
    const withAbsent = assemblePrompt({
      system: 'AGENT-SYS',
      diff: 'DIFF',
      task: 'Review PR #1',
      projectContext: undefined,
    });
    expect(withEmpty.messages[0]!.content).toBe(baseline.messages[0]!.content);
    expect(withAbsent.messages[0]!.content).toBe(baseline.messages[0]!.content);
    expect(withEmpty.assembly).toEqual(baseline.assembly);
    // Pre-feature system message is byte-identical: no mention of project documents.
    expect(baseline.messages[0]!.content).not.toContain('attached project documents');
  });

  it('UT-3: with docs, the guard names "attached project documents"', () => {
    const { messages } = assemblePrompt({
      system: 'AGENT-SYS',
      diff: 'DIFF',
      projectContext: [{ path: 'README.md', text: 'hello' }],
    });
    expect(messages[0]!.content).toContain('attached project documents');
  });

  it('UT-3: without the section, the guard is unchanged (no "attached project documents")', () => {
    const { messages } = assemblePrompt({ system: 'AGENT-SYS', diff: 'DIFF' });
    expect(messages[0]!.content).not.toContain('attached project documents');
  });

  it('D3: the legacy `specs` slot still renders when projectContext is absent', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'AGENT-SYS',
      diff: 'DIFF',
      specs: ['legacy spec chunk'],
    });
    expect(messages[1]!.content).toContain('## Project context');
    expect(messages[1]!.content).toContain('legacy spec chunk');
    expect(assembly.specs).toContain('legacy spec chunk');
  });

  it('`specs` is ignored once projectContext has ≥ 1 doc', () => {
    const { messages } = assemblePrompt({
      system: 'AGENT-SYS',
      diff: 'DIFF',
      specs: ['legacy spec chunk'],
      projectContext: [{ path: 'README.md', text: 'new doc text' }],
    });
    expect(messages[1]!.content).not.toContain('legacy spec chunk');
    expect(messages[1]!.content).toContain('new doc text');
  });
});

describe('reviewPullRequest — projectContext across map-reduce chunks', () => {
  it('AC-46, EC-25: every chunk receives the block; tokensIn sums the stub usages', async () => {
    const diff = parseUnifiedDiff(threeFileDiffRaw());
    const { llm, calls } = recordingProvider();
    const outcome = await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff,
      llm,
      strategy: 'map-reduce',
      projectContext: [{ path: 'README.md', text: 'project doc text' }],
    });
    expect(outcome.mode).toBe('map-reduce');
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      const user = call.messages.find((m) => m.role === 'user')!.content;
      expect(user).toContain('## Project context');
      expect(user).toContain('project doc text');
    }
    expect(outcome.tokensIn).toBe(calls.reduce((n, c) => n + c.tokensIn, 0));
  });

  it('AC-45: the number of LLM calls is the same with and without docs', async () => {
    const diff = parseUnifiedDiff(threeFileDiffRaw());

    const without = recordingProvider();
    await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff,
      llm: without.llm,
      strategy: 'map-reduce',
    });

    const withDocs = recordingProvider();
    await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff,
      llm: withDocs.llm,
      strategy: 'map-reduce',
      projectContext: [{ path: 'README.md', text: 'project doc text' }],
    });

    expect(withDocs.calls).toHaveLength(without.calls.length);
  });
});
