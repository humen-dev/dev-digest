#!/usr/bin/env node
/**
 * PreToolUse hook — blocks `gh pr create` until a green self-review exists for
 * the CURRENT change set.
 *
 * `matcher` in settings.json only narrows to the Bash tool, so the command
 * discrimination happens here. This runs on EVERY Bash call, so the cheap string
 * prefilter comes before anything that spawns git.
 *
 * Deliberate override: prefix the command with `PR_SELF_REVIEW_BYPASS=1`.
 * It is read from the command text, not the environment, so it has to be typed
 * each time and stays visible in the transcript.
 */
import { readFileSync } from 'node:fs';
import { currentSignature, readState, repoRoot, short } from '../skills/pr-self-review/scripts/signature.mjs';

const TTL_MS = 4 * 60 * 60 * 1000;

const allow = () => process.exit(0);

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

function note(message) {
  process.stdout.write(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}

/** Split a shell command into segments that each start a new command. */
function segments(command) {
  return command.split(/&&|\|\||;|\||\n/g).map((s) => s.trim()).filter(Boolean);
}

/** Whitespace tokenizer that keeps quoted runs together. */
function tokenize(segment) {
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

/**
 * True only for `gh pr create`. `gh pr view|list|checkout|diff|status|edit|
 * comment|merge|ready|close` all fall through, and a `gh pr create` sitting
 * inside a commit message is never tokenized as a command.
 */
function matchesGhPrCreate(tokens) {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i += 1;
  if (tokens[i] !== 'gh') return false;
  const rest = tokens.slice(i + 1).filter((t) => !t.startsWith('-'));
  return rest[0] === 'pr' && rest[1] === 'create';
}

const hasBypass = (tokens) => tokens.some((t) => t === 'PR_SELF_REVIEW_BYPASS=1');

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  allow();
}

if (payload.tool_name !== 'Bash') allow();
const command = String((payload.tool_input && payload.tool_input.command) || '');

// Cheap prefilter: this must not touch git on the overwhelming majority of calls.
if (!command.includes('gh')) allow();

const matched = segments(command).map(tokenize).find(matchesGhPrCreate);
if (!matched) allow();

if (hasBypass(matched)) {
  note(
    'PR self-review gate bypassed with PR_SELF_REVIEW_BYPASS=1. The PR is being opened without a green local review.',
  );
}

let root;
let fresh;
try {
  root = repoRoot();
  fresh = currentSignature(root);
} catch (err) {
  // A gate that cannot verify must not silently open.
  deny('PR self-review gate: could not inspect the working tree (' + String(err && err.message) + '). Run /pr-self-review, or override with PR_SELF_REVIEW_BYPASS=1.');
}

const state = readState(root);
const sig = short(fresh.signature);

if (!state || state.version !== 1) {
  deny(
    'PR self-review gate: no self-review has been run for these changes (signature ' + sig + '). ' +
      'Run /pr-self-review, resolve every CRITICAL, then retry. Deliberate override: prefix the command with PR_SELF_REVIEW_BYPASS=1.',
  );
}

if (state.signature !== fresh.signature) {
  deny(
    'PR self-review gate: the last green review was for signature ' + short(state.signature) + ', but the changes are now ' + sig +
      ' (a new commit, an edit in the working tree, or a moved base). Re-run /pr-self-review. Override: PR_SELF_REVIEW_BYPASS=1.',
  );
}

if (state.incomplete) {
  deny(
    'PR self-review gate: the last run for ' + sig + ' was incomplete (' + state.incomplete + '), so it was never sealed. ' +
      'Re-run /pr-self-review in full. Override: PR_SELF_REVIEW_BYPASS=1.',
  );
}

if (state.verdict === 'request_changes') {
  deny(
    'PR self-review gate: the last run for ' + sig + ' returned request_changes with ' + state.criticals +
      ' CRITICAL finding(s). See .claude/.pr-self-review/last-report.md, fix them, then re-run /pr-self-review. Override: PR_SELF_REVIEW_BYPASS=1.',
  );
}

if (Date.now() - Date.parse(state.sealedAt) > TTL_MS) {
  deny(
    'PR self-review gate: the green review for ' + sig + ' is older than 4h (' + state.sealedAt + '). Re-run /pr-self-review. Override: PR_SELF_REVIEW_BYPASS=1.',
  );
}

allow();
