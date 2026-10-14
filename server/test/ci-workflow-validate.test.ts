import { describe, expect, it } from 'vitest';
import { validateWorkflow } from '../src/modules/ci/domain/workflow-validate.js';

const RUN = 'node .devdigest-base/.devdigest/runner/index.js';
const sha = 'a'.repeat(40);
const wf = (extra: string, on = 'on:\n  pull_request:\n    types: [opened]', step = `- run: ${RUN}`) =>
  `${on}\n${extra}\njobs:\n  review:\n    runs-on: ubuntu-latest\n    steps:\n      ${step}\n`;
const codes = (text: string) => validateWorkflow(text).violations.map((v) => v.code);

describe('validateWorkflow', () => {
  it('accepts a minimal safe workflow', () => {
    expect(validateWorkflow(wf('permissions:\n  contents: read\n  pull-requests: write'))).toEqual({
      violations: [],
      warnings: [],
    });
  });

  it('invalid yaml is reported alone', () => {
    expect(codes('a: [unclosed\n  b: : :')).toEqual(['invalid_yaml']);
  });

  it('pull_request_target in string, array and map forms', () => {
    expect(codes(wf('', 'on: pull_request_target'))).toContain('pull_request_target');
    expect(codes(wf('', 'on: [push, pull_request_target]'))).toContain('pull_request_target');
    expect(codes(wf('', 'on:\n  pull_request_target:\n    types: [opened]'))).toContain('pull_request_target');
  });

  it('write permissions other than pull-requests', () => {
    expect(codes(wf('permissions: write-all'))).toContain('write_permission');
    expect(codes(wf('permissions:\n  contents: write'))).toContain('write_permission');
    expect(codes(wf('permissions:\n  pull-requests: write\n  contents: read'))).not.toContain('write_permission');
    const jobLevel = `on: pull_request\njobs:\n  r:\n    permissions:\n      issues: write\n    steps:\n      - run: ${RUN}\n`;
    expect(codes(jobLevel)).toContain('write_permission');
  });

  it('missing runner step', () => {
    expect(codes(wf('', undefined, '- run: echo hi'))).toEqual(['missing_runner_step']);
  });

  it('four hostile fixtures give four distinct codes (AC-14)', () => {
    const hostile = [
      'x: [unclosed\n  : :',
      wf('', 'on: pull_request_target'),
      wf('permissions: write-all'),
      wf('', undefined, '- run: echo hi'),
    ];
    expect(hostile.map((t) => codes(t)[0])).toEqual([
      'invalid_yaml',
      'pull_request_target',
      'write_permission',
      'missing_runner_step',
    ]);
  });

  it('warns on unpinned actions naming the ref, not on pinned or local ones (AC-16)', () => {
    const text = wf(
      '',
      undefined,
      `- uses: actions/checkout@v4\n      - uses: actions/setup-node@${sha}\n      - uses: ./local\n      - run: ${RUN}`,
    );
    expect(validateWorkflow(text).warnings).toEqual([{ code: 'unpinned_action', ref: 'actions/checkout@v4' }]);
  });
});
