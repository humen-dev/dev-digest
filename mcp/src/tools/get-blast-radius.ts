// src/tools/get-blast-radius.ts — ring 2: the "what else can this PR affect" use case.
import { ApiError, ToolError } from '../errors.js';
import { formatBlastRadius } from '../format/blast.js';
import { resolvePull, resolveRepo } from '../resolve.js';
import type { ToolHandler } from './types.js';

/**
 * Resolves repo/PR, warms the PR (best effort: `pr_files` is filled by
 * GET /pulls/:id), then reads the precomputed map from GET /pulls/:id/blast.
 * Read-only; never calls a model.
 */
export const getBlastRadius: ToolHandler<'get_blast_radius'> = async (args, ctx) => {
  const repo = await resolveRepo(ctx.api, args.repo);
  const pull = await resolvePull(ctx.api, repo, args.pr);
  try {
    await ctx.api.warmPull(pull.id);
  } catch (err) {
    ctx.log('warmPull failed, continuing', { error: String(err) });
  }
  try {
    const blast = await ctx.api.getBlastRadius(pull.id);
    return formatBlastRadius(blast, { repo: repo.full_name, pr: args.pr });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new ToolError(
        'pr_not_found',
        `PR #${args.pr} of ${repo.full_name} is not known to the DevDigest API.`,
        'Open the PR in the DevDigest web UI once so it is synced, then call again.',
      );
    }
    throw err;
  }
};
