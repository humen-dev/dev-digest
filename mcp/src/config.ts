export interface McpConfig {
  apiUrl: string; // no trailing slash
  waitMs: number; // run_agent_on_pr wait budget
  pollMs: number; // run status poll interval
  requestTimeoutMs: number; // per HTTP request (listPulls/warmPull use 2x)
}

export const DEFAULT_API_URL = 'http://127.0.0.1:3001';
export const DEFAULTS = { waitMs: 55_000, pollMs: 3_000, requestTimeoutMs: 15_000 } as const;
export const LIMITS = { waitMs: [5_000, 600_000], pollMs: [500, 10_000] } as const;

function intFromEnv(raw: string | undefined, fallback: number, [min, max]: readonly [number, number]): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Env: DEVDIGEST_API_URL, DEVDIGEST_MCP_WAIT_MS, DEVDIGEST_MCP_POLL_MS. Pure; no I/O.
 *  Invalid numbers fall back to defaults; out-of-range values are clamped.
 *  A non-http(s) DEVDIGEST_API_URL throws (fail fast at startup, message to stderr). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const rawUrl = env.DEVDIGEST_API_URL?.trim() || DEFAULT_API_URL;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`DEVDIGEST_API_URL is not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`DEVDIGEST_API_URL must be http(s): ${url.origin}`);
  }
  // fetch rejects credentialed URLs, and apiUrl is echoed into tool results and
  // stderr — so never accept (or repeat) user:password here.
  if (url.username !== '' || url.password !== '') {
    throw new Error('DEVDIGEST_API_URL must not contain credentials (user:password@).');
  }
  return {
    apiUrl: `${url.origin}${url.pathname}`.replace(/\/+$/, ''),
    waitMs: intFromEnv(env.DEVDIGEST_MCP_WAIT_MS, DEFAULTS.waitMs, LIMITS.waitMs),
    pollMs: intFromEnv(env.DEVDIGEST_MCP_POLL_MS, DEFAULTS.pollMs, LIMITS.pollMs),
    requestTimeoutMs: DEFAULTS.requestTimeoutMs,
  };
}
