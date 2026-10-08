import type { ConventionStatus, Skill } from '@devdigest/shared';
import type { InsertSkill } from '../skills/types.js';
import type { AuditFinding, NewFinding } from './types.js';

export interface SkillAuditRepositoryPort {
  listByRepo(workspaceId: string, repoId: string): Promise<AuditFinding[]>;
  getMany(workspaceId: string, ids: string[]): Promise<AuditFinding[]>;
  upsertPending(workspaceId: string, repoId: string, findings: NewFinding[]): Promise<void>;
  setStatus(workspaceId: string, ids: string[], status: ConventionStatus): Promise<AuditFinding[]>;
}

export interface SkillCatalogPort {
  listEnabled(workspaceId: string): Promise<Skill[]>;
}

export interface SkillDraftSink {
  create(input: InsertSkill): Promise<Skill>;
}
