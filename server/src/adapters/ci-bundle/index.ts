import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * SPEC-07 — reads the committed CI runner bundle (`agent-runner/dist`) from disk.
 * The result is structurally a `RunnerBundleSource` (declared in
 * `modules/ci/ports.ts`; adapters never import module ports). Every file in the
 * directory ships, whatever the build named its chunks.
 */

export interface RunnerBundleFileData {
  relPath: string;
  contents: string;
}

export class FsRunnerBundle {
  constructor(private readonly dir: string) {}

  /** Files sorted by posix relative path; `null` when the directory is absent. */
  async load(): Promise<RunnerBundleFileData[] | null> {
    let paths: string[];
    try {
      paths = await this.walk('');
    } catch {
      return null;
    }
    paths.sort();
    return Promise.all(
      paths.map(async (relPath) => ({ relPath, contents: await readFile(join(this.dir, relPath), 'utf8') })),
    );
  }

  private async walk(rel: string): Promise<string[]> {
    const entries = await readdir(join(this.dir, rel), { withFileTypes: true });
    const out: string[] = [];
    for (const e of entries) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) out.push(...(await this.walk(child)));
      else if (e.isFile()) out.push(child);
    }
    return out;
  }
}
