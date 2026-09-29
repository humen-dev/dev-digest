/**
 * Ports the pr-history service depends on — NOT the `Container`. Plain shapes
 * only: no ORM, row or adapter types (server INSIGHTS 2026-09-22).
 */
export interface PrHistoryPull {
  id: string;
  number: number;
  base: string;
  headSha: string;
  owner: string;
  name: string;
}

export interface PrHistoryChangedFile {
  path: string;
  /** additions + deletions */
  churn: number;
}

export interface PrHistoryRepositoryPort {
  /** pull_requests ⋈ repos, workspace-scoped; null when not in the workspace. */
  getPull(workspaceId: string, prId: string): Promise<PrHistoryPull | null>;
  listChangedFiles(prId: string): Promise<PrHistoryChangedFile[]>;
}

export interface MergedPrRef {
  number: number;
  title: string;
  mergedAt: string | null;
  author: string;
}

export interface PathPrHits {
  path: string;
  prs: MergedPrRef[];
}

export interface PrHistoryQuery {
  owner: string;
  name: string;
  ref: string;
  paths: string[];
  commitsPerPath: number;
}

export interface PrHistorySourcePort {
  mergedPrsTouchingPaths(q: PrHistoryQuery): Promise<PathPrHits[]>;
}

/** Structural subset of the request logger (pino) — kept local, no framework types. */
export interface PrHistoryLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}

export interface PrHistoryDeps {
  pulls: PrHistoryRepositoryPort;
  /** Throws ConfigError when no GitHub token is configured. */
  github: () => Promise<PrHistorySourcePort>;
  now?: () => number;
}
