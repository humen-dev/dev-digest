import type { FeatureModelChoice, LLMProvider, Provider, RepoRef } from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/types.js';

/**
 * Ports the onboarding-tour service depends on — NOT the `Container`. Row
 * shapes are plain hand-written interfaces (no ORM import); `repository.ts`
 * returns values structurally assignable to them (onion-architecture rule 2).
 */

/** Plain row shape for the `onboarding` table (db/schema/context.ts). */
export interface TourRow {
  repoId: string;
  /** `TourDocument` (types.ts) — validated at the mapper boundary (EC-19), never trusted raw. */
  json: unknown;
  generatedAt: Date;
  /** `null` = legacy row ("no tour", EC-19). */
  tourCommit: string | null;
  model: string | null;
  apiCostUsd: number | null;
  durationMs: number | null;
}

export interface OnboardingTourRepositoryPort {
  get(repoId: string): Promise<TourRow | null>;
  /** Upsert on `repo_id`. `false` on a foreign-key violation — the repo was deleted mid-generation (EC-17). */
  replace(row: TourRow): Promise<boolean>;
}

/** The slice of a repo the tour service needs. `repos` owns the table. */
export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
}

export interface RepoLookupPort {
  getById(workspaceId: string, id: string): Promise<RepoBasics | undefined>;
}

/**
 * Structural union of `GitTreeReader.listTrackedFiles` (adapters/git/tree.ts,
 * U3) and `GitClient.readFileAt` (@devdigest/shared) — declared locally so
 * this `ports.ts` stays adapter-free (`domain-no-outer-layers` bans importing
 * `src/adapters/**` from a port). `container.ts`'s `gitTree` getter wires the
 * two real implementations together.
 */
export interface TourGitPort {
  listTrackedFiles(repo: RepoRef, ref: string): Promise<{ path: string; size: number }[]>;
  readFileAt(repo: RepoRef, ref: string, path: string): Promise<string>;
}

export interface TokenCounter {
  count(text: string): number;
}

export interface OpsLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}

export interface OnboardingDeps {
  onboarding: OnboardingTourRepositoryPort;
  repos: RepoLookupPort;
  git: TourGitPort;
  repoIntel: Pick<
    RepoIntel,
    'getIndexState' | 'getTopFilesByRank' | 'getCriticalPaths' | 'getRankedPaths' | 'getImporterCounts'
  >;
  /** Resolved lazily: a key may be missing or rotated (see composition root). */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** Settings → Models → Onboarding (workspace override, else registry default). */
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  tokenizer: TokenCounter;
  /** Loads `src/prompts/onboarding.system.md` (platform/prompts.ts). */
  loadSystemPrompt: () => Promise<string>;
  /** Extra excluded directory names from config, on top of `repo-intel`'s own defaults. */
  excludedDirs: string[];
  maxFileBytes: number;
  /** Generation wall-clock budget (ms) — also the `completeStructured` per-call timeout. */
  timeoutMs: number;
  now?: () => number;
}
