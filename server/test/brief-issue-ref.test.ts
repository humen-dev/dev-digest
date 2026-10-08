import { describe, it, expect } from 'vitest';
import { findLinkedIssue } from '../src/modules/brief/domain/issue-ref.js';

describe('findLinkedIssue', () => {
  it.each([
    ['t', 'Fixes #12 and also #3', 12],
    ['t', 'see #7', 7],
    ['t', 'nothing here', null],
    ['Closes #5', 'also #9', 5],
    ['see #2', 'RESOLVES #8', 8],
    ['t', null, null],
  ] as const)('%j / %j -> %j', (title, body, expected) => {
    expect(findLinkedIssue(title, body)).toBe(expected);
  });
});
