import type { SmartDiffRole } from '@devdigest/shared';
import { DEFAULT_SMART_DIFF_ROLE, SMART_DIFF_ROLE_GLOBS } from '../constants.js';
import { globToRegExp, normalizePath } from './path-glob.js';

interface CompiledRole {
  role: Exclude<SmartDiffRole, 'core'>;
  regexes: readonly RegExp[];
}

/** Compiled once at module load — see SMART_DIFF_ROLE_GLOBS (smart-diff/constants.ts). */
const COMPILED_ROLES: readonly CompiledRole[] = SMART_DIFF_ROLE_GLOBS.map(({ role, globs }) => ({
  role,
  regexes: globs.map(globToRegExp),
}));

/** First match wins, in SMART_DIFF_ROLE_GLOBS order; DEFAULT_SMART_DIFF_ROLE ('core') otherwise. */
export function classifyFile(path: string): SmartDiffRole {
  const normalized = normalizePath(path);
  for (const { role, regexes } of COMPILED_ROLES) {
    if (regexes.some((re) => re.test(normalized))) return role;
  }
  return DEFAULT_SMART_DIFF_ROLE;
}
