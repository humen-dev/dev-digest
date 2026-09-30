import { describe, it, expect } from 'vitest';
import { parseFactHandlers } from '../src/modules/repo-intel/mappers.js';

describe('parseFactHandlers', () => {
  it('keeps known facts, dedups and sorts, drops junk', () => {
    const facts = ['GET /a', 'GET /b', 'GET /c'];
    const value = {
      'GET /a': ['y', 'x', 'y', 5, null],
      'GET /b': [],
      'GET /c': 'nope',
      'GET /not-a-fact': ['z'],
    };
    expect(parseFactHandlers(value, facts)).toEqual({ 'GET /a': ['x', 'y'] });
  });

  it('returns {} for non-object input', () => {
    for (const v of [null, undefined, 'x', 3, ['a']]) {
      expect(parseFactHandlers(v, ['a'])).toEqual({});
    }
  });

  it('does not pollute prototypes', () => {
    const value = JSON.parse('{"__proto__": ["x"]}');
    const out = parseFactHandlers(value, []);
    expect(out).toEqual({});
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    const out2 = parseFactHandlers(value, ['__proto__']);
    expect(Object.getPrototypeOf(out2)).toBe(Object.prototype);
  });
});
