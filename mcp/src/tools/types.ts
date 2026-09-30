// src/tools/types.ts — ring 2: the use-case calling convention. Result shapes live in domain/types.ts.
import type { DevDigestApi } from '../ports.js';
import type { McpConfig } from '../config.js';
import type { ToolArgs, ToolName } from '../domain/tool-definitions.js';

export interface ToolContext {
  api: DevDigestApi;
  config: McpConfig;
  /** No-op when the client sent no progressToken. Never throws. */
  progress(p: { progress: number; total?: number; message?: string }): Promise<void>;
  signal: AbortSignal;
  log(msg: string, data?: Record<string, unknown>): void; // stderr
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

/** Returns a JSON-serialisable success payload; throws ToolError for any failure the agent should see. */
export type ToolHandler<N extends ToolName> = (args: ToolArgs[N], ctx: ToolContext) => Promise<unknown>;
export type ToolHandlers = { [N in ToolName]: ToolHandler<N> };
