// src/tools/get-blast-radius.ts — ring 2: stub use case (§3.6). Makes NO API call.
import { ToolError } from '../errors.js';
import type { ToolHandler } from './types.js';

/**
 * Blast radius is not implemented yet (planned: impact map from repo-intel).
 * Always throws `not_implemented`; never touches ctx.api and never returns a success.
 */
export const getBlastRadius: ToolHandler<'get_blast_radius'> = async () => {
  throw new ToolError(
    'not_implemented',
    'get_blast_radius is not implemented yet in DevDigest (planned: impact map from repo-intel).',
    'Use get_findings(repo, pr) for review results or get_conventions(repo) for repo rules.',
  );
};
