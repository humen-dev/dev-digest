import type { PrHistoryResponse, PrHistoryUnavailableReason } from '@devdigest/shared';
import { ConfigError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { buildPrHistory } from './domain/build-history.js';
import {
  COMMITS_PER_PATH,
  MAX_HISTORY_FILES,
  MAX_HISTORY_ITEMS,
  PR_HISTORY_CACHE_MAX,
  PR_HISTORY_CACHE_TTL_MS,
} from './constants.js';
import type { PrHistoryDeps, PrHistoryLogger } from './ports.js';

type Source = 'cache' | 'github' | 'skipped_no_files' | 'unavailable';

function failureReason(err: unknown): PrHistoryUnavailableReason {
  if (err instanceof ConfigError) return 'no_token';
  if (err instanceof ExternalServiceError && (err.details as { rateLimited?: boolean } | undefined)?.rateLimited) {
    return 'rate_limited';
  }
  return 'github_error';
}

/**
 * Prior-PR history for a pull request. GitHub failures never throw: they map to
 * `{ history: [], available: false, reason }`. Only a missing PR is a 404.
 * Successful answers are cached in memory per `prId:headSha` (bounded, TTL).
 */
export class PrHistoryService {
  private readonly cache = new Map<string, { at: number; value: PrHistoryResponse }>();

  constructor(private readonly deps: PrHistoryDeps) {}

  async get(workspaceId: string, prId: string, ctx: { logger?: PrHistoryLogger } = {}): Promise<PrHistoryResponse> {
    const now = this.deps.now ?? Date.now;
    const started = now();
    const pull = await this.deps.pulls.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const log = (source: Source, res: PrHistoryResponse) =>
      ctx.logger?.info(
        {
          event: 'pr_history.served',
          prId,
          source,
          items: res.history.length,
          filesConsidered: res.files_considered,
          filesTotal: res.files_total,
          reason: res.reason,
          durationMs: now() - started,
        },
        'pr history served',
      );

    const key = `${pull.id}:${pull.headSha}`;
    const hit = this.cache.get(key);
    if (hit && started - hit.at < PR_HISTORY_CACHE_TTL_MS) {
      log('cache', hit.value);
      return hit.value;
    }

    const all = await this.deps.pulls.listChangedFiles(pull.id);
    const considered = [...all]
      .sort((a, b) => b.churn - a.churn || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .slice(0, MAX_HISTORY_FILES)
      .map((f) => f.path);
    const base = { files_considered: considered.length, files_total: all.length };

    if (considered.length === 0) {
      const res: PrHistoryResponse = { history: [], available: true, reason: null, ...base };
      log('skipped_no_files', res);
      return res;
    }

    try {
      const source = await this.deps.github();
      const hits = await source.mergedPrsTouchingPaths({
        owner: pull.owner,
        name: pull.name,
        ref: pull.base,
        paths: considered,
        commitsPerPath: COMMITS_PER_PATH,
      });
      const res: PrHistoryResponse = {
        history: buildPrHistory(hits, { currentNumber: pull.number, maxItems: MAX_HISTORY_ITEMS }),
        available: true,
        reason: null,
        ...base,
      };
      this.remember(key, res, now());
      log('github', res);
      return res;
    } catch (err) {
      const reason = failureReason(err);
      ctx.logger?.warn({ event: 'pr_history.unavailable', prId, reason }, 'pr history unavailable');
      const res: PrHistoryResponse = { history: [], available: false, reason, ...base };
      log('unavailable', res);
      return res;
    }
  }

  private remember(key: string, value: PrHistoryResponse, at: number): void {
    this.cache.delete(key);
    this.cache.set(key, { at, value });
    while (this.cache.size > PR_HISTORY_CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}
