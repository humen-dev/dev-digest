import type {
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  RepoRef,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import type { IndexState, RankedPath, RepoIntel } from '../../src/modules/repo-intel/types.js';
import type { OnboardingTourRepositoryPort, TourGitPort, TourRow } from '../../src/modules/onboarding/ports.js';

/** In-memory onboarding-tour port — same semantics as the Drizzle repository, no Postgres. */
export class InMemoryOnboardingRepo implements OnboardingTourRepositoryPort {
  rows = new Map<string, TourRow>();
  /** When set, `replace` returns `false` for any repo id NOT in this set (EC-17: FK violation). */
  existingRepoIds: Set<string> | null = null;

  async get(repoId: string): Promise<TourRow | null> {
    return this.rows.get(repoId) ?? null;
  }

  async replace(row: TourRow): Promise<boolean> {
    if (this.existingRepoIds && !this.existingRepoIds.has(row.repoId)) return false;
    this.rows.set(row.repoId, row);
    return true;
  }

  /** A pre-SPEC-03 row — `tour_commit`/`model`/`duration_ms` never set (EC-19). */
  seedLegacy(repoId: string, json: unknown = { sections: [] }): void {
    this.rows.set(repoId, {
      repoId,
      json,
      generatedAt: new Date('2026-01-01T00:00:00Z'),
      tourCommit: null,
      model: null,
      apiCostUsd: null,
      durationMs: null,
    });
  }
}

/** In-memory tracked-tree + blob reader — fixture-backed, no real clone or ref semantics. */
export class FakeTourGit implements TourGitPort {
  public readFileAtCalls: string[] = [];

  constructor(
    private files: Record<string, string>,
    private sizes: Record<string, number> = {},
  ) {}

  async listTrackedFiles(_repo: RepoRef, _ref: string): Promise<{ path: string; size: number }[]> {
    return Object.keys(this.files).map((path) => ({
      path,
      size: this.sizes[path] ?? Buffer.byteLength(this.files[path]!, 'utf8'),
    }));
  }

  async readFileAt(_repo: RepoRef, _ref: string, path: string): Promise<string> {
    this.readFileAtCalls.push(path);
    const text = this.files[path];
    if (text === undefined) throw new Error(`fatal: path '${path}' does not exist`);
    return text;
  }
}

export function fakeIndexState(overrides: Partial<IndexState> = {}): IndexState {
  return {
    repoId: 'repo',
    status: 'full',
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 0,
    lastIndexedSha: 'sha-a',
    indexerVersion: 1,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export interface FakeRepoIntelOpts {
  /** `null` simulates "no repo_index_state row" (EC-34, EC-36) — the facade's own synthesized default. */
  indexState?: Partial<IndexState> | null;
  topFiles?: string[];
  criticalPaths?: string[][];
  rankedPaths?: RankedPath[];
  importerCounts?: Record<string, number>;
}

/** The narrowed `Pick<RepoIntel, ...>` slice `OnboardingDeps.repoIntel` needs — plain fakes, no DB. */
export function fakeRepoIntel(
  opts: FakeRepoIntelOpts = {},
): Pick<
  RepoIntel,
  'getIndexState' | 'getTopFilesByRank' | 'getCriticalPaths' | 'getRankedPaths' | 'getImporterCounts'
> {
  const state =
    opts.indexState === null
      ? fakeIndexState({ lastIndexedSha: '', status: 'degraded', degraded: true, degradedReason: 'no_data' })
      : fakeIndexState(opts.indexState);
  return {
    getIndexState: async () => state,
    getTopFilesByRank: async () => opts.topFiles ?? [],
    getCriticalPaths: async () => opts.criticalPaths ?? [],
    getRankedPaths: async () => opts.rankedPaths ?? [],
    getImporterCounts: async () => opts.importerCounts ?? {},
  };
}

/**
 * A `completeStructured` stub whose resolution the test controls — for the
 * blocking/timeout scenarios (EC-7, EC-12, EC-17) a `MockLLMProvider`
 * (resolves immediately) can't exercise.
 */
export class DeferredLLMProvider implements LLMProvider {
  readonly id = 'openai' as const;
  calls = 0;
  lastRequest: StructuredRequest<unknown> | undefined;
  private pending: { resolve: (r: StructuredResult<unknown>) => void; reject: (e: unknown) => void } | undefined;

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    throw new Error('DeferredLLMProvider.complete is not used by the onboarding tour');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls += 1;
    this.lastRequest = req as StructuredRequest<unknown>;
    return new Promise<StructuredResult<T>>((resolve, reject) => {
      this.pending = { resolve: resolve as (r: StructuredResult<unknown>) => void, reject };
    });
  }
  async embed(): Promise<number[][]> {
    return [];
  }

  resolveWith(data: unknown, extra: Partial<StructuredResult<unknown>> = {}): void {
    this.pending?.resolve({
      data,
      model: 'deepseek/deepseek-v4-flash',
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      apiCostUsd: 0.001,
      raw: JSON.stringify(data),
      attempts: 1,
      ...extra,
    });
  }
  rejectWith(err: unknown): void {
    this.pending?.reject(err);
  }

  /** The joined text content of the last captured request's messages (never trust file text leaks past this). */
  lastPromptText(): string {
    return (this.lastRequest?.messages as ChatMessage[] | undefined)?.map((m) => m.content).join('\n') ?? '';
  }
}
