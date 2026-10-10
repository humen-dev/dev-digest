import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { EvalCaseDraftResponse, EvalCaseInput, EvalCaseRunInput, EvalCaseRunResult, EvalExpectation } from '@devdigest/shared';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (pkg: 'server' | 'client', file: string): string =>
  readFileSync(resolve(root, pkg, 'src/vendor/shared/contracts', file), 'utf8').replace(/\r\n/g, '\n');

/** Text between two markers: from the start of `from` up to the start of `to`. */
function region(text: string, from: string, to: string): string {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`markers not found: ${from} .. ${to}`);
  return text.slice(a, b);
}

const knowledge = (pkg: 'server' | 'client') =>
  region(read(pkg, 'knowledge.ts'), '// ---- Eval ----', '// ---- Memory ----');
const evalCi = (pkg: 'server' | 'client') =>
  region(read(pkg, 'eval-ci.ts'), '// Eval — case input', '// Compose Review');

describe('vendored eval contracts: server and client copies are identical', () => {
  it('knowledge.ts eval block', () => {
    const s = knowledge('server');
    expect(s).toContain('EvalExpectation');
    expect(knowledge('client')).toBe(s);
  });

  it('eval-ci.ts eval section', () => {
    const s = evalCi('server');
    expect(s).toContain('EvalCompare');
    expect(evalCi('client')).toBe(s);
  });

  it('eval-ci.ts region carries the SPEC-06 draft and Run case schemas (AC-80)', () => {
    const s = evalCi('server');
    for (const n of ['EvalCaseDraft', 'EvalCaseDraftResponse', 'EvalCaseRunInput', 'EvalCaseRunResult']) {
      expect(s).toContain(`export const ${n} =`);
    }
    expect(evalCi('client')).toBe(s);
  });

  it('detects a changed copy', () => {
    const altered = knowledge('client').replace('start_line', 'start_lines');
    expect(altered).not.toBe(knowledge('server'));
  });
});

describe('EvalExpectation (AC-47, UT-7)', () => {
  const ok = { type: 'must_find', file: 'a.ts', start_line: 1, end_line: 2 };
  const issuePaths = (v: unknown): string[] => {
    const r = EvalExpectation.safeParse(v);
    return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
  };

  it('accepts a valid expectation', () => {
    expect(EvalExpectation.safeParse(ok).success).toBe(true);
  });

  it('rejects an unknown type with its path', () => {
    expect(issuePaths({ ...ok, type: 'maybe' })).toContain('type');
  });

  it('rejects an operator object as type', () => {
    expect(issuePaths({ ...ok, type: { $gt: '' } })).toContain('type');
  });

  it('rejects an extra __proto__ key', () => {
    const withProto = JSON.parse('{"type":"must_find","file":"a.ts","start_line":1,"end_line":2,"__proto__":{"x":1}}');
    expect(EvalExpectation.safeParse(withProto).success).toBe(false);
  });

  it('rejects start_line > end_line on start_line', () => {
    expect(issuePaths({ ...ok, start_line: 5, end_line: 2 })).toContain('start_line');
  });

  it('rejects lines below 1', () => {
    expect(issuePaths({ ...ok, start_line: 0 })).toContain('start_line');
    expect(issuePaths({ ...ok, end_line: 0 })).toContain('end_line');
  });

  it('rejects an empty file', () => {
    expect(issuePaths({ ...ok, file: '' })).toContain('file');
  });
});

describe('EvalCaseInput limits (UT-8)', () => {
  const base = {
    name: 'n',
    input_diff: 'd',
    pr_title: 't',
    pr_body: null,
    expectation: { type: 'must_find', file: 'a.ts', start_line: 1, end_line: 1 },
  };

  it('accepts 120-char name and 2000-char notes', () => {
    expect(EvalCaseInput.safeParse({ ...base, name: 'x'.repeat(120), notes: 'y'.repeat(2000) }).success).toBe(true);
  });

  it('rejects a 121-char name with the field path', () => {
    const r = EvalCaseInput.safeParse({ ...base, name: 'x'.repeat(121) });
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join('.'))).toContain('name');
  });

  it('rejects 2001-char notes with the field path', () => {
    const r = EvalCaseInput.safeParse({ ...base, notes: 'y'.repeat(2001) });
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join('.'))).toContain('notes');
  });
});

describe('EvalCaseRunInput (UT-7, AC-47)', () => {
  const ok = {
    input_diff: 'd',
    pr_title: 't',
    pr_body: null,
    expectation: { type: 'must_find', file: 'a.ts', start_line: 1, end_line: 2 },
  };
  const paths = (v: unknown): string[] => {
    const r = EvalCaseRunInput.safeParse(v);
    return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
  };

  it('accepts a valid body', () => {
    expect(EvalCaseRunInput.safeParse(ok).success).toBe(true);
  });

  it('rejects an unknown key', () => {
    expect(EvalCaseRunInput.safeParse({ ...ok, name: 'x' }).success).toBe(false);
  });

  it('rejects an empty diff with the field path', () => {
    expect(paths({ ...ok, input_diff: '' })).toContain('input_diff');
  });

  it('rejects a bad expectation with the field path', () => {
    expect(paths({ ...ok, expectation: { ...ok.expectation, start_line: 5, end_line: 2 } })).toContain(
      'expectation.start_line',
    );
    expect(paths({ ...ok, expectation: { ...ok.expectation, type: 'maybe' } })).toContain('expectation.type');
  });
});

describe('EvalCaseDraftResponse (AC-1, AC-2)', () => {
  const draft = {
    agent_id: 'a1',
    agent_name: 'Agent',
    source_finding_id: 'f1',
    name: 'n',
    input_diff: 'd',
    input_files: ['a.ts'],
    input_meta: { pr_id: null, pr_number: null, title: 't', body: null },
    expectation: { type: 'must_find', file: 'a.ts', start_line: 1, end_line: 2 },
    severity: null,
    category: null,
  };

  it('parses the draft variant', () => {
    expect(EvalCaseDraftResponse.safeParse({ kind: 'draft', draft }).success).toBe(true);
  });

  it('parses the existing_case variant', () => {
    expect(EvalCaseDraftResponse.safeParse({ kind: 'existing_case', case_id: 'c1', owner_id: 'o1' }).success).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(EvalCaseDraftResponse.safeParse({ kind: 'other' }).success).toBe(false);
  });
});

describe('EvalCaseRunResult (AC-95, EC-32)', () => {
  it('parses an errored result with masked text', () => {
    const r = EvalCaseRunResult.safeParse({
      status: 'errored',
      pass: null,
      error_reason: 'timeout',
      findings_total: 0,
      findings_matched: 0,
      actual: [],
      duration_ms: 1,
      cost_usd: null,
      agent_version: 1,
      masked: { input_diff: 'd', pr_title: 't', pr_body: null },
    });
    expect(r.success).toBe(true);
  });
});
