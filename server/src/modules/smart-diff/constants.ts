/**
 * Classification rules for the Smart Diff (docs/plans/smart-diff.md §3.3).
 * `SMART_DIFF_ROLE_GLOBS` is matched first-match-wins, in array order; `core`
 * is the fallback when nothing matches (`domain/classify-file.ts`).
 */
import { SmartDiffRole } from '@devdigest/shared';

export const SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = SmartDiffRole.options;
export const DEFAULT_SMART_DIFF_ROLE: SmartDiffRole = 'core';

/** First match wins, in this array order. `core` = no match. */
export const SMART_DIFF_ROLE_GLOBS: readonly { role: Exclude<SmartDiffRole, 'core'>; globs: readonly string[] }[] = [
  {
    role: 'boilerplate',
    globs: [
      '*.lock',
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
      '**/dist/**',
      '**/build/**',
      '**/__snapshots__/**',
      '*.snap',
      '*.generated.*',
      '*.min.js',
    ],
  },
  {
    role: 'tests',
    globs: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.it.test.ts',
      '**/*.spec.ts',
      '**/test/**',
      '**/tests/**',
      '**/__tests__/**',
      '**/e2e/**',
    ],
  },
  {
    role: 'wiring',
    globs: [
      '**/index.ts',
      '**/index.js',
      '*.config.*',
      'tsconfig*.json',
      '.eslintrc*',
      '.env*',
      'docker-compose*.yml',
      '**/.github/**',
      '**/.claude/**',
    ],
  },
  {
    role: 'docs',
    globs: ['**/*.md', '**/docs/**', 'README*', 'CHANGELOG*', 'LICENSE'],
  },
];
