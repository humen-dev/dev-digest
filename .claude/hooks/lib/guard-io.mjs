/**
 * Shared I/O for the scope-guard PreToolUse hooks (write-scope-guard,
 * bash-scope-guard). Wired per subagent in `.claude/agents/*.md` frontmatter.
 *
 * Every helper here is fail-closed: anything the guard cannot read or resolve
 * becomes a deny, never an allow. A guard that silently opens on bad input is
 * worse than no guard, because the agent's prompt assumes it holds.
 *
 * `segments()` / `tokenize()` are copied from `pr-gate.mjs` on purpose — the
 * gate is a standalone script and must stay importable-free.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Emit a PreToolUse deny decision and stop. Exit 0: the JSON carries the verdict. */
export function deny(guard, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `${guard}: ${reason}`,
      },
    }),
  );
  process.exit(0);
}

/** Allow = exit 0 with no stdout. */
export function allow() {
  process.exit(0);
}

/** Read the hook payload from stdin; empty or unparsable input is a deny. */
export function readPayload(guard) {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    deny(guard, 'could not read hook input — refusing the call.');
  }
  if (!raw.trim()) deny(guard, 'empty hook input — refusing the call.');
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    deny(guard, 'could not parse hook input — refusing the call.');
  }
  if (!payload || typeof payload !== 'object') deny(guard, 'hook input is not an object — refusing the call.');
  return payload;
}

/** Repo root: $CLAUDE_PROJECT_DIR, else the payload cwd, else the process cwd. */
export function repoRoot(payload) {
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd());
}

/**
 * Repo-relative path with `/` separators, or `null` when `p` escapes the root.
 * Backslashes are normalized first so Windows-style input behaves the same on
 * every platform.
 */
export function repoRelative(payload, p) {
  const root = repoRoot(payload);
  const base = payload.cwd ? path.resolve(root, String(payload.cwd).replaceAll('\\', '/')) : root;
  const abs = path.resolve(base, String(p).replaceAll('\\', '/'));
  const rel = path.relative(root, abs).replaceAll('\\', '/');
  if (!rel || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) return null;
  return rel;
}

/** Split a shell command into segments that each start a new command. */
export function segments(command) {
  return command.split(/&&|\|\||;|\||\n/g).map((s) => s.trim()).filter(Boolean);
}

/** Whitespace tokenizer that keeps quoted runs together. */
export function tokenize(segment) {
  const tokens = [];
  let cur = '';
  let quote = null;
  for (const ch of segment) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (/\s/.test(ch)) {
      if (cur) { tokens.push(cur); cur = ''; }
      continue;
    }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}
