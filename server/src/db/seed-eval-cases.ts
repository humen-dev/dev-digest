import { and, asc, count, eq } from 'drizzle-orm';
import type { EvalCaseMeta, EvalExpectation } from '@devdigest/shared';
import type { Db } from './client.js';
import * as t from './schema.js';
import { parseUnifiedDiff } from '../adapters/git/diff-parser.js';
import { maskSecretsForStorage } from '../modules/_shared/secrets.js';
import {
  diffByteSize,
  expectationIntersectsHunk,
  extractFileDiff,
} from '../modules/eval/domain/frozen-input.js';
import { EVAL_MAX_FROZEN_DIFF_BYTES } from '../modules/eval/constants.js';

/**
 * SPEC-05 AC-76 (plan Q4 a) — the seven demo eval cases of the seeded
 * `Security Reviewer`, frozen from PR #482's real `pr_files.patch` hunks.
 *
 * Kept apart from the PR #482 block in `seed.ts` (which is insert-once under
 * `if (!pr)`): an existing dev DB already has that PR, so the cases must be
 * seedable on their own. The guard is "the agent has no cases yet", which also
 * keeps a user's own cases from being topped up or duplicated.
 *
 * Each case goes through the same frozen-input path as a case made from a real
 * finding: the diff of the case's file only, secret placeholders applied, and
 * the expectation must intersect a hunk of that diff.
 *
 * Demo contract (server/docs/eval-demo.md): the three `must_find` cases are the
 * real problems in PR #482. The four `must_not_flag` cases sit on clean lines;
 * the "broken prompt" of the runbook is designed to provoke the first three of
 * them (numeric config values, a test file, a documentation file). The lockfile
 * case is the control that stays clean.
 */

const SECURITY_REVIEWER = 'Security Reviewer';
const PR_NUMBER = 482;

interface SeedCase {
  name: string;
  expectation: EvalExpectation;
  severity: string | null;
  category: string | null;
  notes: string;
}

export const SEED_EVAL_CASES: readonly SeedCase[] = [
  {
    name: 'hardcoded-stripe-key-in-config',
    expectation: { type: 'must_find', file: 'src/config.ts', start_line: 12, end_line: 12 },
    severity: 'CRITICAL',
    category: 'security',
    notes: 'A live Stripe key reference is added to the config object.',
  },
  {
    name: 'rate-limit-state-in-process-memory',
    expectation: { type: 'must_find', file: 'src/middleware/ratelimit.ts', start_line: 3, end_line: 9 },
    severity: 'WARNING',
    category: 'security',
    notes: 'Buckets live in a module-level Map: never evicted, not shared across instances.',
  },
  {
    name: 'webhook-limiter-keyed-by-spoofable-ip',
    expectation: { type: 'must_find', file: 'src/api/public/webhooks.ts', start_line: 6, end_line: 8 },
    severity: 'WARNING',
    category: 'security',
    notes: 'The limiter runs on req.ip before signature verification.',
  },
  {
    name: 'config-numeric-limits-are-clean',
    expectation: { type: 'must_not_flag', file: 'src/config.ts', start_line: 4, end_line: 6 },
    severity: null,
    category: null,
    notes: 'Plain numeric and boolean settings: nothing to report here.',
  },
  {
    name: 'ratelimit-test-file-is-clean',
    expectation: { type: 'must_not_flag', file: 'src/middleware/ratelimit.test.ts', start_line: 1, end_line: 8 },
    severity: null,
    category: null,
    notes: 'A new unit test: not a security finding.',
  },
  {
    name: 'readme-rate-limiting-note-is-clean',
    expectation: { type: 'must_not_flag', file: 'README.md', start_line: 4, end_line: 6 },
    severity: null,
    category: null,
    notes: 'Documentation of the new limiter: not a security finding.',
  },
  {
    name: 'lockfile-token-bucket-entry-is-clean',
    expectation: { type: 'must_not_flag', file: 'pnpm-lock.yaml', start_line: 123, end_line: 126 },
    severity: null,
    category: null,
    notes: 'Lockfile entry for the new dependency: control case, stays clean.',
  },
];

/**
 * `seed()` inserts agents without an `agent_versions` row, so Compare would say
 * "Prompt snapshot unavailable for v1" for the first run of the demo. Records the
 * missing snapshot of the agent's current version (same shape as the agents
 * repository writes), only when the agent has no snapshot at all.
 */
async function ensureVersionSnapshot(db: Db, agent: typeof t.agents.$inferSelect): Promise<void> {
  const [known] = await db
    .select({ n: count() })
    .from(t.agentVersions)
    .where(eq(t.agentVersions.agentId, agent.id));
  if ((known?.n ?? 0) > 0) return;
  const links = await db
    .select({ skillId: t.agentSkills.skillId })
    .from(t.agentSkills)
    .where(eq(t.agentSkills.agentId, agent.id))
    .orderBy(asc(t.agentSkills.order));
  await db
    .insert(t.agentVersions)
    .values({
      agentId: agent.id,
      version: agent.version,
      configJson: {
        provider: agent.provider,
        model: agent.model,
        system_prompt: agent.systemPrompt,
        output_schema: agent.outputSchema,
        strategy: agent.strategy,
        ci_fail_on: agent.ciFailOn,
        repo_intel: agent.repoIntel,
        skills: links.map((l) => l.skillId),
      },
    })
    .onConflictDoNothing();
}

/**
 * Inserts the seven cases when the Security Reviewer has none. Returns how many
 * were inserted (0 when the guard, a missing agent or a missing PR skips it).
 * Throws when a case cannot be frozen (a seed-data bug, never a runtime path).
 */
export async function seedEvalCases(db: Db, workspaceId: string): Promise<number> {
  const [agent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, SECURITY_REVIEWER)));
  if (!agent) return 0;
  await ensureVersionSnapshot(db, agent);

  const [existing] = await db
    .select({ n: count() })
    .from(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerId, agent.id)));
  if ((existing?.n ?? 0) > 0) return 0;

  const [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.number, PR_NUMBER)));
  if (!pr) return 0;

  // The same reconstruction the container uses when there is no clone: one git-style section per patch.
  const files = await db
    .select({ path: t.prFiles.path, patch: t.prFiles.patch })
    .from(t.prFiles)
    .where(eq(t.prFiles.prId, pr.id))
    .orderBy(asc(t.prFiles.path));
  const raw = files
    .filter((f) => f.patch)
    .flatMap((f) => [`diff --git a/${f.path} b/${f.path}`, `--- a/${f.path}`, `+++ b/${f.path}`, f.patch as string])
    .join('\n');

  const meta: EvalCaseMeta = {
    pr_id: pr.id,
    pr_number: pr.number,
    title: maskSecretsForStorage(pr.title),
    body: pr.body == null ? null : maskSecretsForStorage(pr.body),
  };

  const rows = SEED_EVAL_CASES.map((c) => {
    const fileDiff = extractFileDiff(raw, c.expectation.file);
    if (fileDiff == null) throw new Error(`seed eval case "${c.name}": no diff for ${c.expectation.file}`);
    const diff = maskSecretsForStorage(fileDiff);
    if (diffByteSize(diff) > EVAL_MAX_FROZEN_DIFF_BYTES) {
      throw new Error(`seed eval case "${c.name}": frozen diff is too large`);
    }
    const parsed = parseUnifiedDiff(diff);
    if (!expectationIntersectsHunk(parsed, c.expectation)) {
      throw new Error(`seed eval case "${c.name}": expectation does not intersect a hunk`);
    }
    return {
      workspaceId,
      ownerKind: 'agent' as const,
      ownerId: agent.id,
      name: c.name,
      inputDiff: diff,
      inputFiles: parsed.files.map((f) => f.path),
      inputMeta: meta,
      expectedOutput: c.expectation,
      notes: c.notes,
      sourceFindingId: null,
      severity: c.severity,
      category: c.category,
    };
  });

  await db.insert(t.evalCases).values(rows);
  return rows.length;
}
