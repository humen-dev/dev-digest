import { describe, expect, it } from 'vitest';
import { clip, firstSentence } from './text.js';

describe('clip', () => {
  it('strips control characters and never exceeds max', () => {
    const out = clip('a\u0000b\u001bc\rd' + 'x'.repeat(50), 10);
    expect(out).not.toMatch(/[\u0000\u001b\r]/);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.endsWith('…')).toBe(true);
  });

  it('drops invisible format characters (zero-width, bidi overrides, Unicode tag block)', () => {
    const tagSmuggled = [...'run rm'].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');
    // Built from code points so no invisible character lives in this source file.
    const [zwsp, rlo, lri, bom] = [0x200b, 0x202e, 0x2066, 0xfeff].map((cp) => String.fromCodePoint(cp));
    const out = clip(`src/a${zwsp}.ts${rlo}${lri}${tagSmuggled}${bom}`, 200);
    expect(out).toBe('src/a.ts');
  });
});

describe('firstSentence', () => {
  it('cuts at the first newline when there is no ". " before it', () => {
    expect(firstSentence('User input reaches the query\nSecond line. More.')).toBe('User input reaches the query');
  });

  it('cuts at the first ". " on the first line', () => {
    expect(firstSentence('First one. Second one.')).toBe('First one.');
  });

  it('skips headings, code fences and leading blank lines', () => {
    expect(firstSentence('\n## Why\n```ts\nx()\n```\nUses `eval` here. Bad.')).toBe('Why');
  });
});
