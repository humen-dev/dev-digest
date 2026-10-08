/**
 * Pure tour grounding (SPEC-03 U1): the path grounding primitive, and the
 * full `groundTour` pipeline (redact → truncate → ground → dedupe → limit →
 * count). No I/O — see `onboarding-commands.test.ts` for command grounding.
 */
import { describe, it, expect } from 'vitest';
import { groundPath, isSafeCitedPath } from '../src/modules/onboarding/domain/paths.js';
import { groundTour, isEmptyTour, type GroundingContext } from '../src/modules/onboarding/domain/grounding.js';
import type { TourDraft } from '../src/modules/onboarding/types.js';

function emptyDraft(): TourDraft {
  return { overview: '', diagram: '', critical_paths: [], how_to_run: [], guided_reading: [], first_tasks: [] };
}

function emptyCtx(): GroundingContext {
  return { tracked: new Set(), candidates: new Set(), commandSources: new Map() };
}

describe('UT-4: hostile cited paths are never grounded', () => {
  const tracked = new Set(['a/b']);
  const hostile: Array<[string, string]> = [
    ['absolute path', '/etc/x'],
    ['drive letter', 'C:\\x'],
    ['parent traversal', '../x'],
    ['backslash', 'a\\b'],
    ['NUL byte', 'a\0b'],
  ];

  it.each(hostile)('%s (%s) is unsafe and never grounded', (_label, path) => {
    expect(isSafeCitedPath(path)).toBe(false);
    expect(groundPath(path, tracked, true).grounded).toBe(false);
  });
});

describe('AC-45: first-task target grounding (table)', () => {
  const tracked = new Set(['src/api/a.ts', 'src/api/b.ts', 'specs/01.md']);
  const cases: Array<[string, string, boolean]> = [
    ['absent file in an absent dir', 'ghost/missing.ts', false],
    ['glob matching 0', 'src/none/*.ts', false],
    ['empty dir', 'empty/', false],
    ['glob matching 2 files', 'src/api/*', true],
    ['dir with files', 'specs/', true],
  ];

  it.each(cases)('%s → grounded=%s', (_label, target, grounded) => {
    expect(groundPath(target, tracked, true).grounded).toBe(grounded);
  });
});

describe('AC-46: new-file targets', () => {
  const tracked = new Set(['src/api/public/index.ts']);

  it('a new-file target with a tracked sibling is kept and marked as new', () => {
    expect(groundPath('src/api/public/health.ts', tracked, true)).toEqual({ grounded: true, newFile: true });
  });

  it('a target with no tracked sibling is dropped', () => {
    expect(groundPath('nowhere/x.ts', tracked, true).grounded).toBe(false);
  });
});

describe('groundTour — AC-44 candidate check (critical paths / guided reading)', () => {
  it('a critical path that is not a candidate is dropped and counted', () => {
    const draft = { ...emptyDraft(), critical_paths: [{ path: 'src/invented.ts', note: 'n' }] };
    const result = groundTour(draft, emptyCtx());
    expect(result.critical_paths).toEqual([]);
    expect(result.counters.critical_paths).toEqual({ proposed: 1, dropped: 1 });
  });

  it('a critical path that is a candidate is kept', () => {
    const ctx: GroundingContext = { ...emptyCtx(), candidates: new Set(['src/server.ts']) };
    const draft = { ...emptyDraft(), critical_paths: [{ path: 'src/server.ts', note: 'entry point' }] };
    const result = groundTour(draft, ctx);
    expect(result.critical_paths).toEqual([{ path: 'src/server.ts', note: 'entry point', importer_count: null }]);
    expect(result.counters.critical_paths).toEqual({ proposed: 1, dropped: 0 });
  });
});

describe('groundTour — AC-51/AC-52/AC-53 (limit, dedupe, truncation)', () => {
  it('keeps the first 8 of 12 critical paths, in model order', () => {
    const paths = Array.from({ length: 12 }, (_, i) => `src/file${i}.ts`);
    const candidates = new Set(paths);
    const draft = { ...emptyDraft(), critical_paths: paths.map((p) => ({ path: p, note: 'n' })) };
    const ctx: GroundingContext = { ...emptyCtx(), candidates };
    const result = groundTour(draft, ctx);
    expect(result.critical_paths.map((p) => p.path)).toEqual(paths.slice(0, 8));
    expect(result.counters.critical_paths).toEqual({ proposed: 12, dropped: 0 });
  });

  it('keeps only the first occurrence of a duplicate guided-reading path', () => {
    const candidates = new Set(['src/a.ts']);
    const draft = {
      ...emptyDraft(),
      guided_reading: [
        { path: 'src/a.ts', reason: 'first' },
        { path: 'src/a.ts', reason: 'second' },
      ],
    };
    const ctx: GroundingContext = { ...emptyCtx(), candidates };
    const result = groundTour(draft, ctx);
    expect(result.guided_reading).toEqual([{ path: 'src/a.ts', reason: 'first', importer_count: null }]);
  });

  it('cuts a 2,000-character overview to 1,500 characters ending in "…"', () => {
    const draft = { ...emptyDraft(), overview: 'x'.repeat(2000) };
    const result = groundTour(draft, emptyCtx());
    expect(result.architecture.overview).toHaveLength(1500);
    expect(result.architecture.overview.endsWith('…')).toBe(true);
  });
});

describe('groundTour — AC-14 (overview path chips)', () => {
  it('marks only the inline code span that equals a tracked file', () => {
    const ctx: GroundingContext = { ...emptyCtx(), tracked: new Set(['src/server.ts']) };
    const draft = { ...emptyDraft(), overview: 'See `src/server.ts` and `db`.' };
    const result = groundTour(draft, ctx);
    expect(result.architecture.overview_paths).toEqual(['src/server.ts']);
  });
});

describe('groundTour — AC-66 (diagram)', () => {
  it('stores a non-empty diagram verbatim', () => {
    const draft = { ...emptyDraft(), diagram: 'flowchart LR A --> B' };
    const result = groundTour(draft, emptyCtx());
    expect(result.architecture.diagram).toBe('flowchart LR A --> B');
  });

  it('maps an empty diagram to null', () => {
    const result = groundTour(emptyDraft(), emptyCtx());
    expect(result.architecture.diagram).toBeNull();
  });
});

describe('groundTour — EC-14 (nothing grounded)', () => {
  it('a fully invented draft grounds to an empty tour', () => {
    const draft: TourDraft = {
      overview: '',
      diagram: '',
      critical_paths: [{ path: 'src/invented.ts', note: 'n' }],
      how_to_run: [{ command: 'npm run deploy', note: '' }],
      guided_reading: [{ path: 'docs/invented.md', reason: 'r' }],
      first_tasks: [{ title: 't', target: 'invented/x.ts', complexity: 'low' }],
    };
    const result = groundTour(draft, emptyCtx());
    expect(isEmptyTour(result)).toBe(true);
  });

  it('a non-empty overview alone is not an empty tour', () => {
    const draft = { ...emptyDraft(), overview: 'Some overview text.' };
    const result = groundTour(draft, emptyCtx());
    expect(isEmptyTour(result)).toBe(false);
  });
});

describe('groundTour — UT-8 (secret redaction, commands included)', () => {
  it('a secret-shaped value in a grounded command is stored as ***', () => {
    const secret = `sk_live_${'a'.repeat(24)}`;
    const sources = new Map([['README.md', 'Run:\n\n    echo ***\n']]);
    const draft = { ...emptyDraft(), how_to_run: [{ command: `echo ${secret}`, note: '' }] };
    const ctx: GroundingContext = { ...emptyCtx(), commandSources: sources };
    const result = groundTour(draft, ctx);
    expect(result.how_to_run).toEqual([{ command: 'echo ***', note: null, source: 'README.md' }]);
  });
});

describe('groundTour — NFR-5 (determinism)', () => {
  it('grounding the same draft twice gives deep-equal output', () => {
    const candidates = new Set(['src/a.ts']);
    const sources = new Map([['package.json', JSON.stringify({ scripts: { dev: 'vite' } })]]);
    const tracked = new Set(['src/server.ts', 'src/api/public/index.ts']);
    const draft: TourDraft = {
      overview: 'See `src/server.ts`.',
      diagram: 'flowchart LR A --> B',
      critical_paths: [{ path: 'src/a.ts', note: 'n' }],
      how_to_run: [{ command: 'pnpm dev', note: 'start' }],
      guided_reading: [{ path: 'src/a.ts', reason: 'r' }],
      first_tasks: [{ title: 't', target: 'src/api/public/health.ts', complexity: 'medium' }],
    };
    const ctx: GroundingContext = { tracked, candidates, commandSources: sources };
    expect(groundTour(draft, ctx)).toEqual(groundTour(draft, ctx));
  });
});
