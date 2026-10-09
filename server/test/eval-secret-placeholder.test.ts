import { describe, it, expect } from 'vitest';
import { maskSecretsForStorage, secretPrefix } from '../src/modules/_shared/secrets.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

// Fixtures are assembled at runtime so no secret-shaped literal sits in the source.
const stripe = 'sk_' + 'live_' + 'A1b2C3d4E5f6G7h8I9j0K1l2';
const pk = 'PRIVATE' + ' KEY';
const body = ['MIIEvQIBADANBgkqhkiG9w0BAQEFAASC', 'KgwggSkAgEAAoIBAQC7VJTUt9Us8cKj', 'a+b/c+d/e=='];
const pem = (prefix: string): string[] => [
  `${prefix}-----BEGIN RSA ${pk}-----`,
  ...body.map((l) => prefix + l),
  `${prefix}-----END RSA ${pk}-----`,
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
      out.forEach((l, i) => {
        expect(l[0]).toBe(p);
        expect(l.length).toBe((lines[i] as string).length);
      });
      for (const b of body) expect(out.join('\n')).not.toContain(b);
    }
  });

  it('keeps every body line marker and the new-side line numbers when the PEM is assigned to a variable or indented (YAML)', () => {
    const header = ['diff --git a/k.ts b/k.ts', '--- a/k.ts', '+++ b/k.ts', '@@ -1,2 +1,9 @@', ' const before = 1;'];
    const cases: { begin: string; indent: string }[] = [
      { begin: `+const KEY = \`-----BEGIN RSA ${pk}-----`, indent: '' },
      { begin: `+    -----BEGIN RSA ${pk}-----`, indent: '    ' },
    ];
    for (const { begin, indent } of cases) {
      const lines = [
        ...header,
        begin,
        ...body.map((l) => `+${indent}${l}`),
        `+${indent}-----END RSA ${pk}-----\``,
        '+const after = 2;',
      ];
      const input = lines.join('\n');
      const out = maskSecretsForStorage(input);
      const outLines = out.split('\n');
      expect(outLines).toHaveLength(lines.length);
      for (const b of body) expect(out).not.toContain(b);
      outLines.forEach((l, i) => expect(l.length).toBe((lines[i] as string).length));
      // body lines sit between the BEGIN line and the END line
      for (let i = header.length + 1; i <= header.length + body.length; i++) {
        expect((outLines[i] as string).startsWith(`+${indent}X`)).toBe(true);
      }
      expect(outLines[outLines.length - 1]).toBe('+const after = 2;');
      const newLines = (raw: string) => parseUnifiedDiff(raw).files.flatMap((f) => f.hunks.flatMap((h) => h.newLineNumbers));
      expect(newLines(out)).toEqual(newLines(input));
      expect(parseUnifiedDiff(out).files[0]!.additions).toBe(parseUnifiedDiff(input).files[0]!.additions);
    }
  });

  it('masks a bare PEM block without a diff prefix, keeping "+" base64 characters out', () => {
    const lines = pem('');
    const out = maskSecretsForStorage(lines.join('\n'));
    for (const b of body) expect(out).not.toContain(b);
    expect(out.split('\n')[0]).toBe(lines[0]);
  });

  it('stops an unterminated block at the next hunk header', () => {
    const input = [`+-----BEGIN ${pk}-----`, '+' + body[0], '@@ -9,1 +9,1 @@', '+safe line'].join('\n');
    const out = maskSecretsForStorage(input).split('\n');
    expect(out[2]).toBe('@@ -9,1 +9,1 @@');
    expect(out[3]).toBe('+safe line');
  });

  const newLines = (raw: string) => parseUnifiedDiff(raw).files.flatMap((f) => f.hunks.flatMap((h) => h.newLineNumbers));
  const expectStructure = (input: string, out: string) => {
    const a = input.split('\n');
    const b = out.split('\n');
    expect(b).toHaveLength(a.length);
    b.forEach((l, i) => {
      expect(l.length).toBe((a[i] as string).length);
      expect(l[0]).toBe((a[i] as string)[0]);
    });
    expect(newLines(out)).toEqual(newLines(input));
    expect(maskSecretsForStorage(input)).toBe(out);
  };

  it('masks the body run above an END marker when the hunk has no BEGIN (tail-only context)', () => {
    const lines = [
      'diff --git a/k.pem b/k.pem',
      '--- a/k.pem',
      '+++ b/k.pem',
      '@@ -10,5 +10,5 @@',
      ' unrelated header',
      ...body.map((l) => ' ' + l),
      ` -----END RSA ${pk}-----`,
      ' tail',
    ];
    const input = lines.join('\n');
    const out = maskSecretsForStorage(input);
    for (const b of body) expect(out).not.toContain(b);
    const outLines = out.split('\n');
    expect(outLines[4]).toBe(' unrelated header');
    expect(outLines[8]).toBe(lines[8]);
    expect(outLines[9]).toBe(' tail');
    expectStructure(input, out);
  });

  it('masks a key whose body is split across two hunks of the same file', () => {
    const lines = [
      'diff --git a/k.pem b/k.pem',
      '--- a/k.pem',
      '+++ b/k.pem',
      '@@ -1,3 +1,3 @@',
      ` -----BEGIN RSA ${pk}-----`,
      ' ' + body[0],
      '@@ -20,3 +20,3 @@',
      ' ' + body[1],
      ' ' + body[2],
      ` -----END RSA ${pk}-----`,
      ' after key',
    ];
    const input = lines.join('\n');
    const out = maskSecretsForStorage(input);
    for (const b of body) expect(out).not.toContain(b);
    const outLines = out.split('\n');
    expect(outLines[3]).toBe('@@ -1,3 +1,3 @@');
    expect(outLines[6]).toBe('@@ -20,3 +20,3 @@');
    expect(outLines[10]).toBe(' after key');
    expectStructure(input, out);
  });

  it('does not carry an open block into the next file', () => {
    const input = [
      `+-----BEGIN ${pk}-----`,
      '+' + body[0],
      'diff --git a/b.ts b/b.ts',
      '@@ -1,1 +1,1 @@',
      '+' + body[1],
    ].join('\n');
    const out = maskSecretsForStorage(input).split('\n');
    expect(out[4]).toBe('+' + body[1]);
  });

  it('leaves a base64-looking line that is not near an END marker or inside a block unchanged', () => {
    const input = ['@@ -1,3 +1,3 @@', ' ' + body[0], '+' + body[1], ' const x = 1;', ` -----END RSA ${pk}-----`].join('\n');
    const out = maskSecretsForStorage(input).split('\n');
    expect(out[1]).toBe(' ' + body[0]);
    expect(out[2]).toBe('+' + body[1]);
    const solo = ['@@ -1,2 +1,2 @@', ' ' + body[0], ' const y = 2;'].join('\n');
    expect(maskSecretsForStorage(solo)).toBe(solo);
  });

  it('leaves text without secrets unchanged', () => {
    const text = 'mentions sk_live and service_role by name only';
    expect(maskSecretsForStorage(text)).toBe(text);
  });
});
