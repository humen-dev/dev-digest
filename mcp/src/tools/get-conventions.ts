// src/tools/get-conventions.ts — ring 2: use case. Depends on the DevDigestApi port, resolve.ts, format/*.
import { ToolError } from '../errors.js';
import { formatConventions } from '../format/conventions.js';
import { resolveRepo } from '../resolve.js';
import type { ToolHandler } from './types.js';

/** Reads a repo's coding conventions. Read-only, one call to getConventions. */
export const getConventions: ToolHandler<'get_conventions'> = async (args, ctx) => {
  const repo = await resolveRepo(ctx.api, args.repo);
  const board = await ctx.api.getConventions(repo.id);

  if (board.candidates.length === 0 && board.last_scan === null) {
    throw new ToolError(
      'no_conventions',
      `No conventions found for ${repo.full_name}.`,
      'Run the conventions extractor for this repo in the DevDigest web UI (Conventions), then retry.',
    );
  }

  return formatConventions(board, {
    repo: repo.full_name,
    status: args.status,
    category: args.category,
    limit: args.limit,
  });
};
