/**
 * Secret-value detection and redaction shared by any module that handles
 * repository or model text (SPEC-01 UT-8, SPEC-03 UT-7/UT-8). Regex matches
 * on CONCRETE token shapes only — never bare keyword matching, so text that
 * merely mentions "sk_live", "service_role" or "NEXT_PUBLIC_" by name does
 * not trip this.
 *
 * Promoted from `project-context/domain/secrets.ts` (SPEC-03 D6) — that path
 * is now a re-export. `_shared/` is the one place both modules may import
 * from, since `no-cross-module-internals` forbids importing another
 * module's `domain/` (`server/.dependency-cruiser.cjs`).
 */

const SECRET_PATTERNS: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/, // AWS access key id
  /AIza[0-9A-Za-z_-]{35}/, // Google API key
  /gh[ps]_[A-Za-z0-9]{36,}/, // GitHub token (classic / fine-grained PAT)
  /npm_[A-Za-z0-9]{36}/, // npm token
  /xox[bpsa]-[0-9a-zA-Z-]+/, // Slack token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM private key block
  /sk_live_[A-Za-z0-9]{20,}/, // Stripe live secret key
];

/** Fresh `g`-flagged copies for `replace` — never share regex state (`lastIndex`) across calls. */
function globalPatterns(): RegExp[] {
  return SECRET_PATTERNS.map((re) => new RegExp(re.source, 'g'));
}

/** True when `text` contains at least one concrete secret-shaped token. */
export function containsSecretValue(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

/** Replaces every secret-shaped token in `text` with `***` (SPEC-03 UT-8). */
export function redactSecretValues(text: string): string {
  let result = text;
  for (const re of globalPatterns()) {
    result = result.replace(re, '***');
  }
  return result;
}

// ---- Storage placeholders (SPEC-05 AC-14 / AC-14a) ----

const PEM_BEGIN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const PEM_END = /-----END [A-Z ]*PRIVATE KEY-----/;
const PEM_SAME_LINE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----)([\s\S]*?)(-----END [A-Z ]*PRIVATE KEY-----)/g;
const FILLER = 'X';

/** Token shapes masked by `maskSecretsForStorage` (PEM blocks are handled separately). */
const TOKEN_PATTERNS: readonly RegExp[] = SECRET_PATTERNS.filter((re) => !re.source.includes('BEGIN'));

/**
 * The fixed literal part of a secret-shaped match: `AKIA`, `AIza`, `ghp_` /
 * `ghs_`, `npm_`, `xox?-`, `sk_live_`. Empty string when `match` is not one of
 * the known token shapes.
 */
export function secretPrefix(match: string): string {
  if (match.startsWith('AKIA')) return 'AKIA';
  if (match.startsWith('AIza')) return 'AIza';
  if (/^gh[ps]_/.test(match)) return match.slice(0, 4);
  if (match.startsWith('npm_')) return 'npm_';
  if (/^xox[bpsa]-/.test(match)) return match.slice(0, 5);
  if (match.startsWith('sk_live_')) return 'sk_live_';
  return '';
}

function fill(n: number): string {
  return FILLER.repeat(Math.max(0, n));
}

/** Masks PEM private-key bodies line by line, keeping BEGIN/END lines, line count, lengths and diff prefixes. */
function maskPemBlocks(text: string): string {
  const lines = text.split('\n');
  let inPem = false;
  let prefixLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] as string;
    const cr = raw.endsWith('\r') ? '\r' : '';
    const line = cr ? raw.slice(0, -1) : raw;
    if (!inPem) {
      const begin = PEM_BEGIN.exec(line);
      if (!begin) continue;
      // Same-line block (e.g. an escaped-newline literal): mask what sits between the markers.
      const sameLine = line.replace(PEM_SAME_LINE, (_m, b: string, body: string, e: string) => b + fill(body.length) + e);
      if (sameLine !== line) {
        lines[i] = sameLine + cr;
        continue;
      }
      // A single leading diff marker before the BEGIN marker is the diff prefix.
      const lead = line.slice(0, begin.index);
      prefixLen = /^[+\- ]$/.test(lead) ? 1 : 0;
      inPem = true;
      continue;
    }
    // Inside a block: never swallow diff structure lines of an unterminated block.
    if (line.startsWith('@@') || line.startsWith('diff --git')) {
      inPem = false;
      continue;
    }
    if (PEM_END.test(line)) {
      inPem = false;
      continue;
    }
    lines[i] = line.slice(0, prefixLen) + fill(line.length - prefixLen) + cr;
  }
  return lines.join('\n');
}

/**
 * Replaces secret values with deterministic, length-preserving placeholders so
 * a frozen eval input never stores a live secret yet keeps its line structure.
 * Whole PEM private-key blocks first (AC-14a), then token shapes (AC-14): the
 * fixed literal prefix plus a filler up to the original length.
 */
export function maskSecretsForStorage(text: string): string {
  let result = maskPemBlocks(text);
  for (const source of TOKEN_PATTERNS) {
    result = result.replace(new RegExp(source.source, 'g'), (match) => {
      const prefix = secretPrefix(match);
      return prefix + fill(match.length - prefix.length);
    });
  }
  return result;
}
