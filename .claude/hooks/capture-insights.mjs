#!/usr/bin/env node
/**
 * Stop hook — enforces the engineering-insights Session Protocol automatically.
 *
 * It blocks a stop and hands Claude the capture reminder ONLY when module code
 * (client / server / reviewer-core / e2e / mcp, excluding the INSIGHTS.md files
 * themselves) changed since the last reminder in this session. Stops after pure
 * questions, reviews or research — nothing touched — pass silently, so the
 * protocol no longer costs an extra turn after every answer.
 *
 * Change detection = a fingerprint of (last commit touching the modules, the
 * uncommitted module diff, untracked module files), stored per session in
 * `.claude/.insights-state/<session>.json` (gitignored). On the first stop of a
 * session it reminds only if module files are uncommitted.
 *
 * Guarded by `stop_hook_active` so it never loops. Any git failure → allow the
 * stop (never block on a broken environment).
 *
 * Reads the hook payload as JSON on stdin; emits a Stop-hook JSON decision.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODULES = ["client", "server", "reviewer-core", "e2e", "mcp"];
const PATHSPEC = ["--", ...MODULES, ":(exclude,glob)**/INSIGHTS.md"];

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  /* no/invalid stdin → treat as empty */
}

// Already continuing from this hook → allow the stop (prevents an infinite loop).
if (payload.stop_hook_active) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
const git = (args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

let fingerprint;
let dirty;
try {
  const lastCommit = git(["log", "-1", "--format=%H", ...PATHSPEC]).trim();
  const diff = git(["diff", "HEAD", "--no-color", ...PATHSPEC]);
  const untracked = git(["ls-files", "--others", "--exclude-standard", ...PATHSPEC]);
  dirty = diff.length > 0 || untracked.trim().length > 0;
  fingerprint = createHash("sha256").update(lastCommit).update("\0").update(diff).update("\0").update(untracked).digest("hex");
} catch {
  process.exit(0);
}

const stateDir = join(root, ".claude", ".insights-state");
const session = String(payload.session_id || "default").replace(/[^\w.-]/g, "_");
const stateFile = join(stateDir, `${session}.json`);

let previous = null;
try {
  previous = JSON.parse(readFileSync(stateFile, "utf8")).fingerprint ?? null;
} catch {
  /* first stop of this session */
}

const changed = previous === null ? dirty : previous !== fingerprint;

try {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ fingerprint, at: new Date().toISOString() }));
} catch {
  /* state is best-effort; worst case we remind again next stop */
}

if (!changed) process.exit(0);

const reason =
  "Session Protocol (engineering-insights): module code changed since the last check. " +
  "Decide if this produced a substantial, non-obvious learning for a module you touched " +
  "(client / server / reviewer-core / e2e). If so, append it to THAT module's " +
  "INSIGHTS.md via the engineering-insights skill — one bullet under the right " +
  "section, newest on top, with file:line evidence and today's date, APPEND-ONLY " +
  "(re-read the file first; never rewrite or duplicate an existing entry). " +
  "If nothing substantial and new surfaced, stop without writing.";

process.stdout.write(JSON.stringify({ decision: "block", reason }));
process.exit(0);
