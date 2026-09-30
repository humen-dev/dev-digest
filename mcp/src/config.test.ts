import { describe, expect, it } from 'vitest';
import { DEFAULT_API_URL, DEFAULTS, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('defaults to the IPv4 loopback API and the default budgets', () => {
    expect(loadConfig({})).toEqual({ apiUrl: DEFAULT_API_URL, ...DEFAULTS });
  });

  it('keeps a path prefix, drops a trailing slash, query and hash', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://h:3001/api/?x=1#y' }).apiUrl).toBe('http://h:3001/api');
  });

  it('rejects credentials in the URL without echoing them', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'http://user:s3cret@h:3001' })).toThrow(/credentials/);
    try {
      loadConfig({ DEVDIGEST_API_URL: 'http://user:s3cret@h:3001' });
    } catch (err) {
      expect(String(err)).not.toContain('s3cret');
    }
  });

  it('rejects non-http(s) URLs and clamps the wait budget', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'file:///etc/passwd' })).toThrow(/http\(s\)/);
    expect(loadConfig({ DEVDIGEST_MCP_WAIT_MS: '1' }).waitMs).toBe(5_000);
  });
});
