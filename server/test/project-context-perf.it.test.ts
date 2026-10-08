/**
 * Project Context performance (SPEC-01 NFR-9, NFR-12). Real `FsProjectDocs`
 * against a generated on-disk fixture, with a fake `ProjectContextRepository`
 * (no DB — these two NFRs are about the filesystem walk/read path, not
 * Postgres). Named `.it.test.ts` per the plan to keep it out of the fast unit
 * suite (slow by nature), even though it needs no Docker — run directly if
 * Docker is unavailable.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsProjectDocs } from '../src/adapters/project-docs/index.js';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import type {
  DocOwnerRef,
  LinkedSkillDocs,
  ProjectContextRepository,
  TokenCounter,
} from '../src/modules/project-context/ports.js';

/** Minimal fake — these NFRs don't touch any of the DB-backed methods below except as no-ops. */
class NoopRepo implements ProjectContextRepository {
  constructor(private agentPaths: string[] = []) {}
  async getRepoClone() {
    return { id: 'repo', clonePath: null as string | null };
  }
  async agentExists() {
    return true;
  }
  async skillExists() {
    return true;
  }
  async getAgentDocs() {
    return this.agentPaths;
  }
  async replaceAgentDocs() {}
  async getSkillDocs() {
    return [];
  }
  async replaceSkillDocs() {}
  async linkedSkillDocs(): Promise<LinkedSkillDocs[]> {
    return [];
  }
  async agentCountsByPath() {
    return new Map<string, number>();
  }
  async usageByPath() {
    return { agents: [] as DocOwnerRef[], skills: [] as DocOwnerRef[] };
  }
}

class CheapTokens implements TokenCounter {
  count(text: string) {
    return Math.ceil(text.length / 4);
  }
}

function percentile(samplesMs: number[], p: number): number {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx]!;
}

describe('Project Context performance', () => {
  describe('NFR-9: list over a 5,000-file clone, p95 ≤ 2s', () => {
    let cloneDir: string;

    beforeAll(async () => {
      cloneDir = await mkdtemp(join(tmpdir(), 'project-context-perf-'));
      const DIRS = 25;
      const FILES_PER_DIR = 200; // 25 * 200 = 5,000
      for (let d = 0; d < DIRS; d++) {
        const dirPath = join(cloneDir, `dir${d}`);
        await mkdir(dirPath, { recursive: true });
        await Promise.all(
          Array.from({ length: FILES_PER_DIR }, (_, f) =>
            writeFile(join(dirPath, `f${f}.md`), `# doc ${d}-${f}\nsome content\n`, 'utf8'),
          ),
        );
      }
    }, 60_000);
    afterAll(async () => {
      await rm(cloneDir, { recursive: true, force: true });
    });

    it('p95 of 20 list() calls is at most 2s', async () => {
      const service = new ProjectContextService({
        repo: new (class extends NoopRepo {
          override async getRepoClone() {
            return { id: 'repo', clonePath: cloneDir };
          }
        })(),
        fs: new FsProjectDocs(),
        tokens: new CheapTokens(),
        excludedDirs: [],
      });

      const samples: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        const result = await service.list('ws', 'repo');
        samples.push(performance.now() - start);
        expect(result.total).toBe(5000);
      }

      expect(percentile(samples, 95)).toBeLessThanOrEqual(2000);
    }, 120_000);
  });

  describe('NFR-12: resolveEffective over 20 × 100 KB docs, ≤ 1s', () => {
    let cloneDir: string;
    const paths: string[] = [];

    beforeAll(async () => {
      cloneDir = await mkdtemp(join(tmpdir(), 'project-context-perf-docs-'));
      const HUNDRED_KB = 'x'.repeat(100 * 1024);
      for (let i = 0; i < 20; i++) {
        const rel = `docs/doc${i}.md`;
        paths.push(rel);
        await mkdir(join(cloneDir, 'docs'), { recursive: true });
        await writeFile(join(cloneDir, rel), HUNDRED_KB, 'utf8');
      }
    }, 30_000);
    afterAll(async () => {
      await rm(cloneDir, { recursive: true, force: true });
    });

    it('reads all 20 docs (≈2 MB) in at most 1s', async () => {
      const service = new ProjectContextService({
        repo: new NoopRepo(paths),
        fs: new FsProjectDocs(),
        tokens: new CheapTokens(),
        excludedDirs: [],
      });

      const start = performance.now();
      const result = await service.resolveEffective('ws', 'agent', cloneDir);
      const elapsedMs = performance.now() - start;

      expect(result.docs).toHaveLength(20);
      expect(elapsedMs).toBeLessThanOrEqual(1000);
    }, 15_000);
  });
});
