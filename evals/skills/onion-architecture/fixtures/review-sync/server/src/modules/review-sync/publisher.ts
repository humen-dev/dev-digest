import type { GitHubClient } from '@devdigest/shared';
import { ExternalServiceError } from '../../platform/errors.js';
import type { PlannedComment, PostedComment, PullRef } from './types.js';

export class CommentPublisher {
  constructor(private readonly github: () => Promise<GitHubClient>) {}

  async publishAll(pull: PullRef, planned: PlannedComment[]): Promise<PostedComment[]> {
    const client = await this.github();
    const posted: PostedComment[] = [];
    for (const c of planned) {
      try {
        const created = await client.createReviewComment(pull.repo, pull.number, {
          commitId: pull.headSha,
          path: c.path,
          line: c.line,
          side: 'RIGHT',
          body: c.body,
        });
        posted.push({ ...c, githubCommentId: Number(created.id) });
      } catch (err) {
        throw new ExternalServiceError(`failed to post comment on ${c.path}:${c.line}`, { cause: String(err) });
      }
    }
    return posted;
  }

  async listExistingIds(pull: PullRef): Promise<Set<number>> {
    const client = await this.github();
    const comments = await client.listReviewComments(pull.repo, pull.number);
    return new Set(comments.map((c) => Number(c.id)));
  }
}
