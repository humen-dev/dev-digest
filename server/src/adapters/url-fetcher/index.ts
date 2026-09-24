/**
 * url-fetcher adapter — downloads a remote skill file (`.md` / `.zip`) for the
 * "Import from URL" flow. The URL is user-supplied, so this is an SSRF surface:
 * only http(s), every resolved address must be public, redirects are followed
 * by hand (each hop re-validated), and the body is size- and time-capped.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ValidationError } from '../../platform/errors.js';

export interface UrlFetcher {
  fetch(url: string, maxBytes: number): Promise<{ filename: string; bytes: Buffer }>;
}

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0)
    );
  }
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]!);
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff');
}

/** GitHub "blob" page links serve HTML — rewrite them to the raw file. */
export function toRawUrl(u: URL): URL {
  if (u.hostname === 'github.com') {
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (m) return new URL(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`);
  }
  return u;
}

async function assertPublicHost(u: URL): Promise<void> {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ValidationError('Only http(s) URLs can be imported.');
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new ValidationError(`Could not resolve host "${host}".`);
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new ValidationError('URL points to a private or internal address.');
  }
}

export class HttpUrlFetcher implements UrlFetcher {
  async fetch(rawUrl: string, maxBytes: number): Promise<{ filename: string; bytes: Buffer }> {
    let u: URL;
    try {
      u = new URL(rawUrl);
    } catch {
      throw new ValidationError('Not a valid URL.');
    }
    u = toRawUrl(u);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(u);
      const res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => {
        throw new ValidationError('Could not download the URL.');
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new ValidationError('Redirect without a location.');
        u = toRawUrl(new URL(loc, u));
        continue;
      }
      if (!res.ok) throw new ValidationError(`Download failed (HTTP ${res.status}).`);
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > maxBytes) throw new ValidationError(`File is too large (${declared} > ${maxBytes} bytes).`);
      const bytes = await readCapped(res, maxBytes);
      const filename = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '') || 'skill.md';
      return { filename, bytes };
    }
    throw new ValidationError('Too many redirects.');
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ValidationError(`File is too large (> ${maxBytes} bytes).`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
