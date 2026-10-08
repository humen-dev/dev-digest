import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../../smart-diff/index.js';
import { TOP_FILES_PER_PULL } from '../constants.js';
import type { DigestPullItem, PrDigest } from '../types.js';

export interface DigestInput {
  prId: string;
  number: number;
  title: string;
  author: string;
  intent: string | null;
  files: string[];
}

export function rolesOf(files: string[]): SmartDiffRole[] {
  const roles = new Set<SmartDiffRole>();
  for (const path of files.slice(0, TOP_FILES_PER_PULL * 4)) roles.add(classifyFile(path));
  return [...roles];
}

export function buildDigest(
  repoId: string,
  since: Date,
  pulls: DigestInput[],
  activeSkills: string[],
): PrDigest {
  const items: DigestPullItem[] = pulls.map((p) => ({
    prId: p.prId,
    number: p.number,
    title: p.title,
    author: p.author,
    intent: p.intent,
    roles: rolesOf(p.files),
  }));

  const byRole: Partial<Record<SmartDiffRole, number>> = {};
  for (const item of items) {
    for (const role of item.roles) byRole[role] = (byRole[role] ?? 0) + 1;
  }

  return {
    repoId,
    since: since.toISOString(),
    pulls: items,
    byRole: byRole as Record<SmartDiffRole, number>,
    activeSkills: [...activeSkills].sort((a, b) => a.localeCompare(b)),
  };
}
