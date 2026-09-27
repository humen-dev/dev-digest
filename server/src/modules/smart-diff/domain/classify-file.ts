import type { SmartDiffRole } from '@devdigest/shared';

// stub — implemented by U2 (docs/plans/smart-diff.md)
export function classifyFile(path: string): SmartDiffRole {
  void path;
  return 'core';
}
