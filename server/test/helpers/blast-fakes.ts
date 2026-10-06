import { randomUUID } from 'node:crypto';
import type {
  BlastFileFactsRow,
  BlastImportEdge,
  BlastPull,
  BlastRepositoryPort,
} from '../../src/modules/blast/ports.js';
import type { BlastResult, IndexState, IndexStatus, RepoIntel } from '../../src/modules/repo-intel/types.js';

/** In-memory blast port — same semantics as the Drizzle repository, no Postgres. */
export class InMemoryBlastRepo implements BlastRepositoryPort {
  private pulls = new Map<string, BlastPull & { workspaceId: string }>(); // prId -> pull
  private files = new Map<string, string[]>(); // prId -> paths
  private edges: BlastImportEdge[] = [];
  private facts: BlastFileFactsRow[] = [];
  importerCalls: string[][] = [];

  seedPull(workspaceId: string, prId: string, repoId: string, files: string[] = []): void {
    this.pulls.set(prId, { id: prId, repoId, workspaceId });
    this.files.set(prId, files);
  }

  async getPull(workspaceId: string, prId: string): Promise<BlastPull | null> {
    const p = this.pulls.get(prId);
    return p && p.workspaceId === workspaceId ? { id: p.id, repoId: p.repoId } : null;
  }

  async listChangedFiles(prId: string): Promise<string[]> {
    return this.files.get(prId) ?? [];
  }

  seedEdges(edges: BlastImportEdge[]): void {
    this.edges = edges;
  }

  seedFacts(facts: BlastFileFactsRow[]): void {
    this.facts = facts;
  }

  async listImporters(_repoId: string, files: string[]): Promise<BlastImportEdge[]> {
    this.importerCalls.push(files);
    return this.edges.filter((e) => files.includes(e.toFile));
  }

  async getFileFacts(_repoId: string, files: string[]): Promise<BlastFileFactsRow[]> {
    return this.facts.filter((f) => files.includes(f.filePath));
  }
}

export const EMPTY_BLAST: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [] };

/**
 * Full `RepoIntel` fake: only the blast-relevant methods are configurable, the
 * rest return `[]` / degraded literals. Records `getBlastRadius` calls.
 */
export class FakeRepoIntel implements RepoIntel {
  blastCalls: { repoId: string; files: string[] }[] = [];
  indexCalls = 0;
  indexRepoCalls = 0;
  refreshCalls = 0;

  constructor(
    private blast: BlastResult = EMPTY_BLAST,
    private status: IndexStatus = 'full',
    private degradedReason?: IndexState['degradedReason'],
  ) {}

  async getBlastRadius(repoId: string, files: string[]): Promise<BlastResult> {
    this.blastCalls.push({ repoId, files });
    return this.blast;
  }
  async getIndexState(repoId: string): Promise<IndexState> {
    this.indexCalls++;
    return {
      repoId,
      status: this.status,
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: 0,
      lastIndexedSha: 'abc',
      indexerVersion: 1,
      updatedAt: new Date(0),
      ...(this.degradedReason ? { degradedReason: this.degradedReason } : {}),
    };
  }
  async indexRepo() {
    this.indexRepoCalls++;
    return { status: 'full' as const, filesIndexed: 0, filesSkipped: 0, durationMs: 0 };
  }
  async refreshIndex() {
    this.refreshCalls++;
    return { status: 'full' as const, filesIndexed: 0, filesSkipped: 0, durationMs: 0 };
  }
  async getRepoMap() {
    return { text: '', tokens: 0, cached: false, degraded: true, reason: 'no_data' as const };
  }
  async getFileRank() {
    return [];
  }
  async getSymbolsInFiles() {
    return [];
  }
  async getCallerSignatures() {
    return [];
  }
  async getUnresolvedReferences() {
    return [];
  }
  async getConventionSamples() {
    return [];
  }
  async getRankedPaths() {
    return [];
  }
  async getTopFilesByRank() {
    return [];
  }
  async getCriticalPaths() {
    return [];
  }
  async getImporterCounts() {
    return {};
  }
}

export function newId(): string {
  return randomUUID();
}
