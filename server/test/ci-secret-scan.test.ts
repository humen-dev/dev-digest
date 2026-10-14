import { describe, it, expect } from 'vitest';
import {
  containsSecretShapedValue,
  containsKnownSecretValue,
  isCredentialShaped,
} from '../src/modules/ci/domain/secret-scan.js';

// Secret-shaped fixtures are assembled at runtime so no source literal matches
// a credential pattern (server/INSIGHTS.md — DET-006).
const fake = (...parts: string[]) => parts.join('');
const A36 = 'a'.repeat(36);
const FIXTURES: Record<string, string> = {
  openrouter: fake('s', 'k-', 'or', 'v1', 'x'.repeat(20)),
  ghClassic: fake('gh', 'p_', A36),
  ghFine: fake('github', '_pat_', 'B'.repeat(22)),
  aws: fake('AK', 'IA', 'ABCDEFGHIJKLMNOP'),
  pem: fake('-----BEGIN ', 'RSA PRIVATE', ' KEY-----'),
  assigned: fake('api_', 'key', ': "', 'Q'.repeat(30), '"'),
};

describe('secret scan — credential-shaped patterns (SPEC-08 Term, AC-42)', () => {
  for (const [name, value] of Object.entries(FIXTURES)) {
    it(`flags ${name}`, () => {
      expect(containsSecretShapedValue(`prefix ${value} suffix`)).toBe(true);
    });
  }

  it('does not flag ordinary text and a short key assignment', () => {
    expect(containsSecretShapedValue('name: DevDigest Review\nmodel: openai/gpt-4.1')).toBe(false);
    expect(containsSecretShapedValue("Key: 'My API Key'")).toBe(false);
  });

  it('does not flag the secret NAME referenced by the workflow', () => {
    expect(containsSecretShapedValue('OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}')).toBe(false);
  });
});

describe('secret scan — workspace secret values', () => {
  const stored = fake('plain', '-stored-', 'value-123');

  it('flags an exact stored value', () => {
    expect(containsKnownSecretValue(`x ${stored} y`, [stored])).toBe(true);
    expect(isCredentialShaped(`x ${stored} y`, [stored])).toBe(true);
  });

  it('skips blank and undefined candidates', () => {
    expect(containsKnownSecretValue('anything', ['', '   ', undefined])).toBe(false);
  });

  it('isCredentialShaped is false for clean text without known values', () => {
    expect(isCredentialShaped('clean text')).toBe(false);
  });
});
