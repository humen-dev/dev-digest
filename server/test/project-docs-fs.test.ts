/**
 * FsProjectDocs adapter (SPEC-01 U2) — walk/read/write against a real tmp
 * clone directory on disk. Pure domain rules (path syntax, exclusion,
 * secrets, effective list) are covered in `project-context-domain.test.ts`;
 * this file exercises only filesystem behavior: containment, size-only
 * stats, and the `DocReadResult` / `DocWriteResult` status contracts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FsProjectDocs } from '../src/adapters/project-docs/index.js';

// `vi.spyOn`/`Object.defineProperty` can't redefine `node:fs/promises`'s
// exports (frozen by Node's ESM interop), so NFR-11 and EC-20 instead mock
// the whole module at resolution time and spy on the mock's `readFile`,
// keeping every other export (including the ones this file calls directly:
// mkdtemp/mkdir/writeFile/rm/symlink) delegating to the real implementation.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
const mockedReadFile = vi.mocked(readFile);

async function writeFileAt(root: string, rel: string, contents: string | Buffer): Promise<void> {
  const full = join(root, rel);
  const dir = dirname(full);
  if (dir && dir !== root) await mkdir(dir, { recursive: true });
  await writeFile(full, contents);
}

/** Creates `root/linkName` -> `target`; returns false (and skips) on Windows without Developer Mode (EPERM). */
async function trySymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    await symlink(target, linkPath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EPERM') return false;
    throw err;
  }
}

describe('FsProjectDocs', () => {
  let root: string;
  let fs: FsProjectDocs;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'project-docs-'));
    fs = new FsProjectDocs();
    mockedReadFile.mockClear();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('walk', () => {
    it('finds .md files anywhere under root, rejects non-.md — AC-3', async () => {
      await writeFileAt(root, 'README.md', '# a');
      await writeFileAt(root, 'docs/a.md', '# b');
      await writeFileAt(root, 'server/x/README.md', '# c');
      await writeFileAt(root, 'a.txt', 'not markdown');

      const result = await fs.walk(root, []);
      expect(result.map((d) => d.path).sort()).toEqual(['README.md', 'docs/a.md', 'server/x/README.md'].sort());
      expect(result.every((d) => typeof d.sizeBytes === 'number' && d.sizeBytes >= 0)).toBe(true);
    });

    it('excludes dot-dirs and node_modules unconditionally — AC-4', async () => {
      await writeFileAt(root, '.github/x.md', '# x');
      await writeFileAt(root, '.devdigest/specs/y.md', '# y');
      await writeFileAt(root, 'a/node_modules/z.md', '# z');
      await writeFileAt(root, 'keep.md', '# keep');

      const result = await fs.walk(root, []);
      expect(result.map((d) => d.path)).toEqual(['keep.md']);
    });

    it('excludes extra configured dir names; empty list includes them — AC-5', async () => {
      await writeFileAt(root, 'dist/a.md', '# a');
      await writeFileAt(root, 'vendor/b.md', '# b');
      await writeFileAt(root, 'kept.md', '# kept');

      const excluded = await fs.walk(root, ['dist', 'vendor']);
      expect(excluded.map((d) => d.path)).toEqual(['kept.md']);

      const included = await fs.walk(root, []);
      expect(included.map((d) => d.path).sort()).toEqual(['dist/a.md', 'kept.md', 'vendor/b.md'].sort());
    });

    it('never reads file bodies — NFR-11', async () => {
      await writeFileAt(root, 'a.md', '# a');
      await writeFileAt(root, 'b.md', '# b');
      await fs.walk(root, []);
      expect(mockedReadFile).not.toHaveBeenCalled();
    });

    it('excludes a symlink pointing outside the root — UT-7', async () => {
      const outside = await mkdtemp(join(tmpdir(), 'project-docs-outside-'));
      try {
        await writeFileAt(outside, 'secret.md', '# secret');
        const linked = await trySymlink(join(outside, 'secret.md'), join(root, 'linked.md'));
        if (!linked) return; // Windows without Developer Mode — skip
        const result = await fs.walk(root, []);
        expect(result.map((d) => d.path)).toEqual([]);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  describe('read', () => {
    it('returns the file text', async () => {
      await writeFileAt(root, 'a.md', '# hello');
      expect(await fs.read(root, 'a.md')).toEqual({ status: 'ok', text: '# hello' });
    });

    it('returns missing for a non-existing path', async () => {
      expect(await fs.read(root, 'nope.md')).toEqual({ status: 'missing' });
    });

    it('returns unreadable for an empty file — EC-4', async () => {
      await writeFileAt(root, 'empty.md', '');
      expect(await fs.read(root, 'empty.md')).toEqual({ status: 'unreadable' });
    });

    it('returns unreadable for invalid UTF-8 — EC-4', async () => {
      await writeFileAt(root, 'bad.md', Buffer.from([0xff, 0xfe, 0x00, 0xff]));
      expect(await fs.read(root, 'bad.md')).toEqual({ status: 'unreadable' });
    });

    it('returns unsafe_path for a symlink escaping the root — UT-7', async () => {
      const outside = await mkdtemp(join(tmpdir(), 'project-docs-outside-'));
      try {
        await writeFileAt(outside, 'secret.md', '# secret');
        const linked = await trySymlink(join(outside, 'secret.md'), join(root, 'linked.md'));
        if (!linked) return; // Windows without Developer Mode — skip
        expect(await fs.read(root, 'linked.md')).toEqual({ status: 'unsafe_path' });
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it('never throws when the underlying read fails, and keeps working for the next doc — EC-20', async () => {
      await writeFileAt(root, 'a.md', '# a');
      await writeFileAt(root, 'b.md', '# b');
      mockedReadFile.mockImplementationOnce(() => {
        throw new Error('EACCES: permission denied');
      });
      const first = await fs.read(root, 'a.md');
      const second = await fs.read(root, 'b.md');
      expect(first).toEqual({ status: 'unreadable' });
      expect(second).toEqual({ status: 'ok', text: '# b' });
    });
  });

  describe('write', () => {
    it('overwrites an existing file', async () => {
      await writeFileAt(root, 'a.md', '# old');
      expect(await fs.write(root, 'a.md', '# new')).toEqual({ status: 'ok' });
      expect(await readFile(join(root, 'a.md'), 'utf8')).toBe('# new');
    });

    it('truncates when the new text is shorter than the old one', async () => {
      await writeFileAt(root, 'a.md', '# a much longer old body');
      expect(await fs.write(root, 'a.md', '# short')).toEqual({ status: 'ok' });
      expect(await readFile(join(root, 'a.md'), 'utf8')).toBe('# short');
    });

    it('returns missing and creates no file for a non-existing path — AC-69', async () => {
      const result = await fs.write(root, 'nope.md', '# new');
      expect(result).toEqual({ status: 'missing' });
      await expect(readFile(join(root, 'nope.md'), 'utf8')).rejects.toThrow();
    });

    it('returns unsafe_path for a symlink escaping the root — UT-7', async () => {
      const outside = await mkdtemp(join(tmpdir(), 'project-docs-outside-'));
      try {
        await writeFileAt(outside, 'secret.md', '# secret');
        const linked = await trySymlink(join(outside, 'secret.md'), join(root, 'linked.md'));
        if (!linked) return; // Windows without Developer Mode — skip
        expect(await fs.write(root, 'linked.md', '# x')).toEqual({ status: 'unsafe_path' });
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });
});
