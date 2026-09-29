import type { BlastResult, IndexState } from '../repo-intel/types.js';

/**
 * Ports the blast service depends on — NOT the `Container`. Cross-module reads
 * go through `repo-intel/types.ts` only (depcruise `no-cross-module-internals`).
 */
export interface BlastPull {
  id: string;
  repoId: string;
}

export interface BlastRepositoryPort {
  /** Workspace-scoped; null when the PR is not in the workspace. */
  getPull(workspaceId: string, prId: string): Promise<BlastPull | null>;
  /** pr_files.path for the PR (unordered). */
  listChangedFiles(prId: string): Promise<string[]>;
}

export interface BlastIntelPort {
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastResult>;
  getIndexState(repoId: string): Promise<Pick<IndexState, 'status' | 'degradedReason'>>;
}

export interface BlastDeps {
  blast: BlastRepositoryPort;
  intel: BlastIntelPort;
  repoIntelEnabled: boolean;
  maxCallersPerSymbol: number;
}
