import type { ReleaseNote } from './types.js';

export interface InsertReleaseNote {
  workspaceId: string;
  repoId: string;
  fromRef: string;
  toRef: string;
  markdown: string;
  createdBy: string;
}

export interface ReleaseNotesRepositoryPort {
  get(workspaceId: string, id: string): Promise<ReleaseNote | null>;
  listByRepo(workspaceId: string, repoId: string): Promise<ReleaseNote[]>;
  insert(note: InsertReleaseNote): Promise<ReleaseNote>;
}
