/**
 * Git tree reader — lists tracked blobs at an arbitrary ref via
 * `git ls-tree`, WITHOUT touching the working tree. Unlike `walkClone`
 * (repo-intel/pipeline/walk.ts), which reads the filesystem and therefore
 * only ever sees whatever is currently checked out, this reflects `ref`
 * exactly even after the clone has since moved on (resync/refresh) — the
 * onboarding tour grounds against the commit it was generated from, not
 * whatever HEAD happens to be when it's read back.
 *
 * Deliberately separate from `SimpleGitClient` (adapters/git/simple-git.ts):
 * same clone-path convention, but a distinct, narrow read, so it doesn't grow
 * the surface of the existing `GitClient` port.
 */
import { simpleGit } from 'simple-git';
import { join } from 'node:path';
import type { RepoRef } from '@devdigest/shared';

/** Git object modes `ls-tree` reports for a plain file (not a symlink or a submodule gitlink). */
const BLOB_FILE_MODES: ReadonlySet<string> = new Set(['100644', '100755']);

export class GitTreeReader {
  constructor(private cloneDir: string) {}

  private clonePathFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  /**
   * Tracked files at `ref` — repo-relative POSIX paths (git always reports
   * forward slashes, on every OS) with their blob size in bytes. Symlinks
   * (mode `120000`) and submodule gitlinks (`160000`) are skipped; only
   * regular/executable blobs (`100644`/`100755`) count as files. Throws if
   * `ref` cannot be resolved in this clone.
   */
  async listTrackedFiles(repo: RepoRef, ref: string): Promise<{ path: string; size: number }[]> {
    const raw = await simpleGit(this.clonePathFor(repo)).raw(['ls-tree', '-r', '-l', '-z', ref]);
    const out: { path: string; size: number }[] = [];
    for (const entry of raw.split('\0')) {
      if (!entry) continue;
      const parsed = parseLsTreeEntry(entry);
      if (!parsed || !BLOB_FILE_MODES.has(parsed.mode)) continue;
      out.push({ path: parsed.path, size: parsed.size });
    }
    return out;
  }
}

/**
 * One `-l -z` record: "<mode> <type> <sha>   <size>\t<path>" — the size is
 * right-padded with spaces by git, so split the head on whitespace rather
 * than assuming fixed-width columns.
 */
function parseLsTreeEntry(entry: string): { mode: string; size: number; path: string } | null {
  const tab = entry.indexOf('\t');
  if (tab === -1) return null;
  const path = entry.slice(tab + 1);
  const [mode, type, , sizeStr] = entry.slice(0, tab).trim().split(/\s+/);
  if (!mode || !type || !sizeStr) return null;
  const size = Number(sizeStr);
  if (!Number.isFinite(size)) return null;
  return { mode, size, path };
}
