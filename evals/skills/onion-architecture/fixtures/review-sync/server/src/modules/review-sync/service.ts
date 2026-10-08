import type { JobRunner } from '../../platform/jobs.js';
import type { TransactionRunner } from '../../platform/transaction.js';
import { NotFoundError } from '../../platform/errors.js';
import { RECHECK_JOB_KIND } from './constants.js';
import { planComments } from './domain/plan-comments.js';
import type { FindingsSourcePort, PullRefSourcePort, ReviewSyncRepositoryPort } from './ports.js';
import type { CommentPublisher } from './publisher.js';
import type { PlannedComment, PostedComment, PullRef, RecheckJobPayload, SyncRun } from './types.js';

export interface ReviewSyncDeps {
  repo: ReviewSyncRepositoryPort;
  findings: FindingsSourcePort;
  pulls: PullRefSourcePort;
  publisher: CommentPublisher;
  tx: TransactionRunner;
  jobs: Pick<JobRunner, 'enqueue' | 'register'>;
  now?: () => Date;
}

export class ReviewSyncService {
  constructor(private readonly deps: ReviewSyncDeps) {}

  registerJobs(): void {
    this.deps.jobs.register(RECHECK_JOB_KIND, async (payload) => {
      const { workspaceId, runId } = payload as RecheckJobPayload;
      await this.resync(workspaceId, runId);
    });
  }

  async getRun(workspaceId: string, runId: string): Promise<SyncRun> {
    const run = await this.deps.repo.getRun(workspaceId, runId);
    if (!run) throw new NotFoundError('sync run not found', { runId });
    return run;
  }

  async sync(workspaceId: string, reviewId: string, prId: string): Promise<SyncRun> {
    const pull = await this.requirePull(workspaceId, prId);
    const findings = await this.deps.findings.listFindings(workspaceId, reviewId);
    const alreadyPosted = await this.deps.repo.listPostedFingerprints(workspaceId, prId);
    const { planned, skipped } = planComments(findings, alreadyPosted);

    return this.deps.tx.run(async (tx) => {
      const run = await this.deps.repo.createRun(workspaceId, { reviewId, prId }, tx);
      const posted = await this.postPlanned(pull, planned);
      await this.deps.repo.insertComments(workspaceId, run.id, prId, posted, tx);
      const finished = await this.deps.repo.finishRun(
        workspaceId,
        run.id,
        { postedCount: posted.length, skippedCount: skipped },
        tx,
      );
      if (skipped > 0) await this.scheduleRecheck(workspaceId, run.id);
      return finished;
    });
  }

  async resync(workspaceId: string, runId: string): Promise<{ missing: number }> {
    const run = await this.getRun(workspaceId, runId);
    const pull = await this.requirePull(workspaceId, run.prId);
    const existing = await this.deps.publisher.listExistingIds(pull);
    const ours = await this.deps.repo.listPostedCommentIds(workspaceId, run.prId);
    const gone = ours.filter((id) => !existing.has(id));
    const at = this.deps.now?.() ?? new Date();

    const missing = await this.deps.tx.run((tx) =>
      this.deps.repo.markMissing(workspaceId, run.prId, gone, at, tx),
    );
    if (missing > 0) {
      await this.deps.jobs.enqueue(workspaceId, RECHECK_JOB_KIND, { workspaceId, runId } satisfies RecheckJobPayload);
    }
    return { missing };
  }

  private async requirePull(workspaceId: string, prId: string): Promise<PullRef> {
    const pull = await this.deps.pulls.getPullRef(workspaceId, prId);
    if (!pull) throw new NotFoundError('pull not found', { prId });
    return pull;
  }

  private async postPlanned(pull: PullRef, planned: PlannedComment[]): Promise<PostedComment[]> {
    if (planned.length === 0) return [];
    return this.deps.publisher.publishAll(pull, planned);
  }

  private async scheduleRecheck(workspaceId: string, runId: string): Promise<void> {
    const payload: RecheckJobPayload = { workspaceId, runId };
    await this.deps.jobs.enqueue(workspaceId, RECHECK_JOB_KIND, payload);
  }
}
