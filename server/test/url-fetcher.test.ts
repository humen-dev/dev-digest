import { describe, it, expect } from 'vitest';
import { HttpUrlFetcher, isPrivateAddress, toRawUrl } from '../src/adapters/url-fetcher/index.js';

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])(
    'blocks %s',
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111'])('allows %s', (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe('toRawUrl', () => {
  it('rewrites GitHub blob links to raw.githubusercontent.com', () => {
    expect(toRawUrl(new URL('https://github.com/o/r/blob/main/skills/a.md')).href).toBe(
      'https://raw.githubusercontent.com/o/r/main/skills/a.md',
    );
  });
  it('leaves other URLs alone', () => {
    expect(toRawUrl(new URL('https://example.com/a.md')).href).toBe('https://example.com/a.md');
  });
});

describe('HttpUrlFetcher guards', () => {
  const f = new HttpUrlFetcher();
  it('rejects non-http schemes', async () => {
    await expect(f.fetch('file:///etc/passwd', 1000)).rejects.toThrow(/http/);
  });
  it('rejects loopback / metadata addresses without fetching', async () => {
    await expect(f.fetch('http://127.0.0.1:3001/skills', 1000)).rejects.toThrow(/private/);
    await expect(f.fetch('http://169.254.169.254/latest/meta-data', 1000)).rejects.toThrow(/private/);
    await expect(f.fetch('http://[::1]/x', 1000)).rejects.toThrow(/private/);
  });
  it('rejects malformed URLs', async () => {
    await expect(f.fetch('not a url', 1000)).rejects.toThrow(/valid URL/);
  });
});
