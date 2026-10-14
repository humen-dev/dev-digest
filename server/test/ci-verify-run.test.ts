import { describe, it, expect } from 'vitest';
import { verifyRun, type VerifyRunInput } from '../src/modules/ci/domain/verify-run.js';
import { WORKFLOW_PATH } from '../src/modules/ci/constants.js';

const SHA = 'a'.repeat(40);
const result = { findings_count: 2, cost_usd: 0.1, agent: 'reviewer' };
const meta = { commit_sha: SHA, repository: 'acme/app', repository_id: 99, pr_number: 5, pr_title: 'T' };

// Secret-shaped fixtures are built at runtime (server/INSIGHTS.md).
const fakeKey = ['s', 'k-', 'x'.repeat(24)].join('');

function input(over: Partial<VerifyRunInput> = {}): VerifyRunInput {
  return {
    run: { repository_id: 99, path: WORKFLOW_PATH, head_sha: SHA },
    installation: { githubRepoId: 99, repo: 'acme/app' },
    resultText: JSON.stringify(result),
    metaText: JSON.stringify(meta),
    secretValues: [],
    ...over,
  };
}

describe('verifyRun (AC-75, AC-77, UT-6, EC-19)', () => {
  it('accepts a valid run, tolerating an @ref suffix on the path', () => {
    const out = verifyRun(input({ run: { repository_id: 99, path: `${WORKFLOW_PATH}@refs/heads/main`, head_sha: SHA } }));
    expect(out).toMatchObject({ accepted: true, artifact: { findings_count: 2 }, meta: { pr_number: 5 } });
  });

  it('repoMismatch when run repository differs', () => {
    expect(verifyRun(input({ run: { repository_id: 1, path: WORKFLOW_PATH, head_sha: SHA } }))).toEqual({
      accepted: false,
      reason: 'repoMismatch',
    });
  });

  it('repoMismatch when run repository_id is null', () => {
    expect(verifyRun(input({ run: { repository_id: null, path: WORKFLOW_PATH, head_sha: SHA } }))).toEqual({
      accepted: false,
      reason: 'repoMismatch',
    });
  });

  it('repoMismatch when the installation has no repo id', () => {
    expect(verifyRun(input({ installation: { githubRepoId: null, repo: 'acme/app' } }))).toMatchObject({
      reason: 'repoMismatch',
    });
  });

  it('workflowPath on a different workflow', () => {
    expect(verifyRun(input({ run: { repository_id: 99, path: '.github/workflows/evil.yml', head_sha: SHA } }))).toEqual({
      accepted: false,
      reason: 'workflowPath',
    });
  });

  it('noResult when only the sidecar exists (EC-16)', () => {
    expect(verifyRun(input({ resultText: undefined }))).toEqual({ accepted: false, reason: 'noResult' });
  });

  it('resultSchema for invalid result', () => {
    expect(verifyRun(input({ resultText: '{"findings_count":"x"}' }))).toMatchObject({ reason: 'resultSchema' });
    expect(verifyRun(input({ resultText: 'not json' }))).toMatchObject({ reason: 'resultSchema' });
  });

  it('resultSchema for out-of-range numbers (B-1)', () => {
    const bad = (o: object) => verifyRun(input({ resultText: JSON.stringify({ ...result, ...o }) }));
    expect(bad({ findings_count: 5_000_000_000 })).toMatchObject({ reason: 'resultSchema' });
    expect(bad({ findings_count: -1 })).toMatchObject({ reason: 'resultSchema' });
    expect(bad({ duration_ms: 3_000_000_000 })).toMatchObject({ reason: 'resultSchema' });
    expect(bad({ cost_usd: -0.5 })).toMatchObject({ reason: 'resultSchema' });
    expect(bad({ findings_count: 2_147_483_647 })).toMatchObject({ accepted: true });
  });

  it('metaSchema for invalid or missing sidecar', () => {
    expect(verifyRun(input({ metaText: '{}' }))).toMatchObject({ reason: 'metaSchema' });
    expect(verifyRun(input({ metaText: undefined }))).toMatchObject({ reason: 'metaSchema' });
  });

  it('metadataMismatch on repository_id, repository or commit', () => {
    const bad = (o: object) => verifyRun(input({ metaText: JSON.stringify({ ...meta, ...o }) }));
    expect(bad({ repository_id: 100 })).toMatchObject({ reason: 'metadataMismatch' });
    expect(bad({ repository: 'acme/other' })).toMatchObject({ reason: 'metadataMismatch' });
    expect(bad({ commit_sha: 'b'.repeat(40) })).toMatchObject({ reason: 'metadataMismatch' });
  });

  it('secret for a credential-shaped string; no matched text is returned (UT-7)', () => {
    const out = verifyRun(input({ resultText: JSON.stringify({ ...result, agent: fakeKey }) }));
    expect(out).toEqual({ accepted: false, reason: 'secret' });
    expect(JSON.stringify(out)).not.toContain(fakeKey);
  });

  it('secret for a known workspace secret value in the sidecar', () => {
    const known = 'plain-known-value-123';
    const out = verifyRun(
      input({ metaText: JSON.stringify({ ...meta, pr_title: `leak ${known}` }), secretValues: [known] }),
    );
    expect(out).toEqual({ accepted: false, reason: 'secret' });
  });

  it('reports the first failed check in order', () => {
    const out = verifyRun(
      input({ run: { repository_id: 1, path: 'x', head_sha: SHA }, resultText: undefined }),
    );
    expect(out).toMatchObject({ reason: 'repoMismatch' });
  });
});
