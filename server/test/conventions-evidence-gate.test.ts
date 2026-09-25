import { describe, it, expect } from 'vitest';
import {
  locateSnippet,
  resolveEvidencePath,
  stripGutter,
  verifyCandidate,
} from '../src/modules/conventions/domain/evidence-gate.js';
import type { ProposedCandidate } from '../src/modules/conventions/types.js';

const USERS = [
  "import { db } from '@/lib/db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
  '',
  'export async function getAdmin(id: string) {',
  '  const user = await db.users.find(id);',
  '  return user;',
  '}',
].join('\n');

const files = new Map<string, string>([
  ['src/api/users.ts', USERS],
  ['src/api/index.ts', 'export * from "./users";'],
  ['lib/index.ts', 'export const x = 1;'],
]);

const candidate = (over: Partial<ProposedCandidate> = {}): ProposedCandidate => ({
  rule: 'Always use async/await instead of .then() chains',
  rationale: 'Flag new .then() chains.',
  evidence_path: 'src/api/users.ts',
  evidence_line: 4,
  evidence_snippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });',
  grep_literal: 'await db.',
  category: 'style',
  confidence: 0.91,
  ...over,
});

describe('resolveEvidencePath', () => {
  const sampled = [...files.keys()];
  it('matches exactly, with ./ and backslashes normalized', () => {
    expect(resolveEvidencePath('src/api/users.ts', sampled)).toBe('src/api/users.ts');
    expect(resolveEvidencePath('./src/api/users.ts', sampled)).toBe('src/api/users.ts');
    expect(resolveEvidencePath('src\\api\\users.ts', sampled)).toBe('src/api/users.ts');
  });
  it('accepts a UNIQUE suffix match, either direction', () => {
    expect(resolveEvidencePath('users.ts', sampled)).toBe('src/api/users.ts');
    expect(resolveEvidencePath('payments-api/src/api/users.ts', sampled)).toBe('src/api/users.ts');
  });
  it('rejects ambiguous, unknown and unsafe paths', () => {
    expect(resolveEvidencePath('index.ts', sampled)).toBeNull();
    expect(resolveEvidencePath('src/other.ts', sampled)).toBeNull();
    expect(resolveEvidencePath('../src/api/users.ts', sampled)).toBeNull();
    expect(resolveEvidencePath('/src/api/users.ts', sampled)).toBeNull();
  });
});

describe('stripGutter', () => {
  it('removes a copied gutter only when every non-empty line has one', () => {
    expect(stripGutter(' 4 │   const a = 1;\n 5 │   const b = 2;')).toBe('  const a = 1;\n  const b = 2;');
    expect(stripGutter('12 | x = 1')).toBe('x = 1');
    expect(stripGutter('const a = 1;\n5 | b')).toBe('const a = 1;\n5 | b');
  });
});

describe('locateSnippet', () => {
  it('ignores whitespace and CRLF differences', () => {
    const crlf = USERS.replaceAll('\n', '\r\n');
    expect(locateSnippet(crlf, 'const posts =    await db.posts.findMany({userId: id});', 5)).toEqual({
      startLine: 5,
      endLine: 5,
    });
  });
  it('picks the occurrence nearest the claimed line', () => {
    const s = 'const user = await db.users.find(id);';
    expect(locateSnippet(USERS, s, 11)).toEqual({ startLine: 10, endLine: 10 });
    expect(locateSnippet(USERS, s, 1)).toEqual({ startLine: 4, endLine: 4 });
    expect(locateSnippet(USERS, s, null)).toEqual({ startLine: 4, endLine: 4 });
  });
  it('returns null when the snippet is not in the file', () => {
    expect(locateSnippet(USERS, 'fetch(url).then(r => r.json())', 3)).toBeNull();
  });
});

describe('verifyCandidate', () => {
  it('keeps a grounded candidate with path, corrected line and snippet taken from the FILE', () => {
    const r = verifyCandidate(candidate({ evidence_line: 40, evidence_path: './users.ts' }), files);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidate.evidencePath).toBe('src/api/users.ts');
    expect(r.candidate.evidenceLine).toBe(4);
    expect(r.candidate.evidenceSnippet).toBe(
      'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });',
    );
    expect(r.candidate.category).toBe('style');
  });

  it('accepts a gutter-prefixed snippet', () => {
    const r = verifyCandidate(candidate({ evidence_snippet: ' 4 │   const user = await db.users.find(id);' }), files);
    expect(r.ok).toBe(true);
  });

  it.each([
    [{ evidence_path: 'src/api/ghost.ts' }, 'unknown_path'],
    [{ evidence_snippet: '}' }, 'snippet_too_short'],
    [{ evidence_snippet: 'return fetch(url).then((r) => r.json());' }, 'snippet_not_found'],
    [{ rule: '   ' }, 'empty_rule'],
  ] as const)('drops %j (%s)', (over, reason) => {
    expect(verifyCandidate(candidate(over), files)).toEqual({ ok: false, reason });
  });

  it('clamps confidence and falls back to category other', () => {
    const r = verifyCandidate(candidate({ confidence: 7, category: 'vibes' }), files);
    expect(r.ok && r.candidate.confidence).toBe(1);
    expect(r.ok && r.candidate.category).toBe('other');
  });
});
