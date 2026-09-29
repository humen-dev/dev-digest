// Real stdio smoke test: spawns the launcher (bin/devdigest-mcp.mjs) as a child
// process, with the DevDigest API unusable, and talks to it over stdio via the
// SDK client. Verifies T6 (no startup I/O; starts with the API down) and T10
// (stdout carries only JSON-RPC).
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

/** A "dead" API: a port we keep bound for the whole suite (so no other process
 *  can take it) that destroys every connection at once — the adapter sees a
 *  reset, never a response. It also counts connections, so a test can prove a
 *  tool made no API call at all. */
interface DeadApi { url: string; connections(): number; close(): Promise<void> }

async function startDeadApi(): Promise<DeadApi> {
  let count = 0;
  const server = net.createServer((socket) => {
    count += 1;
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    connections: () => count,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// Tool calls go through a failing loopback connection; give them headroom.
const CALL_TIMEOUT_MS = 15_000;

describe('index.smoke — real stdio launcher, API down', () => {
  let deadApi: DeadApi;
  let client: Client;
  let transport: StdioClientTransport;
  // Any non-JSON-RPC line on stdout surfaces as a transport/client error.
  const protocolErrors: Error[] = [];
  // The launcher's stderr (logs, startup crashes) — shown when something fails.
  const stderrChunks: string[] = [];
  const childStderr = () => stderrChunks.join('').slice(-4_000);

  beforeAll(async () => {
    deadApi = await startDeadApi();
    transport = new StdioClientTransport({
      command: 'node',
      args: [LAUNCHER],
      cwd: REPO_ROOT,
      env: { ...process.env, DEVDIGEST_API_URL: deadApi.url },
      stderr: 'pipe',
    });
    transport.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk.toString('utf8')));
    client = new Client({ name: 'smoke-test-client', version: '0.0.0' });
    client.onerror = (err) => protocolErrors.push(err);
    try {
      await client.connect(transport);
    } catch (err) {
      throw new Error(`launcher failed to start: ${String(err)}\n--- child stderr ---\n${childStderr()}`);
    }
  }, 30_000);

  afterAll(async () => {
    try {
      // stdout carried only JSON-RPC: the client never failed to parse a line.
      expect(protocolErrors, `client errors; child stderr:\n${childStderr()}`).toEqual([]);
    } finally {
      // Always stop the child and the dead API, even when the assertion fails.
      await client?.close();
      await deadApi?.close();
    }
  });

  it('starts with the API down and lists the 5 tools in order', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([...TOOL_ORDER]);
    expect(deadApi.connections()).toBe(0); // no API I/O at startup or on tools/list
  });

  it('reports api_unreachable naming ./scripts/dev.sh when the API is unreachable', async () => {
    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe('text');
    const payload = JSON.parse(content[0]!.text) as { error: string; message: string; next: string };
    expect(payload.error, childStderr()).toBe('api_unreachable');
    expect(payload.message).toContain(deadApi.url);
    expect(payload.next).toContain('./scripts/dev.sh');
    expect(deadApi.connections()).toBeGreaterThan(0); // it really tried the API
  }, CALL_TIMEOUT_MS);

  it('get_blast_radius reaches the API (api_unreachable when it is down)', async () => {
    const before = deadApi.connections();
    const result = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'a/b', pr: 1 } });
    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    const payload = JSON.parse(content[0]!.text) as { error: string; next: string };
    expect(payload.error).toBe('api_unreachable');
    expect(deadApi.connections()).toBeGreaterThan(before); // it really tried the API
  }, CALL_TIMEOUT_MS);

  it('the server process stays alive after the calls above (it started with the API down)', async () => {
    // A further round-trip proves the process is still responsive.
    const { tools } = await client.listTools();
    expect(tools.length).toBe(TOOL_ORDER.length);
  });
});
