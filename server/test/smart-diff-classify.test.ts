import { describe, it, expect } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../src/modules/smart-diff/domain/classify-file.js';

// NOTE (U1, docs/plans/smart-diff.md §3.3): SMART_DIFF_ROLE_ORDER / SMART_DIFF_ROLE_GLOBS
// live in `smart-diff/constants.ts`, which does not exist yet — U2 creates it. This file
// therefore only imports `classifyFile` (already stubbed by U0 to always return 'core').
// Every row below whose expected role is NOT 'core' must fail on the assertion against
// today's stub; once U2 implements the real classifier, all rows must pass unedited.

describe('classifyFile — required first-match decisions (docs/plans/smart-diff.md §3.3)', () => {
  it("'__tests__/__snapshots__/x.snap' classifies as boilerplate — snapshots are matched before tests in SMART_DIFF_ROLE_GLOBS", () => {
    expect(classifyFile('__tests__/__snapshots__/x.snap')).toBe('boilerplate');
  });

  it("'e2e/README.md' classifies as tests — tests are matched before docs, decided in docs/plans/smart-diff.md §3.3", () => {
    expect(classifyFile('e2e/README.md')).toBe('tests');
  });

  it("'.claude/skills/security/SKILL.md' classifies as wiring — wiring is matched before docs, decided in docs/plans/smart-diff.md §3.3", () => {
    expect(classifyFile('.claude/skills/security/SKILL.md')).toBe('wiring');
  });
});

describe('classifyFile — full table (docs/plans/smart-diff.md §3.3)', () => {
  const rows: Array<[path: string, role: SmartDiffRole, reason: string]> = [
    // boilerplate — lock files at any depth
    ['pnpm-lock.yaml', 'boilerplate', 'lock file at repo root'],
    ['client/pnpm-lock.yaml', 'boilerplate', 'lock file nested under a package'],
    ['package-lock.json', 'boilerplate', 'lock file'],
    ['yarn.lock', 'boilerplate', 'lock file'],
    ['Cargo.lock', 'boilerplate', 'lock file, non-JS ecosystem'],
    // boilerplate — build output directories beat the index.js barrel glob
    ['dist/index.js', 'boilerplate', 'boilerplate beats the index.js barrel'],
    ['build/app.js', 'boilerplate', 'build output directory'],
    // boilerplate — snapshots beat tests
    ['src/__snapshots__/a.test.ts.snap', 'boilerplate', 'snapshot nested under src'],
    // boilerplate — generated / minified
    ['src/api.generated.ts', 'boilerplate', 'generated file'],
    ['public/vendor.min.js', 'boilerplate', 'minified file'],

    // tests
    ['server/test/foo.test.ts', 'tests', '*.test.ts'],
    ['client/src/A.test.tsx', 'tests', '*.test.tsx'],
    ['server/test/x.it.test.ts', 'tests', '*.it.test.ts'],
    ['src/a.spec.ts', 'tests', '*.spec.ts'],
    ['test/helpers/pg.ts', 'tests', '**/test/** — zero or more leading dirs'],
    ['src/tests/util.ts', 'tests', '**/tests/**'],
    ['src/__tests__/util.ts', 'tests', '**/__tests__/**'],
    ['e2e/specs/05-pr-diff.flow.json', 'tests', '**/e2e/**'],

    // wiring — barrels
    ['client/src/components/diff-viewer/index.ts', 'wiring', 'barrel: index.ts'],
    ['lib/index.js', 'wiring', 'barrel: index.js'],
    // wiring — config / infra
    ['vitest.config.ts', 'wiring', '*.config.*'],
    ['client/next.config.mjs', 'wiring', '*.config.*'],
    ['tsconfig.json', 'wiring', 'tsconfig*.json'],
    ['server/tsconfig.build.json', 'wiring', 'tsconfig*.json'],
    ['.eslintrc.cjs', 'wiring', '.eslintrc*'],
    ['.env.example', 'wiring', '.env*'],
    ['docker-compose.yml', 'wiring', 'docker-compose*.yml'],
    ['docker-compose.test.yml', 'wiring', 'docker-compose*.yml'],
    ['.github/workflows/ci.yml', 'wiring', '**/.github/**'],

    // docs — case-insensitive
    ['docs/plans/smart-diff.md', 'docs', '**/docs/**'],
    ['docs/diagram.png', 'docs', '**/docs/**, non-markdown file'],
    ['README.md', 'docs', 'README*'],
    ['server/README.md', 'docs', 'README* at any depth (basename glob)'],
    ['README', 'docs', 'README* with no extension'],
    ['readme.md', 'docs', 'case-insensitive match'],
    ['CHANGELOG.md', 'docs', 'CHANGELOG*'],
    ['LICENSE', 'docs', 'LICENSE'],

    // core — no glob matches
    ['server/src/modules/pulls/routes.ts', 'core', 'ordinary source file'],
    ['src/config.ts', 'core', 'config.ts has no ".config." part'],
    ['server/src/db/migrations/0001_x.sql', 'core', 'migration file'],
    ['package.json', 'core', 'package.json is not package-lock.json'],
    ['src/testing/x.ts', 'core', '"testing" is not "test"/"tests"'],
    ['src/index.tsx', 'core', 'OQ3: only index.ts/index.js are barrels, index.tsx is core'],

    // OQ2 (resolved 2026-09-27): directory globs match at ANY depth
    ['client/dist/a.js', 'boilerplate', 'OQ2 resolved: **/dist/** matches nested package dirs'],
    ['server/build/x.js', 'boilerplate', 'OQ2 resolved: **/build/** matches nested package dirs'],
    ['server/docs/x.txt', 'docs', 'OQ2 resolved: **/docs/** matches nested package dirs'],
    ['client/e2e/a.ts', 'tests', 'OQ2 resolved: **/e2e/** matches nested package dirs'],
    ['server/.claude/x.md', 'wiring', 'OQ2 resolved: **/.claude/** matches nested package dirs, wiring beats docs'],

    // path normalisation
    ['server\\test\\a.test.ts', 'tests', 'backslashes are normalised to / before matching'],
  ];

  it.each(rows)('%s → %s (%s)', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});
