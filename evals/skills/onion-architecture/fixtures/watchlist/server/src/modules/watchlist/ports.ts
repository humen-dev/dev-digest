import type { WatchEntry } from './types.js';

export interface InsertWatchEntry {
  workspaceId: string;
  repoId: string;
  prNumber: number;
  note?: string;
  createdBy: string;
}

export interface WatchlistRepositoryPort {
  listByWorkspace(workspaceId: string): Promise<WatchEntry[]>;
  get(workspaceId: string, id: string): Promise<WatchEntry | null>;
  insert(entry: InsertWatchEntry): Promise<WatchEntry>;
  markChecked(workspaceId: string, id: string, sha: string): Promise<void>;
  remove(workspaceId: string, id: string): Promise<boolean>;
}
