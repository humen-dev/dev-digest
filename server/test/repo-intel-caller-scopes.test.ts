import { describe, it, expect } from 'vitest';
import { callerScopes } from '../src/modules/repo-intel/domain/caller-scopes.js';

describe('callerScopes', () => {
  it('returns the TS function containing the reference line', () => {
    const rows = [
      { name: 'getOrder', line: 5, endLine: 7 },
      { name: 'listOrders', line: 9, endLine: 11 },
    ];
    expect(callerScopes(rows, 10, 'listOrders')).toEqual(['listOrders']);
  });

  it('returns dotted and bare Python scopes, sorted', () => {
    const rows = [
      { name: 'ContactViewSet', line: 21, endLine: 28 },
      { name: 'ContactViewSet.import_csv', line: 26, endLine: 28 },
      { name: 'import_csv', line: 26, endLine: 28 },
      { name: 'other', line: 30, endLine: 35 },
    ];
    expect(callerScopes(rows, 27, 'import_csv')).toEqual([
      'ContactViewSet',
      'ContactViewSet.import_csv',
      'import_csv',
    ]);
  });

  it('returns [] for a module-level reference after a function', () => {
    expect(callerScopes([{ name: 'f', line: 1, endLine: 3 }], 10, 'f')).toEqual([]);
  });

  it('counts a null endLine only when the name equals the enclosing label', () => {
    const rows = [
      { name: 'a', line: 1, endLine: null },
      { name: 'b', line: 2, endLine: null },
    ];
    expect(callerScopes(rows, 5, 'b')).toEqual(['b']);
    expect(callerScopes(rows, 5, null)).toEqual([]);
  });
});
