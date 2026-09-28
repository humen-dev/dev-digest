// src/index.ts — ring 4: composition root. The only file (besides server.ts) that
// imports the MCP SDK, and the only file that constructs HttpDevDigestApi.

// First statement: stdout is protocol-only. Redirect stray console output to
// stderr before anything else (including imports below) can run any code.
console.log = console.error;
console.info = console.error;

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadConfig, type McpConfig } from './config.js';
import { HttpDevDigestApi } from './api/http-client.js';
import { createServer, stderrLogger } from './server.js';
import { listAgents } from './tools/list-agents.js';
import { runAgentOnPr } from './tools/run-agent-on-pr.js';
import { getFindings } from './tools/get-findings.js';
import { getConventions } from './tools/get-conventions.js';
import { getBlastRadius } from './tools/get-blast-radius.js';
import type { ToolHandlers } from './tools/types.js';

const log = stderrLogger();

let config: McpConfig;
try {
  config = loadConfig();
} catch (err) {
  process.stderr.write(`[devdigest-mcp] failed to load config: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

const api = new HttpDevDigestApi(config, fetch, log);

const handlers: ToolHandlers = {
  list_agents: listAgents,
  run_agent_on_pr: runAgentOnPr,
  get_findings: getFindings,
  get_conventions: getConventions,
  get_blast_radius: getBlastRadius,
};

const server = createServer({ config, api, handlers, log });

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  // No API call is made above: startup never touches the network.
  process.stderr.write(`devdigest-mcp ready (API ${config.apiUrl})\n`);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close().finally(() => process.exit(0));
  });
}

main().catch((err) => {
  process.stderr.write(`[devdigest-mcp] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
