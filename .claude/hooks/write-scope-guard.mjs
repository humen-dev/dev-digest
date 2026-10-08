#!/usr/bin/env node
/**
 * PreToolUse hook (Write|Edit) for write-capable subagents — usage:
 *   node .claude/hooks/write-scope-guard.mjs <profile>   # test-writer | doc-writer | spec-creator
 *
 * Each profile may write only a fixed set of repo-relative globs. Deny globs are
 * checked first (so a broad allow like `client/src/test/**` cannot reopen
 * `setup.ts`), then allow globs; anything else is denied. The lists live here,
 * not in the agent prompt, so the agent cannot be talked into "just fixing" the
 * source it is testing or the spec it is documenting.
 */
import { deny, allow, readPayload, repoRelative } from './lib/guard-io.mjs';

const GUARD = 'write-scope-guard';

const PROFILES = {
  'test-writer': {
    allow: [
      'server/test/**/*.test.ts',
      'server/test/helpers/**/*.ts',
      'server/src/**/*.test.ts',
      'client/src/**/*.test.{ts,tsx}',
      'client/src/test/**/*.{ts,tsx}',
      'reviewer-core/test/**/*.ts',
      'e2e/specs/[0-9][0-9]-*.flow.json',
      'mcp/src/**/*.test.ts',
      'mcp/test/**/*.ts',
    ],
    deny: ['client/src/test/setup.ts', '**/src/vendor/**', 'server/src/adapters/mocks.ts', '**/*.config.*'],
    instead: 'write only test files (colocated *.test.ts(x), server/test/**, reviewer-core/test/**, e2e/specs/NN-*.flow.json); report source changes as BLOCKED instead of making them.',
  },
  'doc-writer': {
    allow: [
      'README.md',
      '{server,client,reviewer-core,e2e,mcp}/README.md',
      '{server,client,reviewer-core,e2e,mcp}/docs/**/*.md',
      'docs/adr/**/*.md',
    ],
    deny: [
      '**/specs/**',
      '**/AGENTS.md',
      '**/CLAUDE.md',
      '**/INSIGHTS.md',
      'TESTING.md',
      'docs/plans/**',
      'docs/agent-prompts/**',
      'docs/skill-*/**',
    ],
    instead: 'write only README.md files, <package>/docs/**/*.md or docs/adr/**/*.md; report spec/AGENTS/plan drift as a follow-up for its owner instead of editing it.',
  },
  'spec-creator': {
    allow: ['specs/*.md', '{client,server,reviewer-core,mcp}/specs/*.md'],
    deny: ['**/_TEMPLATE.md', 'e2e/**'],
    instead: 'write only Markdown specs directly in specs/ (cross-module) or <client|server|reviewer-core|mcp>/specs/ (one module), plus their README.md index; put code, plan or e2e changes into the spec as requirements or Open questions instead of making them.',
  },
};

const escapeRe = (s) => s.replace(/[.+^$()|\\/]/g, '\\$&');

/** Minimal glob → RegExp: `**`, `*`, `?`, `{a,b}`, `[0-9]`. Anchored, whole path. */
function globToRegExp(glob) {
  let re = '';
  let i = 0;
  let inBrace = false;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 3; } else { re += '.*'; i += 2; }
      continue;
    }
    if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else if (ch === '{') { re += '(?:'; inBrace = true; }
    else if (ch === '}' && inBrace) { re += ')'; inBrace = false; }
    else if (ch === ',' && inBrace) re += '|';
    else if (ch === '[') {
      const end = glob.indexOf(']', i);
      if (end === -1) re += '\\[';
      else { re += glob.slice(i, end + 1); i = end; }
    } else re += escapeRe(ch);
    i += 1;
  }
  return new RegExp(`^${re}$`, process.platform === 'win32' ? 'i' : '');
}

const matchesAny = (rel, globs) => globs.find((g) => globToRegExp(g).test(rel));

const profileName = process.argv[2];
const payload = readPayload(GUARD);
const profile = Object.hasOwn(PROFILES, profileName ?? '') ? PROFILES[profileName] : null;
if (!profile) deny(GUARD, `unknown profile "${profileName ?? ''}" — refusing the write (expected: ${Object.keys(PROFILES).join(' | ')}).`);

const filePath = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path;
if (!filePath) deny(GUARD, `${profileName} may not write without a file_path — refusing the write.`);

const rel = repoRelative(payload, filePath);
if (!rel) deny(GUARD, `${profileName} may not write outside the repository (${filePath}); ${profile.instead}`);

const denied = matchesAny(rel, profile.deny);
if (denied) deny(GUARD, `${profileName} may not write ${rel} (protected by "${denied}"); ${profile.instead}`);

if (!matchesAny(rel, profile.allow)) {
  deny(GUARD, `${profileName} may not write ${rel} (allowed: ${profile.allow.join(', ')}); ${profile.instead}`);
}

allow();
