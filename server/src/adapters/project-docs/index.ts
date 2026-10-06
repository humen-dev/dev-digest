/**
 * project-docs adapter (SPEC-01) — walks, reads and writes repository
 * Markdown docs on disk, for the `project-context` module's `ProjectDocsFs`
 * port (`server/src/modules/project-context/ports.ts`).
 *
 * `FsProjectDocs` implements that port STRUCTURALLY: it does not import it.
 * `adapters-not-into-modules` (`.dependency-cruiser.cjs`) forbids any import
 * from `src/adapters/**` into `src/modules/**`, including a type-only import
 * of a module's `ports.ts` (`tsPreCompilationDeps: true` tracks those too).
 * The composition root (`platform/container.ts`) imports both this class and
 * the port type and assigns one to the other — TypeScript checks the shapes
 * match there. See `adapters/tokenizer/index.ts`'s `Tokenizer` for the same
 * pattern already in this codebase.
 *
 * Containment: every path this adapter touches is resolved with `realpath`
 * and compared against the clone root's own `realpath` — a symlink (or a
 * `..`-free but still escaping path) that resolves outside the root is
 * rejected, never followed. `walk()` only ever calls `opendir`/`lstat`/
 * `realpath` — it never reads a file's body (NFR-11). `write()` opens with
 * `'r+'`, which fails on a path that does not already exist, so it can only
 * overwrite — never create — a file.
 */
import { opendir, lstat, realpath, readFile, open } from 'node:fs/promises';
import { join, sep } from 'node:path';

/** Local mirror of the port's `WalkedDoc` — see the file header for why this isn't imported. */
interface WalkedDoc {
  path: string;
  sizeBytes: number;
}
type DocReadResult = { status: 'ok'; text: string } | { status: 'missing' | 'unreadable' | 'unsafe_path' };
type DocWriteResult = { status: 'ok' } | { status: 'missing' | 'unsafe_path' };

/** Directory names excluded unconditionally, in addition to the caller-supplied extra list. */
const DEFAULT_EXCLUDED_DIR_NAMES: ReadonlySet<string> = new Set(['node_modules']);

/**
 * Duplicated from `modules/project-context/domain/paths.ts`'s `isExcludedPath`
 * on purpose (`adapters-not-into-modules` forbids importing it here) — keep
 * both in sync if the exclusion rule ever changes.
 */
function isExcludedDirName(name: string, extraExcludedDirNames: readonly string[]): boolean {
  return name.startsWith('.') || DEFAULT_EXCLUDED_DIR_NAMES.has(name) || extraExcludedDirNames.includes(name);
}

function isWithinRoot(real: string, realRoot: string): boolean {
  return real === realRoot || real.startsWith(realRoot + sep);
}

export class FsProjectDocs {
  async walk(cloneRoot: string, excludedDirNames: readonly string[]): Promise<WalkedDoc[]> {
    let realRoot: string;
    try {
      realRoot = await realpath(cloneRoot);
    } catch {
      return [];
    }
    const out: WalkedDoc[] = [];
    await this.walkDir(realRoot, realRoot, '', excludedDirNames, out);
    out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return out;
  }

  private async walkDir(
    realRoot: string,
    absDir: string,
    relDir: string,
    excludedDirNames: readonly string[],
    out: WalkedDoc[],
  ): Promise<void> {
    let dir;
    try {
      dir = await opendir(absDir);
    } catch {
      // Unreadable directory (permissions, race with a deletion) — skip cleanly.
      return;
    }
    for await (const entry of dir) {
      const name = entry.name;
      // Manual '/' join (not `path.join` + sep-split): `name` is a single path
      // segment from the directory entry, never containing a separator.
      const relPath = relDir ? `${relDir}/${name}` : name;
      const absPath = join(absDir, name);

      if (entry.isDirectory()) {
        if (isExcludedDirName(name, excludedDirNames)) continue;
        await this.walkDir(realRoot, absPath, relPath, excludedDirNames, out);
        continue;
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue; // skip sockets, devices, etc.
      if (!relPath.endsWith('.md')) continue; // ancestor dirs already filtered above

      let real: string;
      try {
        real = await realpath(absPath);
      } catch {
        continue; // broken symlink
      }
      if (!isWithinRoot(real, realRoot)) continue; // symlink escapes the root (UT-7)

      let st;
      try {
        st = await lstat(real); // `real` is fully resolved — lstat === stat here
      } catch {
        continue;
      }
      if (!st.isFile()) continue; // e.g. a symlink that resolves to a directory

      out.push({ path: relPath, sizeBytes: st.size });
    }
  }

  async read(cloneRoot: string, relPath: string): Promise<DocReadResult> {
    let realRoot: string;
    try {
      realRoot = await realpath(cloneRoot);
    } catch {
      return { status: 'missing' };
    }
    const absPath = join(cloneRoot, relPath);
    let real: string;
    try {
      real = await realpath(absPath);
    } catch {
      return { status: 'missing' };
    }
    if (!isWithinRoot(real, realRoot)) return { status: 'unsafe_path' };

    let st;
    try {
      st = await lstat(real);
    } catch {
      return { status: 'missing' };
    }
    if (!st.isFile()) return { status: 'missing' };

    let buf: Buffer;
    try {
      buf = await readFile(real);
    } catch {
      return { status: 'unreadable' };
    }
    if (buf.length === 0) return { status: 'unreadable' }; // EC-4

    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf); // EC-4: fatal decode
    } catch {
      return { status: 'unreadable' };
    }
    return { status: 'ok', text };
  }

  async write(cloneRoot: string, relPath: string, text: string): Promise<DocWriteResult> {
    let realRoot: string;
    try {
      realRoot = await realpath(cloneRoot);
    } catch {
      return { status: 'missing' };
    }
    const absPath = join(cloneRoot, relPath);
    let real: string;
    try {
      real = await realpath(absPath);
    } catch {
      return { status: 'missing' }; // AC-69: does not exist → missing, nothing created
    }
    if (!isWithinRoot(real, realRoot)) return { status: 'unsafe_path' };

    let handle;
    try {
      // 'r+': opens an EXISTING regular file for read/write; fails (ENOENT) on
      // a missing path and never creates one.
      handle = await open(real, 'r+');
    } catch {
      return { status: 'missing' };
    }
    try {
      const buf = Buffer.from(text, 'utf8');
      await handle.truncate(buf.length);
      await handle.write(buf, 0, buf.length, 0);
      return { status: 'ok' };
    } catch {
      return { status: 'missing' };
    } finally {
      await handle.close();
    }
  }
}
