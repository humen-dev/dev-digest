import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CiExportInput, CiResultArtifact, CiRunMeta } from '@devdigest/shared';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (pkg: 'server' | 'client', file: string): string =>
  readFileSync(resolve(root, pkg, 'src/vendor/shared', file), 'utf8').replace(/\r\n/g, '\n');

/** Text between two markers: from the start of `from` up to the start of `to`. */
function region(text: string, from: string, to: string): string {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`markers not found: ${from} .. ${to}`);
  return text.slice(a, b);
}

const ciSection = (pkg: 'server' | 'client') =>
  region(read(pkg, 'contracts/eval-ci.ts'), '// Export-to-CI + CI Runs', '// Conformance (PRD');

describe('vendored CI contracts: server and client copies are identical (SPEC-08)', () => {
  it('eval-ci.ts Export-to-CI section', () => {
    const s = ciSection('server');
    for (const n of ['AgentManifest', 'CiExportInput', 'CiPreview', 'CiInstallation', 'CiRun', 'CiRunMeta']) {
      expect(s).toContain(`export const ${n} =`);
    }
    expect(ciSection('client')).toBe(s);
  });

  it('adapters.ts carries the SPEC-08 GitHub additions in both copies', () => {
    for (const pkg of ['server', 'client'] as const) {
      const a = read(pkg, 'adapters.ts');
      for (const n of [
        'interface RepoInfo',
        'interface WorkflowRun',
        'interface RunArtifact',
        'getRepository(repo: RepoRef)',
        'listWorkflowRuns(',
        'downloadArtifact(',
        'listRepoSecretNames(',
      ]) {
        expect(a).toContain(n);
      }
    }
  });

  it('detects a changed copy', () => {
    expect(ciSection('client').replace('manifest_slug', 'manifest_path')).not.toBe(ciSection('server'));
  });
});

describe('CI contract shapes', () => {
  it('CiExportInput defaults and repo validation (UT-12)', () => {
    const parsed = CiExportInput.parse({ repo: 'acme/payments-api' });
    expect(parsed).toMatchObject({ target: 'gha', post_as: 'github_review', triggers: ['opened', 'synchronize'] });
    expect(CiExportInput.safeParse({ repo: 'acme/../x y' }).success).toBe(false);
    expect(CiExportInput.safeParse({ repo: 'acme/p', triggers: [] }).success).toBe(false);
  });

  it('CiResultArtifact still parses an old artifact without the new fields', () => {
    expect(CiResultArtifact.safeParse({ findings_count: 1, cost_usd: null, agent: 'a' }).success).toBe(true);
  });

  it('CiRunMeta requires a 40-hex SHA and a positive repository id', () => {
    const ok = { commit_sha: 'a'.repeat(40), repository: 'o/r', repository_id: 1, pr_number: 2, pr_title: 't' };
    expect(CiRunMeta.safeParse(ok).success).toBe(true);
    expect(CiRunMeta.safeParse({ ...ok, commit_sha: 'abc' }).success).toBe(false);
    expect(CiRunMeta.safeParse({ ...ok, repository_id: 0 }).success).toBe(false);
  });
});
