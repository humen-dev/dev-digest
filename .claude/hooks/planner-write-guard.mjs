#!/usr/bin/env node
/**
 * PreToolUse hook for the `planner` subagent (wired in .claude/agents/planner.md
 * frontmatter, NOT in settings.json) — the planner may create/edit exactly one
 * kind of file: a Markdown plan under `docs/plans/`. Everything else is denied.
 *
 * The allow-list lives here rather than in the prompt so the planner stays
 * read-only for the codebase even if it is talked into "just fixing" something.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  deny('planner-write-guard: could not parse hook input — refusing the write.');
}

const filePath = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path;
if (!filePath) deny('planner-write-guard: no file_path in tool input — refusing the write.');

const abs = path.resolve(payload.cwd ?? process.cwd(), filePath).replaceAll('\\', '/');
const inPlans = /\/docs\/plans\/[^/]+\.md$/i.test(abs);

if (!inPlans) {
  deny(
    `planner is read-only outside docs/plans/*.md — refused write to ${filePath}. ` +
      'Put this change into the plan as a work unit instead of making it.',
  );
}

process.exit(0);
