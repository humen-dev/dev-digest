/**
 * Tests for retro-tools.mjs — run: node --test .claude/skills/workflow-retro/scripts/retro-tools.test.mjs
 * Works on a synthetic session written to a temp dir (no real journals needed).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyze, classifyError, parseLedger, projectDirFor, trend, usageOf } from './retro-tools.mjs';

const usage = (out, read = 1000) => ({ input_tokens: 2, output_tokens: out, cache_read_input_tokens: read, cache_creation_input_tokens: 10 });
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'retro-'));
  const session = path.join(dir, 'sess.jsonl');
  const sub = path.join(dir, 'sess', 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(
    session,
    jsonl([
      // two agents launched in ONE message → parallel
      { type: 'assistant', timestamp: '2026-01-01T00:00:00Z', message: { id: 'm1', model: 'claude-opus-x', usage: usage(5), content: [{ type: 'tool_use', id: 'tu1', name: 'Agent', input: { subagent_type: 'researcher', description: 'A' } }] } },
      { type: 'assistant', timestamp: '2026-01-01T00:00:00Z', message: { id: 'm1', model: 'claude-opus-x', usage: usage(50), content: [{ type: 'tool_use', id: 'tu2', name: 'Agent', input: { subagent_type: 'researcher', description: 'B' } }] } },
      { type: 'assistant', timestamp: '2026-01-01T00:01:00Z', message: { id: 'm2', model: 'claude-opus-x', usage: usage(7), content: [{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: {} }] } },
      { type: 'user', timestamp: '2026-01-01T00:03:00Z', message: { content: [{ type: 'tool_result', tool_use_id: 'q1', content: 'answered' }] } },
      { type: 'assistant', timestamp: '2026-01-01T00:04:00Z', message: { id: 'm3', model: 'claude-opus-x', usage: usage(3), content: [{ type: 'tool_use', id: 's1', name: 'SendMessage', input: { to: 'aaa', message: 'go' } }, { type: 'tool_use', id: 'r0', name: 'Read', input: { file_path: 'X/shared.md' } }] } },
    ]),
  );
  const agentRows = (id, readPath, extra = []) =>
    jsonl([
      { type: 'user', timestamp: '2026-01-01T00:00:01Z', message: { content: 'prompt' } },
      { type: 'assistant', timestamp: '2026-01-01T00:00:05Z', message: { id: `${id}1`, model: 'claude-sonnet-x', usage: usage(1, 500), content: [{ type: 'tool_use', id: `${id}r`, name: 'Read', input: { file_path: readPath } }] } },
      { type: 'assistant', timestamp: '2026-01-01T00:00:05Z', message: { id: `${id}1`, model: 'claude-sonnet-x', usage: usage(40, 500), content: [{ type: 'tool_use', id: `${id}w`, name: 'Write', input: { file_path: 'out.md' } }] } },
      ...extra,
      { type: 'assistant', timestamp: '2026-01-01T00:00:30Z', message: { id: `${id}2`, model: 'claude-sonnet-x', usage: usage(20, 600), content: [{ type: 'text', text: 'Report. One claim is an inference, not verified.' }] } },
    ]);
  writeFileSync(
    path.join(sub, 'agent-aaa.jsonl'),
    agentRows('a', 'x\\shared.md', [
      { type: 'user', timestamp: '2026-01-01T00:00:06Z', message: { content: [{ type: 'tool_result', tool_use_id: 'aw', is_error: true, content: 'The user declined this action' }] } },
      { type: 'assistant', timestamp: '2026-01-01T00:00:07Z', message: { id: 'a3', model: 'claude-sonnet-x', usage: usage(9, 0), content: [{ type: 'tool_use', id: 'aw2', name: 'Write', input: { file_path: 'out.md' } }] } },
    ]),
  );
  writeFileSync(path.join(sub, 'agent-aaa.meta.json'), JSON.stringify({ agentType: 'researcher', description: 'A', toolUseId: 'tu1', spawnDepth: 1 }));
  writeFileSync(path.join(sub, 'agent-bbb.jsonl'), agentRows('b', 'X/Shared.md'));
  writeFileSync(path.join(sub, 'agent-bbb.meta.json'), JSON.stringify({ agentType: 'researcher', description: 'B', toolUseId: 'tu2', spawnDepth: 2 }));
  return session;
}

test('usage is counted once per message.id (largest output wins), not per journal line', () => {
  const lines = [
    { type: 'assistant', message: { id: 'x', usage: usage(5, 1000) } },
    { type: 'assistant', message: { id: 'x', usage: usage(80, 1000) } },
    { type: 'assistant', message: { id: 'y', usage: usage(10, 200) } },
  ];
  assert.deepEqual(usageOf(lines), { input: 4, output: 90, cache_read: 1200, cache_write: 20, turns: 2 });
});

test('analyze: per-agent facts, nesting, parallelism, resumes, rewrites, errors, markers', () => {
  const r = analyze({ sessionFile: fixture() });
  const [a, b] = r.agents;
  assert.equal(r.agents.length, 2);
  assert.equal(a.id, 'aaa');
  assert.equal(a.output, 40 + 9 + 20);
  assert.equal(a.cache_read, 500 + 0 + 600);
  assert.equal(a.parallelWith, 1);
  assert.equal(a.resumes, 1);
  assert.equal(a.rewrites.length, 1);
  assert.equal(a.errors[0].kind, 'denied');
  assert.equal(a.unverified_markers, 2);
  assert.equal(b.depth, 2);
  assert.equal(r.summary.nested_agents, 1);
  assert.equal(r.summary.human_wait_s, 120);
  assert.equal(r.summary.questions_to_human, 1);
  assert.equal(r.orchestrator.output, 50 + 7 + 3);
  assert.equal(r.summary.output, 69 + 60 + 60);
  assert.equal(r.summary.cost_usd, null);
});

test('analyze: duplicated reads are matched case- and slash-insensitively across agents and main', () => {
  const r = analyze({ sessionFile: fixture() });
  assert.equal(r.duplicated_reads.length, 1);
  assert.equal(r.duplicated_reads[0].readers, 3);
});

test('analyze: --since drops agents launched earlier; --prices yields a cost', () => {
  const session = fixture();
  assert.equal(analyze({ sessionFile: session, since: '2026-01-02T00:00:00Z' }).agents.length, 0);
  const priced = analyze({ sessionFile: session, prices: { sonnet: { in: 3, out: 15, cache_read: 0.3, cache_write: 3.75 }, opus: { in: 15, out: 75, cache_read: 1.5, cache_write: 18.75 } } });
  assert.ok(priced.summary.cost_usd > 0);
});

test('classifyError buckets common failures', () => {
  assert.equal(classifyError('Permission denied by hook'), 'denied');
  assert.equal(classifyError("couldn't open file:///x"), 'not-found');
  assert.equal(classifyError('Screenshot timed out after 5s'), 'timeout');
  assert.equal(classifyError('fatal: ambiguous argument'), 'command-failed');
});

test('trend: compares with the median of earlier runs of the same kind and formats a row', () => {
  const ledger = [
    '| date | label | kind | agents | out tok | cache-read | cache hit | wall s | parallelism | cost $ | outcome | top recommendation |',
    '|------|-------|------|--------|---------|------------|-----------|--------|-------------|--------|---------|--------------------|',
    '| 2026-01-01 | a | spec | 3 | 100 | 10 | 90% | 600 | 1.1 | 2 | approved | x |',
    '| 2026-01-02 | b | spec | 3 | 100 | 10 | 90% | 600 | 1.1 | n/a | approved | y |',
    '| 2026-01-03 | c | impl | 9 | 9000 | 10 | 90% | 6000 | 2 | 50 | merged | z |',
  ].join('\n');
  assert.equal(parseLedger(ledger).length, 3);
  const analysis = { summary: { agents: 2, nested_agents: 0, output: 300, cache_read: 5, cache_hit: 0.5, wall_s: 500, parallelism: 1, cost_usd: 3 } };
  const t = trend(analysis, { kind: 'spec', label: 'run', ledgerText: ledger, date: '2026-01-04' });
  assert.equal(t.previous_runs, 2);
  assert.equal(t.comparison.output.flag, 'higher');
  assert.equal(t.comparison.wall_s.flag, null);
  assert.match(t.row, /^\| 2026-01-04 \| run \| spec \| 2 \| 300 \|/);
});

test('projectDirFor mirrors the Claude Code project slug', () => {
  assert.match(projectDirFor('D:\\Code\\x-y'), /[\\/]\.claude[\\/]projects[\\/]D--Code-x-y$/);
});
