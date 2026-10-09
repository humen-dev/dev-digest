import { describe, it, expect } from 'vitest';
import { maskSecretsForStorage, secretPrefix } from '../src/modules/_shared/secrets.js';

// Fixtures are assembled at runtime so no secret-shaped literal sits in the source.
const stripe = 'sk_' + 'live_' + 'A1b2C3d4E5f6G7h8I9j0K1l2';
const body = ['MIIEvQIBADANBgkqhkiG9w0BAQEFAASC', 'KgwggSkAgEAAoIBAQC7VJTUt9Us8cKj', 'a+b/c+d/e=='];
const pem = (prefix: string): string[] => [
  `${prefix}-----BEGIN RSA PRIVATE KEY-----`,
  ...body.map((l) => prefix + l),
  `${prefix}-----END RSA PRIVATE KEY-----`,
];

describe('maskSecretsForStorage', () => {
  it('turns a Stripe-shaped token into a same-length placeholder keeping the prefix (AC-14, UT-3)', () => {
    const diff = ['@@ -1,2 +1,3 @@', ' const a = 1;', `+const key = "${stripe}";`].join('\n');
    const out = maskSecretsForStorage(diff);
    expect(out).not.toContain(stripe);
    expect(out).toContain('sk_live_XXXX');
    expect(out.length).toBe(diff.length);
    expect(out.split('\n')).toHaveLength(diff.split('\n').length);
  });

  it('masks the other token shapes with their literal prefix', () => {
    const tokens = [
      'AKIA' + 'ABCDEFGHIJKLMNOP',
      'ghp_' + 'a'.repeat(36),
      'npm_' + 'b'.repeat(36),
      'xoxb-' + '1234567890-abcdefghij',
      'AIza' + 'c'.repeat(35),
    ];
    for (const t of tokens) {
      const out = maskSecretsForStorage(`x = ${t}`);
      expect(out).not.toContain(t);
      expect(out.length).toBe(`x = ${t}`.length);
      expect(out.startsWith(`x = ${secretPrefix(t)}X`)).toBe(true);
    }
  });

  it('masks a whole PEM block inside a diff and keeps structure (AC-14a)', () => {
    const lines = ['@@ -0,0 +1,5 @@', ...pem('+'), '+const after = 1;'];
    const input = lines.join('\n');
    const out = maskSecretsForStorage(input);
    const outLines = out.split('\n');
    expect(outLines).toHaveLength(lines.length);
    for (const b of body) expect(out).not.toContain(b);
    expect(outLines[1]).toBe(lines[1]);
    expect(outLines[5]).toBe(lines[5]);
    outLines.forEach((l, i) => {
      expect(l.length).toBe((lines[i] as string).length);
      expect(l[0]).toBe((lines[i] as string)[0]);
    });
    expect(outLines[6]).toBe('+const after = 1;');
    expect(maskSecretsForStorage(input)).toBe(out);
  });

  it('keeps prefix characters for context and removed lines too', () => {
    for (const p of [' ', '-']) {
      const lines = pem(p);
      const out = maskSecretsForStorage(lines.join('\n')).split('\n');
      out.forEach((l, i) => expect(l[0]).toBe(p) && expect(l.length).toBe((lines[i] as string).length));
      for (const b of body) expect(out.join('\n')).not.toContain(b);
    }
  });

  it('masks a bare PEM block without a diff prefix, keeping "+" base64 characters out', () => {
    const lines = pem('');
    const out = maskSecretsForStorage(lines.join('\n'));
    for (const b of body) expect(out).not.toContain(b);
    expect(out.split('\n')[0]).toBe(lines[0]);
  });

  it('stops an unterminated block at the next hunk header', () => {
    const input = ['+-----BEGIN PRIVATE KEY-----', '+' + body[0], '@@ -9,1 +9,1 @@', '+safe line'].join('\n');
    const out = maskSecretsForStorage(input).split('\n');
    expect(out[2]).toBe('@@ -9,1 +9,1 @@');
    expect(out[3]).toBe('+safe line');
  });

  it('leaves text without secrets unchanged', () => {
    const text = 'mentions sk_live and service_role by name only';
    expect(maskSecretsForStorage(text)).toBe(text);
  });
});
