import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main } from './index.js';
import { redactKey } from './redact.js';

describe('agent-runner CLI main (SPEC-07)', () => {
  let dir: string;
  let errors: string[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-main-'));
    errors = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('EC-24 / AC-51: an empty key exits 1 with "OPENROUTER_API_KEY is not set" before any read or write', async () => {
    const resultPath = path.join(dir, 'devdigest-result.json');
    const code = await main({
      OPENROUTER_API_KEY: '   ',
      DEVDIGEST_DIR: path.join(dir, 'does-not-exist'),
      DEVDIGEST_RESULT_PATH: resultPath,
    });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('OPENROUTER_API_KEY is not set');
    expect(errors.join('\n')).not.toMatch(/manifest/i); // never got as far as reading
    expect(existsSync(resultPath)).toBe(false);
  });

  it('AC-43: DEVDIGEST_DIR (the base checkout) is read, not ./.devdigest', async () => {
    const base = path.join(dir, 'base-devdigest');
    mkdirSync(path.join(base, 'agents'), { recursive: true });
    writeFileSync(
      path.join(base, 'agents', 'a.yaml'),
      'name: "x"\nmodel: "m"\nsystem_prompt: "p"\nci_fail_on: "bogus"\n',
    );
    const code = await main({
      OPENROUTER_API_KEY: 'k-test-value',
      DEVDIGEST_DIR: base,
      DEVDIGEST_RESULT_PATH: path.join(dir, 'r.json'),
    });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain(path.join(base, 'agents'));
  });

  it('UT-10: an error message containing the key value is logged with ***', async () => {
    const key = 'secret-key-value-1234567890';
    // "No agent manifest found in <dir>" echoes the path, which here contains the key.
    const leakyDir = path.join(dir, key);
    const code = await main({
      OPENROUTER_API_KEY: key,
      DEVDIGEST_DIR: leakyDir,
      DEVDIGEST_RESULT_PATH: path.join(dir, 'r.json'),
    });
    expect(code).toBe(1);
    const logged = errors.join('\n');
    expect(logged).toContain('***');
    expect(logged).not.toContain(key);
  });
});

describe('redactKey', () => {
  it('replaces every occurrence and leaves text alone for a blank key', () => {
    expect(redactKey('a KEY b KEY', 'KEY')).toBe('a *** b ***');
    expect(redactKey('unchanged', '')).toBe('unchanged');
    expect(redactKey('unchanged', undefined)).toBe('unchanged');
  });
});
