import type { PutRetentionPolicyBody, RetentionPolicy, SweepResult } from './types.js';

export interface RetentionRepositoryPort {
  getPolicy(workspaceId: string, repoId: string): Promise<RetentionPolicy>;
  putPolicy(workspaceId: string, repoId: string, body: PutRetentionPolicyBody): Promise<RetentionPolicy>;
  purge(workspaceId: string, repoId: string, policy: RetentionPolicy, now: Date): Promise<SweepResult>;
}
