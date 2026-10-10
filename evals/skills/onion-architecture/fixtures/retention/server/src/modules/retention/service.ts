import type { RetentionRepositoryPort } from './ports.js';
import type { PutRetentionPolicyBody, RetentionPolicy, SweepResult } from './types.js';

export interface RetentionDeps {
  repo: RetentionRepositoryPort;
  now?: () => Date;
}

export class RetentionService {
  constructor(private readonly deps: RetentionDeps) {}

  getPolicy(workspaceId: string, repoId: string): Promise<RetentionPolicy> {
    return this.deps.repo.getPolicy(workspaceId, repoId);
  }

  putPolicy(workspaceId: string, repoId: string, body: PutRetentionPolicyBody): Promise<RetentionPolicy> {
    return this.deps.repo.putPolicy(workspaceId, repoId, body);
  }

  async sweep(workspaceId: string, repoId: string): Promise<SweepResult> {
    const policy = await this.deps.repo.getPolicy(workspaceId, repoId);
    const now = this.deps.now?.() ?? new Date();
    return this.deps.repo.purge(workspaceId, repoId, policy, now);
  }
}
