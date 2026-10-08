/**
 * GitTreeReader (adapters/git/tree.ts) — unit tests over a REAL git repo in a
 * throwaway temp dir (no Postgres, no Docker). Mirrors indexer-walk.test.ts's
 * "build a fixture, assert the result" style, but through `git ls-tree`
 * rather than a filesystem walk: the point under test is that
 * `listTrackedFiles` reflects the given `ref`, not whatever is checked out.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { GitTreeReader } from '../src/adapters/git/tree.js';

const REPO = { owner: 'acme', name: 'tree-fixture' };

describe('GitTreeReader', () => {
  let cloneDir: string;
  let repoPath: string;

  beforeEach(async () => {
    cloneDir = await mkdtemp(join(tmpdir(), 'git-tree-'));
    repoPath = join(cloneDir, REPO.owner, REPO.name);
    await mkdir(repoPath, { recursive: true });
    const git = simpleGit(repoPath);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test');
  });

  afterEach(async () => {
    await rm(cloneDir, { recursive: true, force: true });
  });

  it('lists tracked blob files with sizes, skipping a symlink', async () => {
    const git = simpleGit(repoPath);
    await writeFile(join(repoPath, 'a.ts'), 'export const a = 1;');
    await mkdir(join(repoPath, 'src'), { recursive: true });
    await writeFile(join(repoPath, 'src', 'b.ts'), 'export const b = 22;');
    await git.add(['a.ts', 'src/b.ts']);
    await git.commit('add files');

    // Add a symlink via plumbing — avoids real FS symlinks (permission pain
    // on Windows); `git ls-tree` only cares about the object mode, not
    // whether the working tree actually has a symlink.
    const linkTarget = join(cloneDir, 'target.txt');
    await writeFile(linkTarget, '../outside');
    const sha = (await git.raw(['hash-object', '-w', linkTarget])).trim();
    await git.raw(['update-index', '--add', '--cacheinfo', `120000,${sha},link`]);
    await git.commit('add symlink');

    const reader = new GitTreeReader(cloneDir);
    const head = (await git.revparse(['HEAD'])).trim();
    const files = await reader.listTrackedFiles(REPO, head);

    expect(files.map((f) => f.path).sort()).toEqual(['a.ts', 'src/b.ts']);
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.size]));
    expect(byPath['a.ts']).toBe('export const a = 1;'.length);
    expect(byPath['src/b.ts']).toBe('export const b = 22;'.length);
  });

  it('reflects the ref, not HEAD: listing commit A after HEAD moved to B returns A’s files', async () => {
    const git = simpleGit(repoPath);
    await writeFile(join(repoPath, 'a.ts'), 'export const a = 1;');
    await git.add(['a.ts']);
    await git.commit('commit A');
    const commitA = (await git.revparse(['HEAD'])).trim();

    await writeFile(join(repoPath, 'b.ts'), 'export const b = 2;');
    await git.add(['b.ts']);
    await git.commit('commit B');

    const reader = new GitTreeReader(cloneDir);
    const files = await reader.listTrackedFiles(REPO, commitA);
    expect(files.map((f) => f.path)).toEqual(['a.ts']);
  });

  it('throws when the ref cannot be resolved', async () => {
    const git = simpleGit(repoPath);
    await writeFile(join(repoPath, 'a.ts'), 'export const a = 1;');
    await git.add(['a.ts']);
    await git.commit('commit A');

    const reader = new GitTreeReader(cloneDir);
    await expect(reader.listTrackedFiles(REPO, 'does-not-exist')).rejects.toThrow();
  });
});
