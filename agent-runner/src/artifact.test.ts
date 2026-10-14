import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { CiResultArtifact } from '@devdigest/shared';
import { buildResultArtifact, RUNNER_VERSION } from './artifact.js';

const finding = (severity: Finding['severity']): Finding => ({
  id: severity,
  severity,
  category: 'bug',
  title: 't',
  file: 'a.ts',
  start_line: 1,
  end_line: 1,
  rationale: 'r',
  confidence: 0.9,
  kind: 'finding',
});

describe('buildResultArtifact (SPEC-07 AC-49)', () => {
  it('counts severities and carries verdict, blockers, ci_fail_on, post outcome and runner v2', () => {
    const artifact = buildResultArtifact({
      findings: [finding('CRITICAL'), finding('WARNING'), finding('WARNING'), finding('SUGGESTION')],
      costUsd: 0.02,
      durationMs: 1234,
      agent: 'Security Reviewer',
      prNumber: 7,
      verdict: 'request_changes',
      blockers: 1,
      ciFailOn: 'critical',
      postOutcome: 'post_failed',
    });
    expect(CiResultArtifact.safeParse(artifact).success).toBe(true);
    expect(artifact).toEqual({
      findings_count: 4,
      critical: 1,
      warning: 2,
      suggestion: 1,
      cost_usd: 0.02,
      duration_ms: 1234,
      agent: 'Security Reviewer',
      version: RUNNER_VERSION,
      pr_number: 7,
      verdict: 'request_changes',
      blockers: 1,
      ci_fail_on: 'critical',
      post_outcome: 'post_failed',
    });
    expect(RUNNER_VERSION).toBe('2');
  });

  it('keeps a null cost and an empty finding list', () => {
    const artifact = buildResultArtifact({
      findings: [],
      costUsd: null,
      durationMs: 1,
      agent: 'a',
      prNumber: 1,
      verdict: 'approve',
      blockers: 0,
      ciFailOn: 'never',
      postOutcome: 'not_requested',
    });
    expect(artifact.cost_usd).toBeNull();
    expect(artifact.findings_count).toBe(0);
  });
});
