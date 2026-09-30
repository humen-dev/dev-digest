// src/server.ts — ring 4: the only file (besides index.ts) that imports the MCP SDK.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolResult, ServerNotification, ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';

import { toErrorPayload, ToolError } from './errors.js';
import {
  INPUT_SHAPES, INSTRUCTIONS, SERVER_NAME, SERVER_VERSION, TOOL_META, TOOL_ORDER,
  type ToolArgs, type ToolName,
} from './domain/tool-definitions.js';
import type { McpConfig } from './config.js';
import type { DevDigestApi } from './ports.js';
import type { ToolContext, ToolHandler, ToolHandlers } from './tools/types.js';

export type LogFn = (msg: string, data?: Record<string, unknown>) => void;

/** Writes `[devdigest-mcp] <msg> <json>` to stderr. Never touches stdout. */
export function stderrLogger(prefix = '[devdigest-mcp]'): LogFn {
  return (msg, data) => {
    const suffix = data === undefined ? '' : ` ${JSON.stringify(data)}`;
    process.stderr.write(`${prefix} ${msg}${suffix}\n`);
  };
}

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

interface ServerDeps {
  config: McpConfig;
  api: DevDigestApi;
  handlers: ToolHandlers;
  log?: LogFn;
}

/** Abortable sleep: rejects when `signal` aborts before `ms` elapses. */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function buildContext(deps: ServerDeps, extra: Extra, log: LogFn): ToolContext {
  return {
    // Bind the call's cancellation signal so in-flight HTTP requests abort too.
    api: deps.api.withSignal ? deps.api.withSignal(extra.signal) : deps.api,
    config: deps.config,
    signal: extra.signal,
    log,
    now: () => Date.now(),
    sleep: (ms, signal) => abortableSleep(ms, signal),
    async progress(p) {
      const progressToken = extra._meta?.progressToken;
      if (progressToken === undefined) return;
      try {
        await extra.sendNotification({
          method: 'notifications/progress',
          params: { progressToken, ...p },
        });
      } catch {
        // Best-effort only: the client may have gone away.
      }
    },
  };
}

async function runTool<N extends ToolName>(
  name: N,
  args: ToolArgs[N],
  extra: Extra,
  deps: ServerDeps,
  log: LogFn,
): Promise<CallToolResult> {
  const ctx = buildContext(deps, extra, log);
  try {
    const handler = deps.handlers[name] as ToolHandler<N>;
    const result = await handler(args, ctx);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    if (!(err instanceof ToolError)) {
      log('unexpected tool error', {
        tool: name,
        stack: err instanceof Error ? err.stack ?? err.message : String(err),
      });
    }
    const payload = toErrorPayload(err, deps.config.apiUrl);
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(payload) }] };
  }
}

/** Builds the MCP server: registers the five tools of TOOL_ORDER, in order, with no resources/prompts. */
export function createServer(deps: {
  config: McpConfig;
  api: DevDigestApi;
  handlers: ToolHandlers;
  log?: LogFn;
}): McpServer {
  const log = deps.log ?? stderrLogger();
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  for (const name of TOOL_ORDER) {
    // Each case calls registerTool with a literal tool name so the SDK's generic
    // overload resolves to that tool's concrete input shape (a generic helper over
    // ToolName instead causes "Type instantiation is excessively deep").
    switch (name) {
      case 'list_agents': {
        const meta = TOOL_META[name];
        server.registerTool(
          name,
          { title: meta.title, description: meta.description, inputSchema: INPUT_SHAPES[name], annotations: meta.annotations },
          async (args, extra) => runTool(name, args as ToolArgs['list_agents'], extra, deps, log),
        );
        break;
      }
      case 'run_agent_on_pr': {
        const meta = TOOL_META[name];
        server.registerTool(
          name,
          { title: meta.title, description: meta.description, inputSchema: INPUT_SHAPES[name], annotations: meta.annotations },
          async (args, extra) => runTool(name, args as ToolArgs['run_agent_on_pr'], extra, deps, log),
        );
        break;
      }
      case 'get_findings': {
        const meta = TOOL_META[name];
        server.registerTool(
          name,
          { title: meta.title, description: meta.description, inputSchema: INPUT_SHAPES[name], annotations: meta.annotations },
          async (args, extra) => runTool(name, args as ToolArgs['get_findings'], extra, deps, log),
        );
        break;
      }
      case 'get_conventions': {
        const meta = TOOL_META[name];
        server.registerTool(
          name,
          { title: meta.title, description: meta.description, inputSchema: INPUT_SHAPES[name], annotations: meta.annotations },
          async (args, extra) => runTool(name, args as ToolArgs['get_conventions'], extra, deps, log),
        );
        break;
      }
      case 'get_blast_radius': {
        const meta = TOOL_META[name];
        server.registerTool(
          name,
          { title: meta.title, description: meta.description, inputSchema: INPUT_SHAPES[name], annotations: meta.annotations },
          async (args, extra) => runTool(name, args as ToolArgs['get_blast_radius'], extra, deps, log),
        );
        break;
      }
    }
  }

  return server;
}
