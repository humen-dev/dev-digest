/**
 * SPEC-08 NFR-15 — the committed runner bundle ships into customer repositories,
 * so no file of it may match the credential-shaped patterns of the spec Term.
 */
import { describe, expect, it } from 'vitest';
import { FsRunnerBundle } from '../src/adapters/ci-bundle/index.js';
import { loadConfig } from '../src/platform/config.js';
import { containsSecretShapedValue } from '../src/modules/ci/domain/secret-scan.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('committed agent-runner bundle', () => {
  it('loads the whole dist directory', async () => {
    const files = await new FsRunnerBundle(config.ciRunnerBundleDir).load();
    expect(files).not.toBeNull();
    const names = files!.map((f) => f.relPath);
    expect(names).toContain('index.js');
    expect(names).toContain('package.json');
    expect(names).toEqual([...names].sort());
  });

  it('has no file matching a credential-shaped pattern (NFR-15)', async () => {
    const files = (await new FsRunnerBundle(config.ciRunnerBundleDir).load()) ?? [];
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => containsSecretShapedValue(f.contents)).map((f) => f.relPath);
    expect(offenders).toEqual([]);
  });

  it('reports a missing directory as null', async () => {
    expect(await new FsRunnerBundle(`${config.ciRunnerBundleDir}-does-not-exist`).load()).toBeNull();
  });
});
