import { describe, it, expect } from 'vitest';
import type { AgentRunStatus, Severity } from '@devdigest/shared';
import {
  buildMatchGroups,
  type GroupInputFinding,
  type GroupInputRun,
} from '../src/modules/reviews/domain/match-groups.js';
import { computeTotals } from '../src/modules/reviews/domain/multi-agent-totals.js';
import { decodeRunsCursor, encodeRunsCursor } from '../src/modules/reviews/domain/runs-cursor.js';
import { deriveOverallState } from '../src/modules/reviews/domain/run-overall-state.js';
import { maskColumnError } from '../src/modules/reviews/domain/column-error.js';

const finding = (
  id: string,
  file: string,
  startLine: number,
  endLine: number,
  severity: Severity = 'WARNING',
  title = `title-${id}`,
): GroupInputFinding => ({ id, file, startLine, endLine, severity, title });

const run = (
  runId: string,
  findings: GroupInputFinding[],
  status: AgentRunStatus = 'done',
): GroupInputRun => ({
  runId,
  agentId: `agent-${runId}`,
  agentName: `Agent ${runId}`,
  agentDescription: `desc-${runId}`,
  status,
  findings,
});

describe('buildMatchGroups — grouping by file + inclusive range overlap (AC-46)', () => {
  it('merges overlapping ranges in the same file into one group', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('a', 'x.ts', 10, 20)]),
      run('r2', [finding('b', 'x.ts', 18, 25)]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.finding_ids.sort()).toEqual(['a', 'b']);
  });

  it('keeps the same line range in two different files as two groups', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('a', 'x.ts', 10, 20)]),
      run('r2', [finding('b', 'y.ts', 10, 20)]),
    ]);
    expect(groups.map((g) => g.file)).toEqual(['x.ts', 'y.ts']);
  });

  it('merges a transitive chain A~B~C even when A and C do not overlap', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('a', 'x.ts', 1, 10), finding('c', 'x.ts', 20, 30)]),
      run('r2', [finding('b', 'x.ts', 9, 21)]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.finding_ids).toEqual(['a', 'b', 'c']);
  });

  it('treats a shared boundary line (10-20 and 20-30) as overlap', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('a', 'x.ts', 10, 20)]),
      run('r2', [finding('b', 'x.ts', 20, 30)]),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('keeps adjacent non-overlapping ranges (10-20 and 21-30) apart', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('a', 'x.ts', 10, 20)]),
      run('r2', [finding('b', 'x.ts', 21, 30)]),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.line)).toEqual([10, 21]);
  });

  it('tolerates a reversed range (start > end) and still detects overlap', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('a', 'x.ts', 20, 10)]),
      run('r2', [finding('b', 'x.ts', 15, 16)]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.line).toBe(10);
  });

  it('groups by the path string only: a traversal-looking path is an opaque key (UT-7)', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('a', '../../etc/passwd', 1, 5)]),
      run('r2', [finding('b', '../../etc/passwd', 3, 4), finding('c', 'etc/passwd', 3, 4)]),
    ]);
    expect(groups.map((g) => [g.file, g.finding_ids.length])).toEqual([
      ['../../etc/passwd', 2],
      ['etc/passwd', 1],
    ]);
  });
});

describe('buildMatchGroups — group shape (AC-45, AC-47)', () => {
  it('uses the lowest start line, the top-severity title and one take per run in run order', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('a', 'x.ts', 18, 25, 'CRITICAL', 'SQL injection')]),
      run('r2', [finding('b', 'x.ts', 10, 20, 'SUGGESTION', 'Rename')]),
      run('r3', [finding('c', 'x.ts', 12, 14, 'WARNING', 'Null check')]),
    ]);
    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(g.file).toBe('x.ts');
    expect(g.line).toBe(10);
    expect(g.title).toBe('SQL injection');
    expect(g.takes.map((t) => [t.run_id, t.verdict, t.note])).toEqual([
      ['r1', 'CRITICAL', 'SQL injection'],
      ['r2', 'SUGGESTION', 'Rename'],
      ['r3', 'WARNING', 'Null check'],
    ]);
  });

  it('keeps every original finding id, including several findings of one run', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('a', 'x.ts', 1, 5), finding('b', 'x.ts', 4, 8)]),
      run('r2', [finding('c', 'x.ts', 8, 9)]),
    ]);
    expect(groups).toHaveLength(1);
    expect([...groups[0]!.finding_ids].sort()).toEqual(['a', 'b', 'c']);
  });

  it('a run with several findings in a group takes its highest-severity one', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('a', 'x.ts', 1, 5, 'SUGGESTION', 'minor'), finding('b', 'x.ts', 4, 8, 'CRITICAL', 'major')]),
    ]);
    expect(groups[0]!.takes[0]).toMatchObject({ verdict: 'CRITICAL', note: 'major' });
  });

  it('returns no groups when there are no findings', () => {
    expect(buildMatchGroups([run('r1', []), run('r2', [])])).toEqual([]);
  });
});

describe('buildMatchGroups — conflict definition', () => {
  it('an agent without a finding in the group is "ignored" with its description and makes it a conflict', () => {
    const groups = buildMatchGroups([run('r1', [finding('a', 'x.ts', 1, 5)]), run('r2', [])]);
    const g = groups[0]!;
    expect(g.takes[1]).toMatchObject({ run_id: 'r2', verdict: 'ignored', note: 'desc-r2' });
    expect(g.is_conflict).toBe(true);
  });

  it('is not a conflict when every agent reports the same severity', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('a', 'x.ts', 1, 5, 'WARNING')]),
      run('r2', [finding('b', 'x.ts', 3, 6, 'WARNING')]),
    ]);
    expect(groups[0]!.is_conflict).toBe(false);
  });

  it('is a conflict when agents report different severities', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('a', 'x.ts', 1, 5, 'WARNING')]),
      run('r2', [finding('b', 'x.ts', 3, 6, 'CRITICAL')]),
    ]);
    expect(groups[0]!.is_conflict).toBe(true);
  });
});

describe('buildMatchGroups — non-done runs (AC-53)', () => {
  it.each(['failed', 'cancelled', 'running'] as const)(
    'a %s run is excluded from grouping, shows as ignored with its status and causes no conflict',
    (status) => {
      const groups = buildMatchGroups([
        run('r1', [finding('a', 'x.ts', 1, 5)]),
        run('r2', [finding('ghost', 'x.ts', 1, 5, 'CRITICAL')], status),
      ]);
      expect(groups).toHaveLength(1);
      const g = groups[0]!;
      expect(g.finding_ids).toEqual(['a']);
      expect(g.takes[1]).toMatchObject({ run_id: 'r2', run_status: status, verdict: 'ignored' });
      expect(g.takes[0]).toMatchObject({ run_status: 'done', verdict: 'WARNING' });
      expect(g.is_conflict).toBe(false);
    },
  );

  it('findings of a non-done run do not bridge two otherwise separate groups', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('a', 'x.ts', 1, 5), finding('c', 'x.ts', 20, 25)]),
      run('r2', [finding('bridge', 'x.ts', 4, 21)], 'failed'),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('returns no groups when no run is done', () => {
    expect(buildMatchGroups([run('r1', [finding('a', 'x.ts', 1, 5)], 'failed')])).toEqual([]);
  });
});

describe('buildMatchGroups — determinism (NFR-5, EC-11)', () => {
  const makeRuns = (): GroupInputRun[] => [
    run('r1', [
      finding('a', 'b.ts', 5, 9, 'WARNING', 'A'),
      finding('c', 'a.ts', 30, 40, 'CRITICAL', 'C'),
      finding('e', 'a.ts', 2, 3, 'SUGGESTION', 'E'),
    ]),
    run('r2', [
      finding('b', 'b.ts', 9, 12, 'CRITICAL', 'B'),
      finding('d', 'a.ts', 35, 36, 'WARNING', 'D'),
      finding('f', 'a.ts', 2, 3, 'WARNING', 'F'),
    ]),
    run('r3', []),
  ];

  it('gives identical output for identical input (triage state is not an input)', () => {
    expect(buildMatchGroups(makeRuns())).toEqual(buildMatchGroups(makeRuns()));
  });

  it('is independent of finding order within runs', () => {
    const reversed = makeRuns().map((r) => ({ ...r, findings: [...r.findings].reverse() }));
    expect(buildMatchGroups(reversed)).toEqual(buildMatchGroups(makeRuns()));
  });

  it('is independent of the rotation of each run finding list', () => {
    const rotated = makeRuns().map((r) => ({
      ...r,
      findings: [...r.findings.slice(1), ...r.findings.slice(0, 1)],
    }));
    expect(buildMatchGroups(rotated)).toEqual(buildMatchGroups(makeRuns()));
  });

  it('sorts groups by file, then line', () => {
    const groups = buildMatchGroups(makeRuns());
    expect(groups.map((g) => `${g.file}:${g.line}`)).toEqual(['a.ts:2', 'a.ts:30', 'b.ts:5']);
  });

  it('breaks a severity tie for title and note by lowest start line, then id', () => {
    const groups = buildMatchGroups([
      run('r1', [finding('z', 'x.ts', 5, 9, 'WARNING', 'later'), finding('y', 'x.ts', 1, 6, 'WARNING', 'earlier')]),
    ]);
    expect(groups[0]!.title).toBe('earlier');
    expect(groups[0]!.takes[0]!.note).toBe('earlier');
  });
});

describe('computeTotals', () => {
  const createdAt = new Date('2026-10-12T08:00:00.000Z');
  const at = (sec: number) => new Date(createdAt.getTime() + sec * 1000);

  it('wall-clock is latest finishedAt minus createdAt, not the longest single agent duration', () => {
    // Agent 2 started late (finished at +30s), so wall-clock is 30s even if each agent ran < 30s.
    const out = computeTotals({
      createdAt,
      now: at(999),
      runs: [
        { status: 'done', finishedAt: at(10), costUsd: 0.1 },
        { status: 'done', finishedAt: at(30), costUsd: 0.2 },
      ],
    });
    expect(out.totalDurationMs).toBe(30_000);
  });

  it('while any run is still running, duration is now minus createdAt', () => {
    const out = computeTotals({
      createdAt,
      now: at(45),
      runs: [
        { status: 'done', finishedAt: at(10), costUsd: null },
        { status: 'running', finishedAt: null, costUsd: null },
      ],
    });
    expect(out.totalDurationMs).toBe(45_000);
  });

  it('is zero when nothing finished and nothing runs, and never negative', () => {
    expect(computeTotals({ createdAt, now: at(5), runs: [] }).totalDurationMs).toBe(0);
    expect(
      computeTotals({ createdAt, now: at(5), runs: [{ status: 'failed', finishedAt: at(-3), costUsd: null }] })
        .totalDurationMs,
    ).toBe(0);
  });

  it('sums known costs, counts unpriced runs, and treats a zero cost as known', () => {
    const out = computeTotals({
      createdAt,
      now: at(1),
      runs: [
        { status: 'done', finishedAt: at(1), costUsd: 0.1 },
        { status: 'done', finishedAt: at(1), costUsd: 0.2 },
        { status: 'done', finishedAt: at(1), costUsd: 0 },
        { status: 'failed', finishedAt: at(1), costUsd: null },
      ],
    });
    expect(out.totalCostUsd).toBe(0.3);
    expect(out.unpricedCount).toBe(1);
  });

  it('total cost is null (not 0) when no run has a known cost', () => {
    const out = computeTotals({
      createdAt,
      now: at(1),
      runs: [
        { status: 'done', finishedAt: at(1), costUsd: null },
        { status: 'done', finishedAt: at(1), costUsd: null },
      ],
    });
    expect(out.totalCostUsd).toBeNull();
    expect(out.unpricedCount).toBe(2);
  });
});

describe('runs cursor', () => {
  const ranAt = '2026-10-12T08:00:00.123456Z';
  const id = '0b6f3c1e-8a4d-4f7e-9c21-5d3a7e9b1c42';
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');

  it('round-trips and preserves microsecond precision', () => {
    const decoded = decodeRunsCursor(encodeRunsCursor({ ranAt, id }));
    expect(decoded).toEqual({ ranAt, id });
  });

  it('encodes to an opaque url-safe string that does not expose the raw timestamp', () => {
    const token = encodeRunsCursor({ ranAt, id });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain(ranAt);
  });

  it('accepts an uppercase uuid and a real leap day', () => {
    const c = { ranAt: '2028-02-29T00:00:00.000001Z', id: id.toUpperCase() };
    expect(decodeRunsCursor(encodeRunsCursor(c))).toEqual(c);
  });

  it.each([
    ['not base64/JSON', '!!!not-a-cursor!!!'],
    ['empty string', ''],
    ['JSON null', enc(null)],
    ['JSON array of wrong shape', enc([1, 2])],
    ['missing id', enc({ t: ranAt })],
    ['missing t', enc({ id })],
    ['numeric t', enc({ t: 1, id })],
    ['millisecond-only precision', enc({ t: '2026-10-12T08:00:00.123Z', id })],
    ['no Z suffix', enc({ t: '2026-10-12T08:00:00.123456', id })],
    ['calendar-invalid 2026-02-30', enc({ t: '2026-02-30T08:00:00.123456Z', id })],
    ['non-leap 2027-02-29', enc({ t: '2027-02-29T08:00:00.123456Z', id })],
    ['hour 24 rolling to next day', enc({ t: '2026-10-12T24:00:00.000000Z', id })],
    ['year 0000', enc({ t: '0000-01-01T00:00:00.000000Z', id })],
    ['id is not a uuid', enc({ t: ranAt, id: 'not-a-uuid' })],
    ['id with injected SQL', enc({ t: ranAt, id: `${id}'; drop table x;--` })],
  ])('rejects a malformed cursor: %s', (_label, raw) => {
    expect(decodeRunsCursor(raw)).toBeNull();
  });
});

describe('deriveOverallState', () => {
  it.each<[string, AgentRunStatus[], 'running' | 'done' | 'failed', number]>([
    ['all done', ['done', 'done'], 'done', 0],
    ['empty set is done', [], 'done', 0],
    ['any running wins over failures', ['running', 'failed', 'done'], 'running', 1],
    ['running with cancelled counts it as failed', ['running', 'cancelled'], 'running', 1],
    ['one failed, rest done', ['done', 'failed'], 'failed', 1],
    ['cancelled counts as failed', ['done', 'cancelled'], 'failed', 1],
    ['failed + cancelled both counted', ['failed', 'cancelled', 'done'], 'failed', 2],
    ['all failed', ['failed', 'failed'], 'failed', 2],
  ])('%s', (_label, statuses, state, failedCount) => {
    expect(deriveOverallState(statuses)).toEqual({ state, failedCount });
  });
});

describe('maskColumnError', () => {
  it('passes null through as null', () => {
    expect(maskColumnError(null)).toBeNull();
  });

  it('leaves text without secret-shaped tokens unchanged', () => {
    const text = 'Provider returned 429: rate limited (sk-short, mention of sk_live by name)';
    expect(maskColumnError(text)).toBe(text);
  });

  it.each([
    ['OpenRouter key', 'sk-or-v1-abcdef0123456789abcdef'],
    ['Anthropic key', 'sk-ant-api03-AbCdEf_0123456789-xyz'],
    ['OpenAI-style key', 'sk-AbCdEf0123456789AbCdEf'],
    ['GitHub token (shared redaction)', `ghp_${'a'.repeat(36)}`],
    ['AWS access key id (shared redaction)', 'AKIAABCDEFGHIJKLMNOP'],
  ])('masks a %s embedded in an error message', (_label, secret) => {
    const out = maskColumnError(`401 Unauthorized for key ${secret} on retry`);
    expect(out).toBe('401 Unauthorized for key *** on retry');
    expect(out).not.toContain(secret);
  });

  it('masks every key when several appear in one message', () => {
    const out = maskColumnError('a sk-or-v1-abcdef0123456789 b sk-ant-abcdefgh12345678 c');
    expect(out).toBe('a *** b *** c');
  });
});
