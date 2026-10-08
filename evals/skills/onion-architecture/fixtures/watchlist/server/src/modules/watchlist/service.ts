import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { isPullStale } from '../pulls/helpers.js';
import type { AddWatchBody, WatchEntry, WatchStatus } from './types.js';

export class WatchlistService {
  constructor(private readonly container: Container) {}

  list(workspaceId: string): Promise<WatchEntry[]> {
    return this.container.watchlistRepo.listByWorkspace(workspaceId);
  }

  add(workspaceId: string, userId: string, body: AddWatchBody): Promise<WatchEntry> {
    return this.container.watchlistRepo.insert({ ...body, workspaceId, createdBy: userId });
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const ok = await this.container.watchlistRepo.remove(workspaceId, id);
    if (!ok) throw new NotFoundError('watchlist entry', id);
  }

  async status(workspaceId: string, id: string): Promise<WatchStatus> {
    const entry = await this.container.watchlistRepo.get(workspaceId, id);
    if (!entry) throw new NotFoundError('watchlist entry', id);

    const repo = await this.container.reposRepo.get(workspaceId, entry.repoId);
    if (!repo) throw new NotFoundError('repo', entry.repoId);

    const pr = await this.container.github.getPullRequest(
      { owner: repo.owner, name: repo.name },
      entry.prNumber,
    );
    const hasNewCommits = entry.lastSeenSha !== null && entry.lastSeenSha !== pr.headSha;
    await this.container.watchlistRepo.markChecked(workspaceId, id, pr.headSha);

    return {
      ...entry,
      title: pr.title,
      state: pr.merged ? 'merged' : pr.state,
      hasNewCommits,
      stale: isPullStale(pr.updatedAt),
    };
  }
}
