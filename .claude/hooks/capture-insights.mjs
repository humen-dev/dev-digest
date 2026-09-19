#!/usr/bin/env node
/**
 * Stop hook — enforces the engineering-insights Session Protocol automatically.
 *
 * At the end of a session it blocks the stop ONCE (guarded by `stop_hook_active`
 * so it never loops) and hands Claude a reminder to capture any substantial,
 * non-obvious learning into the touched module's INSIGHTS.md. If nothing new
 * surfaced, Claude just stops.
 *
 * Reads the hook payload as JSON on stdin; emits a Stop-hook JSON decision.
 */
import { readFileSync } from "node:fs";

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  /* no/invalid stdin → treat as empty */
}

// Already continuing from this hook → allow the stop (prevents an infinite loop).
if (payload.stop_hook_active) process.exit(0);

const reason =
  "Session Protocol (engineering-insights): before you stop, decide if this session " +
  "produced a substantial, non-obvious learning for a module you touched " +
  "(client / server / reviewer-core / e2e). If so, append it to THAT module's " +
  "INSIGHTS.md via the engineering-insights skill — one bullet under the right " +
  "section, newest on top, with file:line evidence and today's date, APPEND-ONLY " +
  "(re-read the file first; never rewrite or duplicate an existing entry). " +
  "If nothing substantial and new surfaced, stop without writing.";

process.stdout.write(JSON.stringify({ decision: "block", reason }));
process.exit(0);
