/**
 * pr-self-review — Phase 1: repo invariants (DET-001…018).
 *
 * Zero LLM involvement. Every rule here is a fact about the change set, so a
 * CRITICAL from this phase is never speculative. All regex scanning runs on
 * ADDED lines only, after CRLF -> LF normalization (done in signature.mjs).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { git } from './signature.mjs';
import { finding, matchAny, matchGlob, posix } from './lib.mjs';

const MIGRATIONS = 'server/src/db/migrations';
const BASELINE = 'server/.dependency-cruiser-known-violations.json';

const SECRET_PATTERNS = [
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/, 'Anthropic API key'],
  [/\bghp_[A-Za-z0-9]{20,}/, 'GitHub personal access token'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, 'GitHub fine-grained token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\bsk-[A-Za-z0-9]{32,}/, 'OpenAI-style API key'],
];

/**
 * Every added line of every changed file, as { path, line, text }.
 *
 * Two exclusions, both about not flagging text that merely *describes* a pattern:
 * this skill's own directory is the rulebook (it necessarily contains every
 * regex it hunts for), and prose files document forbidden commands in order to
 * forbid them. Pass `{ code: true }` for rules that only make sense in source.
 */
const SELF_DIRS = ['.claude/skills/pr-self-review/', '.claude/.pr-self-review/'];
const PROSE = /\.(md|mdx|txt)$/i;
const isSelf = (path) => SELF_DIRS.some((d) => posix(path).startsWith(d));

function* addedLines(files, { code = false } = {}) {
  for (const [path, f] of files) {
    if (isSelf(path)) continue;
    if (code && PROSE.test(path)) continue;
    for (const a of f.added) yield { path, line: a.line, text: a.text };
  }
}

const pkgOf = (path) => {
  const seg = posix(path).split('/')[0];
  return ['client', 'server', 'reviewer-core', 'e2e'].includes(seg) ? seg : null;
};

/**
 * @param ctx { root, files, statuses, paths, routing, base, baseAhead, skillDirs }
 * @returns Finding[]
 */
export function runDeterministic(ctx) {
  const { root, files, statuses, paths, routing, base } = ctx;
  const out = [];
  const changed = new Set(paths);
  const add = (f) => out.push(finding({ ...f, phase: 1 }));

  /* DET-001 — lockfile hand-edited without its package.json ------------------ */
  for (const path of paths) {
    const name = posix(path).split('/').pop();
    if (name !== 'pnpm-lock.yaml' && name !== 'package-lock.json') continue;
    const sibling = posix(path).replace(/[^/]+$/, 'package.json');
    if (changed.has(sibling)) continue;
    add({
      id: 'DET-001',
      severity: 'CRITICAL',
      category: 'bug',
      title: 'Lockfile hand-edited',
      file: path,
      rationale:
        'The lockfile changed but `' + sibling + '` did not. Each package pins its own lockfile; ' +
        'hand-edits desynchronise it from the manifest and break `--frozen-lockfile` in CI.',
      suggestion: 'Revert the lockfile and change dependencies through the package manager (`pnpm add` / `npm i`) in that package.',
    });
  }

  /* DET-002 — an applied migration was modified or deleted ------------------- */
  for (const s of statuses) {
    if (!matchGlob(s.path, MIGRATIONS + '/*.sql')) continue;
    if (s.status !== 'M' && s.status !== 'D') continue;
    add({
      id: 'DET-002',
      severity: 'CRITICAL',
      category: 'bug',
      title: 'Applied migration modified',
      file: s.path,
      rationale:
        'Migrations under `' + MIGRATIONS + '/` are append-only history (status `' + s.status + '`). ' +
        'Editing one that has already run leaves every existing database in a state the files no longer describe.',
      suggestion:
        'git checkout ' + base.slice(0, 7) + ' -- ' + s.path + '\n' +
        'then `cd server && pnpm db:generate --name <change>` to add a NEW migration.',
    });
  }

  /* DET-003 — a vendored @devdigest/shared copy was edited -------------------- */
  for (const path of paths) {
    if (!matchGlob(path, '**/src/vendor/shared/**')) continue;
    add({
      id: 'DET-003',
      severity: 'CRITICAL',
      category: 'bug',
      title: 'Vendored shared contract edited in a copy',
      file: path,
      rationale:
        '`@devdigest/shared` is vendored into each package under `src/vendor/shared`. Editing a copy ' +
        'makes the packages disagree about the same contract until the next re-vendor silently reverts it.',
      suggestion: 'Edit the shared contract at its source and re-vendor, so every package moves together.',
    });
  }

  /* DET-004 — a CLAUDE.md stub grew a body ----------------------------------- */
  for (const path of paths) {
    if (posix(path).split('/').pop() !== 'CLAUDE.md') continue;
    let body = '';
    try { body = readFileSync(join(root, path), 'utf8'); } catch { continue; }
    // A stub may carry HTML comments (the repo's stubs explain themselves in one);
    // what it must not carry is prose. Strip comments, then demand the import alone.
    const bare = body.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').trim();
    if (bare === '@AGENTS.md') continue;
    add({
      id: 'DET-004',
      severity: 'CRITICAL',
      category: 'bug',
      title: 'CLAUDE.md stub given a body',
      file: path,
      rationale:
        'Every `CLAUDE.md` in this repo is a one-line stub (`@AGENTS.md`). Content placed here is invisible ' +
        'to agents reading `AGENTS.md` and becomes a second, drifting source of truth.',
      suggestion: 'Move the content into the sibling `AGENTS.md` and restore the stub to exactly `@AGENTS.md`.',
    });
  }

  /* DET-005 — the dependency-cruiser baseline grew --------------------------- */
  if (changed.has(BASELINE)) {
    const count = (text) => {
      try {
        const v = JSON.parse(text);
        return Array.isArray(v) ? v.length : (v.violations || v.modules || []).length;
      } catch { return -1; }
    };
    const before = count(git(['show', base + ':' + BASELINE], root).stdout);
    let after = -1;
    try { after = count(readFileSync(join(root, BASELINE), 'utf8')); } catch { /* removed */ }
    if (before >= 0 && after > before) {
      add({
        id: 'DET-005',
        severity: 'CRITICAL',
        category: 'bug',
        title: 'Architecture baseline grew',
        file: BASELINE,
        rationale:
          'The known-violations baseline went from ' + before + ' to ' + after + ' entries. The baseline exists to ' +
          'freeze pre-existing drift so it can only shrink; growing it buries a new layering violation instead of fixing it.',
        suggestion:
          'Fix the import direction (see the `onion-architecture` skill) instead of baselining it. ' +
          'Verify with `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known`.',
      });
    }
  }

  /* DET-006 / 007 / 008 / 012 — added-line scans ----------------------------- */
  const envAdded = statuses.filter((s) => s.status === 'A' && /(^|\/)\.env(\.|$)/.test(posix(s.path)));
  for (const s of envAdded) {
    add({
      id: 'DET-006',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Environment file added to the change set',
      file: s.path,
      kind: 'secret_leak',
      rationale: 'A `.env` file is tracked by this change. Secrets in this repo live in `~/.devdigest/secrets.json` (mode 0600), never in the working tree.',
      suggestion: 'Remove the file from the change set, add it to `.gitignore`, and rotate anything it contained.',
    });
  }

  for (const { path, line, text } of addedLines(files)) {
    for (const [re, label] of SECRET_PATTERNS) {
      if (!re.test(text)) continue;
      add({
        id: 'DET-006',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Credential in an added line (' + label + ')',
        file: path,
        startLine: line,
        kind: 'secret_leak',
        rationale: 'An added line matches the shape of a ' + label + '. Anything committed here must be treated as disclosed.',
        suggestion: 'Remove the credential, rotate it, and read it through `LocalSecretsProvider` instead.',
      });
      break;
    }

    // Prose documents this command in order to forbid it — only flag it where it runs.
    if (!PROSE.test(path) && /docker[- ]compose\s+down\s+(-\w*v|--volumes)/.test(text)) {
      add({
        id: 'DET-007',
        severity: 'CRITICAL',
        category: 'bug',
        title: 'Volume-wiping docker compose command added',
        file: path,
        startLine: line,
        rationale: '`docker compose down -v` destroys the `devdigest_pgdata` volume — every imported repo and review in the local database.',
        suggestion: 'Drop the `-v` / `--volumes` flag.',
      });
    }

    if (/^(<{7}|={7}$|>{7})/.test(text)) {
      add({
        id: 'DET-008',
        severity: 'CRITICAL',
        category: 'bug',
        title: 'Unresolved merge-conflict marker',
        file: path,
        startLine: line,
        rationale: 'An added line is a conflict marker, so the file is a half-merged state rather than source.',
        suggestion: 'Finish the merge and remove the markers.',
      });
    }

    if (
      (matchGlob(path, 'server/src/**') || matchGlob(path, 'client/src/**')) &&
      !/\.test\.(ts|tsx)$/.test(path) &&
      /(^|[^.\w])(console\.log\(|debugger\b)/.test(text)
    ) {
      add({
        id: 'DET-012',
        severity: 'WARNING',
        category: 'style',
        title: 'Debug leftover in an added line',
        file: path,
        startLine: line,
        rationale: 'A `console.log` / `debugger` was added to shipped source. The server logs through Pino; the client has no console contract.',
        suggestion: 'Remove it, or log through the module logger if the output is meant to stay.',
      });
    }
  }

  /* DET-009 / DET-010 — migration numbering and schema/migration pairing ----- */
  const newMigrations = statuses.filter((s) => s.status === 'A' && matchGlob(s.path, MIGRATIONS + '/*.sql'));
  let existing = [];
  try {
    existing = readdirSync(join(root, MIGRATIONS))
      .filter((n) => /^\d{4}_.*\.sql$/.test(n))
      .map((n) => Number(n.slice(0, 4)));
  } catch { /* no migrations dir */ }

  for (const s of newMigrations) {
    const name = posix(s.path).split('/').pop();
    const num = Number(name.slice(0, 4));
    const others = existing.filter((n) => n !== num);
    const maxOther = others.length ? Math.max(...others) : -1;
    const duplicate = existing.filter((n) => n === num).length > 1;
    if (duplicate || num > maxOther + 1) {
      add({
        id: 'DET-009',
        severity: 'CRITICAL',
        category: 'bug',
        title: duplicate ? 'Duplicate migration number' : 'Migration number skips ahead',
        file: s.path,
        rationale:
          'Migration `' + name + '` is numbered ' + num + ' while the highest other migration is ' + maxOther + '. ' +
          'Drizzle applies these in order; a duplicate or a gap makes the applied order depend on the filesystem.',
        suggestion: 'Delete the file and regenerate it with `cd server && pnpm db:generate --name <change>`.',
      });
    }
  }

  const schemaTouched = paths.filter((p) => matchGlob(p, 'server/src/db/schema/**'));
  if (schemaTouched.length && newMigrations.length === 0) {
    add({
      id: 'DET-010',
      severity: 'CRITICAL',
      category: 'bug',
      title: 'Schema changed without a migration',
      file: schemaTouched[0],
      rationale:
        schemaTouched.length + ' Drizzle schema file(s) changed but no new `' + MIGRATIONS + '/NNNN_*.sql` was added. ' +
        'Migrations are not applied on boot, so the code and every database diverge silently.',
      suggestion: 'Run `cd server && pnpm db:generate --name <change>` and commit the generated migration.',
    });
  }

  /* DET-011 — routing drift -------------------------------------------------- */
  const routedSkills = new Set();
  for (const r of routing.routes || []) for (const s of r.skills) routedSkills.add(s);
  for (const t of routing.contentTriggers || []) routedSkills.add(t.skill);
  for (const s of Object.keys(routing.excluded || {})) routedSkills.add(s);

  const addsNewSkill = paths.some((p) => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(posix(p)));
  const severity = addsNewSkill ? 'CRITICAL' : 'WARNING';

  for (const dir of ctx.skillDirs) {
    if (routedSkills.has(dir)) continue;
    add({
      id: 'DET-011',
      severity,
      category: 'style',
      title: 'Skill is not routed',
      file: '.claude/skills/pr-self-review/routing.json',
      rationale:
        'The skill `' + dir + '` exists under `.claude/skills/` but appears in neither `routes` nor `excluded`, ' +
        'so this gate will never apply it to a diff.',
      suggestion: 'Add `' + dir + '` to `routes` (with its path globs) or to `excluded` (with a reason).',
    });
  }
  for (const skill of routedSkills) {
    if (ctx.skillDirs.includes(skill)) continue;
    add({
      id: 'DET-011',
      severity: 'WARNING',
      category: 'style',
      title: 'Routing entry points at a missing skill',
      file: '.claude/skills/pr-self-review/routing.json',
      rationale: '`' + skill + '` is routed but `.claude/skills/' + skill + '/` does not exist.',
      suggestion: 'Remove the entry, or restore the skill directory.',
    });
  }

  /* DET-013 — skills-lock drift ---------------------------------------------- */
  if (changed.has('skills-lock.json') && !paths.some((p) => matchGlob(p, '.claude/skills/**'))) {
    add({
      id: 'DET-013',
      severity: 'WARNING',
      category: 'style',
      title: 'skills-lock.json changed with no skill change',
      file: 'skills-lock.json',
      rationale: 'The vendored-skill lock moved without any file under `.claude/skills/` moving with it, so the lock and the installed skills disagree.',
      suggestion: 'Re-vendor the skill so the lock and the directory match, or revert the lock change.',
    });
  }

  /* DET-014 — e2e flows changed but the gate never runs them ----------------- */
  const e2eTouched = paths.filter((p) => matchGlob(p, 'e2e/specs/*.flow.json'));
  if (e2eTouched.length) {
    add({
      id: 'DET-014',
      severity: 'WARNING',
      category: 'test',
      title: 'e2e flows changed — not exercised by this gate',
      file: e2eTouched[0],
      rationale: 'e2e flows need a live Docker + API + web stack, which is too expensive for a pre-PR gate, so they are typechecked but never run here.',
      suggestion: 'Run `./scripts/e2e.sh` before merging.',
    });
  }

  /* DET-015 — stale base ------------------------------------------------------ */
  if (ctx.baseAhead > 0) {
    add({
      id: 'DET-015',
      severity: 'WARNING',
      category: 'style',
      title: 'Base is behind origin/main',
      file: '.',
      rationale: '`origin/main` is ' + ctx.baseAhead + ' commit(s) ahead of the merge-base, so this review does not see changes the PR will merge against.',
      suggestion: 'Run `git fetch origin main` and re-run. (The gate never fetches by itself.)',
    });
  }

  /* DET-016 — new logic with no test in the same change set ------------------ */
  const needsTest = paths.filter(
    (p) =>
      matchGlob(p, 'server/src/modules/*/service.ts') ||
      matchGlob(p, 'server/src/modules/*/repository.ts') ||
      matchGlob(p, 'client/src/**/_components/**/index.tsx'),
  );
  const testsInDiff = paths.filter((p) => /\.test\.(ts|tsx)$/.test(posix(p)));
  if (needsTest.length && testsInDiff.length === 0) {
    add({
      id: 'DET-016',
      severity: 'WARNING',
      category: 'test',
      title: 'New or changed logic with no test in this change set',
      file: needsTest[0],
      rationale: needsTest.length + ' file(s) holding business logic changed, but no `*.test.ts(x)` changed with them.',
      suggestion: 'Add or extend a colocated test. See `TESTING.md` for which layer gets which kind of test.',
    });
  }

  /* DET-017 — i18n drift ------------------------------------------------------ */
  const messagesTouched = paths.some((p) => matchGlob(p, 'client/messages/**/*.json'));
  if (!messagesTouched) {
    for (const { path, line, text } of addedLines(files)) {
      if (!matchGlob(path, 'client/src/**')) continue;
      if (!/\bt\(['"`][\w.-]+['"`]/.test(text)) continue;
      add({
        id: 'DET-017',
        severity: 'WARNING',
        category: 'bug',
        title: 'New i18n key with no message-catalogue change',
        file: path,
        startLine: line,
        rationale: 'An added line looks up a translation key, but nothing under `client/messages/<locale>/` changed, so the key will render as its own id.',
        suggestion: 'Add the key to the matching `client/messages/<locale>/<namespace>.json`.',
      });
      break;
    }
  }

  /* DET-018 — diff too large for a reliable review --------------------------- */
  const limits = (routing.gate || {}).largeDiff || { files: 60, lines: 2000 };
  let churn = 0;
  for (const [, f] of files) churn += f.addedCount + f.removedCount;
  if (paths.length > limits.files || churn > limits.lines) {
    add({
      id: 'DET-018',
      severity: 'WARNING',
      category: 'style',
      title: 'Change set is large',
      file: '.',
      rationale:
        paths.length + ' files / ' + churn + ' changed lines exceeds the ' + limits.files + ' / ' + limits.lines +
        ' threshold. Phase-3 coverage degrades past this size because each bundle gets split and reduced.',
      suggestion: 'Split the work into separate PRs if it is separable.',
    });
  }

  return out;
}

export function listSkillDirs(root) {
  const dir = join(root, '.claude', 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();
}

export { matchAny };
