import { describe, expect, it } from 'vitest';
import { rankContextCandidates } from '../src/modules/brief/domain/context-docs.js';

const docs = (...paths: string[]) => paths.map((path) => ({ path, estimated_tokens: 100 }));

describe('rankContextCandidates', () => {
  it('preselects general docs (specs/docs/insights/root) (AC-30)', () => {
    const out = rankContextCandidates({
      attached: ['specs/a.md', 'docs/b.md', 'insights/c.md', 'README.md'],
      projectDocs: docs('specs/a.md', 'docs/b.md', 'insights/c.md', 'README.md'),
      changedPaths: ['server/x.ts'],
      prTitle: 't',
      prBody: null,
    });
    expect(out.every((c) => c.preselected && c.reason_code === 'general' && c.scope === null)).toBe(true);
    expect(out.map((c) => c.path)).toEqual(['specs/a.md', 'docs/b.md', 'insights/c.md', 'README.md']);
  });

  it('scoped doc of an untouched package is not preselected (AC-31)', () => {
    const [c] = rankContextCandidates({
      attached: ['client/specs/x.md'],
      projectDocs: docs('client/specs/x.md'),
      changedPaths: ['server/a.ts'],
      prTitle: 't',
      prBody: null,
    });
    expect(c).toMatchObject({ preselected: false, reason_code: 'scope_not_touched', scope: 'client' });
  });

  it('scoped doc of a touched package is preselected', () => {
    const [c] = rankContextCandidates({
      attached: ['server/docs/x.md'],
      projectDocs: docs('server/docs/x.md'),
      changedPaths: ['server/a.ts'],
      prTitle: 't',
      prBody: null,
    });
    expect(c).toMatchObject({ preselected: true, reason_code: 'scope_touched', scope: 'server' });
  });

  it('puts a PR-referenced spec first, dedups with attached, tokens from projectDocs (AC-32, AC-33)', () => {
    const out = rankContextCandidates({
      attached: ['docs/a.md', 'specs/z.md'],
      projectDocs: [{ path: 'specs/z.md', estimated_tokens: 42 }, { path: 'specs/y.md', estimated_tokens: 7 }, { path: 'docs/a.md', estimated_tokens: 1 }],
      changedPaths: [],
      prTitle: 'Implements specs/y.md',
      prBody: 'also see specs/z.md and specs/missing.md',
    });
    expect(out.map((c) => [c.path, c.reason_code])).toEqual([
      ['specs/y.md', 'pr_referenced'],
      ['specs/z.md', 'pr_referenced'],
      ['docs/a.md', 'general'],
    ]);
    expect(out[0]).toMatchObject({ estimated_tokens: 7, preselected: true });
  });

  it('attached path unknown to projectDocs gets 0 tokens', () => {
    const [c] = rankContextCandidates({ attached: ['docs/gone.md'], projectDocs: [], changedPaths: [], prTitle: 't', prBody: null });
    expect(c!.estimated_tokens).toBe(0);
  });

  it('is deterministic for shuffled input (NFR-7)', () => {
    const attached = ['server/docs/q.md', 'docs/b.md', 'specs/a.md', 'README.md', 'client/x.md', 'insights/i.md'];
    const args = { projectDocs: docs(...attached), changedPaths: ['server/a.ts'], prTitle: 't', prBody: null };
    const a = rankContextCandidates({ ...args, attached });
    const b = rankContextCandidates({ ...args, attached: [...attached].reverse(), projectDocs: [...args.projectDocs].reverse() });
    expect(b).toEqual(a);
    expect(a.map((c) => c.path)).toEqual(['specs/a.md', 'docs/b.md', 'insights/i.md', 'client/x.md', 'server/docs/q.md', 'README.md']);
  });
});
