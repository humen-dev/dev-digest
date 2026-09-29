import type { BlastResult, IndexState } from '../repo-intel/types.js';

/**
 * Ports the blast service depends on — NOT the `Container`. Cross-module reads
 * go through `repo-intel/types.ts` only (depcruise `no-cross-module-internals`).
 */
export interface BlastPull {
  id: string;
  repoId: string;
}

export interface BlastImportEdge {
  fromFile: string;
  toFile: string;
}

export interface BlastFileFactsRow {
  filePath: string;
  endpoints: string[];
  crons: string[];
}

export interface BlastRepositoryPort {
  /** Workspace-scoped; null when the PR is not in the workspace. */
  getPull(workspaceId: string, prId: string): Promise<BlastPull | null>;
  /** pr_files.path for the PR (unordered). */
  listChangedFiles(prId: string): Promise<string[]>;
  /** file_edges rows with to_file IN files for the repo (reverse import lookup). */
  listImporters(repoId: string, files: string[]): Promise<BlastImportEdge[]>;
  /** file_facts rows for the repo and files. */
  getFileFacts(repoId: string, files: string[]): Promise<BlastFileFactsRow[]>;
}

export interface BlastIntelPort {
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastResult>;
  getIndexState(
    repoId: string,
  ): Promise<Pick<IndexState, 'status' | 'degradedReason' | 'lastIndexedSha' | 'indexerVersion'>>;
}

/** Structural subset of the request logger (pino) — kept local, no framework types. */
export interface BlastLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}

export interface BlastDeps {
  blast: BlastRepositoryPort;
  intel: BlastIntelPort;
  repoIntelEnabled: boolean;
  maxCallersPerSymbol: number;
  bfsDepth: number;
  now?: () => number;
}
