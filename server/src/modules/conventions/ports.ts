import type {
  CodeIndex,
  ConventionCategory,
  ConventionStatus,
  FeatureModelChoice,
  GitClient,
  LLMProvider,
  Provider,
  Skill,
  SkillSource,
  SkillType,
} from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/types.js';

/**
 * Ports the conventions service depends on — NOT the `Container`. Row shapes
 * are plain hand-written interfaces (no ORM import); `ConventionsRepository`
 * returns values structurally assignable to them.
 */

export interface ConventionRow {
  id: string;
  workspaceId: string;
  repoId: string | null;
  rule: string;
  rationale: string | null;
  category: ConventionCategory;
  evidencePath: string | null;
  evidenceLine: number | null;
  evidenceSnippet: string | null;
  occurrences: number | null;
  confidence: number | null;
  status: ConventionStatus;
  createdAt: Date;
}

export interface ConventionScanRow {
  id: string;
  workspaceId: string;
  repoId: string;
  sampledFiles: string[];
  proposed: number;
  droppedUngrounded: number;
  droppedDuplicate: number;
  droppedRare: number;
  kept: number;
  model: string;
  apiCostUsd: number | null;
  headSha: string | null;
  durationMs: number;
  createdAt: Date;
}

export type InsertConvention = Omit<ConventionRow, 'id' | 'createdAt' | 'status'>;
export type InsertConventionScan = Omit<ConventionScanRow, 'id' | 'createdAt'>;

export interface ConventionPatch {
  status?: ConventionStatus;
  rule?: string;
  rationale?: string | null;
  category?: ConventionCategory;
}

export interface ConventionsRepositoryPort {
  listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]>;
  latestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined>;
  getById(workspaceId: string, id: string): Promise<ConventionRow | undefined>;
  update(workspaceId: string, id: string, patch: ConventionPatch): Promise<ConventionRow | undefined>;
  setStatusMany(
    workspaceId: string,
    repoId: string,
    ids: string[],
    status: ConventionStatus,
  ): Promise<void>;
  /**
   * One atomic re-scan: delete this repo's `pending` rows, insert the kept
   * candidates as `pending`, insert the scan row. Decided rows are untouched.
   */
  replacePending(
    workspaceId: string,
    repoId: string,
    rows: InsertConvention[],
    scan: InsertConventionScan,
  ): Promise<void>;
}

/** The slice of a repo the extractor needs. `repos` owns the table. */
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

export interface SkillCreateInput {
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  evidenceFiles: string[];
}

/** Creates a skill through the skills module's own service (versioning, DTO). */
export interface SkillCreatorPort {
  create(workspaceId: string, input: SkillCreateInput): Promise<Skill>;
}

export interface TokenCounter {
  count(text: string): number;
}

export interface ConventionsDeps {
  conventions: ConventionsRepositoryPort;
  repos: RepoLookupPort;
  repoIntel: Pick<RepoIntel, 'getConventionSamples' | 'getRankedPaths'>;
  files: Pick<GitClient, 'readFile' | 'currentHead'>;
  codeIndex: Pick<CodeIndex, 'grep'>;
  /** Resolved lazily: a key may be missing or rotated (see composition root). */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** Settings → Models → Conventions (workspace override, else registry default). */
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  skills: SkillCreatorPort;
  tokenizer: TokenCounter;
  now?: () => number;
}
