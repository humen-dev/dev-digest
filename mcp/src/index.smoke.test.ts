// Real stdio smoke test: spawns the launcher (bin/devdigest-mcp.mjs) as a child
// process, with the DevDigest API unreachable (a closed port), and talks to it
// over stdio via the SDK client. Verifies T6 (no startup I/O; starts with the
// API down) and T10 (stdout carries only JSON-RPC).
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TOOL_ORDER } from './domain/tool-definitions.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const LAUNCHER = path.join(REPO_ROOT, 'mcp', 'bin', 'devdigest-mcp.mjs');

/** A port that was free a moment ago and is now closed: bind port 0, read the
 *  OS-assigned port, close. Unlike a fixed port (e.g. 9, "discard"), nothing can
 *  be listening there, so the adapter gets a refused connection, not a timeout. */
async function closedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

// Tool calls hit a refused loopback connection; on Windows that is retried for
// ~2 s, so give them headroom over vitest's default.
const CALL_TIMEOUT_MS = 15_000;
let CLOSED_PORT_URL = '';

describe('index.smoke — real stdio launcher, API down', () => {
  let client: Client;
  let transport: StdioClientTransport;
  // Any non-JSON-RPC line on stdout surfaces as a transport/client error.
  const protocolErrors: Error[] = [];

  beforeAll(async () => {
    CLOSED_PORT_URL = `http://127.0.0.1:${await closedPort()}`;
    transport = new StdioClientTransport({
      command: 'node',
      args: [LAUNCHER],
      cwd: REPO_ROOT,
      env: { ...process.env, DEVDIGEST_API_URL: CLOSED_PORT_URL },
      stderr: 'pipe',
    });
    client = new Client({ name: 'smoke-test-client', version: '0.0.0' });
    client.onerror = (err) => protocolErrors.push(err);
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client?.close();
  });

  afterAll(() => {
    // stdout carried only JSON-RPC: the client never failed to parse a line.
    expect(protocolErrors).toEqual([]);
  });

  it('starts with the API down and lists the 5 tools in order', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([...TOOL_ORDER]);
  });

  it('reports api_unreachable naming ./scripts/dev.sh when the API is unreachable', async () => {
    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe('text');
    const payload = JSON.parse(content[0]!.text) as { error: string; message: string; next: string };
    expect(payload.error).toBe('api_unreachable');
    expect(payload.message).toContain(CLOSED_PORT_URL);
    expect(payload.next).toContain('./scripts/dev.sh');
  }, CALL_TIMEOUT_MS);

  it('get_blast_radius is not_implemented and makes no API call', async () => {
    const result = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'a/b', pr: 1 } });
    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    const payload = JSON.parse(content[0]!.text) as { error: string; next: string };
    expect(payload.error).toBe('not_implemented');
  }, CALL_TIMEOUT_MS);

  it('the server process stays alive after the calls above (it started with the API down)', async () => {
    // A further round-trip proves the process is still responsive.
    const { tools } = await client.listTools();
    expect(tools.length).toBe(TOOL_ORDER.length);
  });
});
