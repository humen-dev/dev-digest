import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
} from './seed-prompts.js';

/**
 * Bodies for the three skills seeded onto the Test Quality Reviewer (L02
 * "Skills" feature). Kept here rather than in `seed-prompts.ts` because they
 * are skill bodies, not agent system prompts — nothing outside this file
 * mirrors them (unlike the reviewer prompts, which have human-readable
 * originals under `docs/agent-prompts/`).
 *
 * A fourth skill, `flaky-test-patterns`, is deliberately NOT seeded here — it
 * exists only as an import-demo fixture under `docs/skill-fixtures/` so the
 * import-preview flow has something live to import during the demo.
 */
const UNCOVERED_BRANCH_GATE_SKILL = `## Branch coverage gate

Every new or changed branch introduced by this diff — an \`if\`/\`else\` arm, a
\`catch\` block, an early \`return\`, a \`switch\`/\`case\`, or a ternary's untaken
side — must be exercised by at least one test in the diff.

For each branch that has NO test reaching it:
- Flag it as a finding citing the branch's exact \`file:line\`.
- State which branch is untested (e.g. "the \`expedited === true\` arm of
  \`refundFee\` at \`src/services/refundFees.ts:6\` has no test").
- Severity is at least WARNING; use CRITICAL when the untested branch changes
  the function's return value or triggers an external effect (write, network
  call, thrown error).

Do not flag branches that existed before this diff and were not touched.`;

const CORNER_CASE_CHECKLIST_SKILL = `## Corner-case checklist

For every new or changed function in the diff, check whether its tests cover
the inputs that most often hide bugs. Walk this checklist and flag any item
that plausibly applies to the changed function but has no test:

- Empty input (empty string, empty array/object, empty collection).
- Zero and negative numbers, where the domain allows them.
- The boundary values of any range or limit the code checks (\`>=\` vs \`>\`, the
  first/last page, the max array length).
- Unicode / non-ASCII text where the code parses, slices, or compares strings.
- Timezone and DST edges where the code handles dates or timestamps.
- Concurrency: two callers racing on the same resource, where the code is not
  obviously single-threaded-safe.

Only flag items that are plausible for the specific function under review —
do not list the whole checklist against every diff. Cite the missing case and
the function's \`file:line\`.`;

const MOCK_OVERUSE_GATE_SKILL = `## Mock overuse gate

Flag a test as a finding when it does either of the following:

- **Mocks the unit under test.** The test replaces the very function, method,
  or module the PR is supposed to verify with a mock/stub/spy, so the test
  exercises the mock's behaviour instead of the real implementation.
- **Asserts on the mock instead of on behaviour.** The test's assertions check
  that a mock was called with certain arguments (\`toHaveBeenCalledWith\`, spy
  call counts) but never check the resulting output, state, or side effect the
  caller actually depends on.

A legitimate mock of a genuine external boundary (network, filesystem, clock,
a different module entirely) is fine and should not be flagged. Cite the
offending test's \`file:line\` and name which of the two patterns applies.`;

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, PR #483 (a control-experiment fixture for the Test
 * Quality Reviewer — see below), and the four built-in agents (General +
 * Security + Performance + Test Quality), all on the default
 * openrouter/deepseek-v4-flash provider+model.
 *
 * L02 ("Skills"): the Test Quality Reviewer agent gets three skills linked in
 * order (`uncovered-branch-gate`, `corner-case-checklist`, `mock-overuse-gate`).
 * A fourth skill, `flaky-test-patterns`, is intentionally NOT seeded — it lives
 * as an import-demo fixture under `docs/skill-fixtures/` instead.
 *
 * L02 ("Conventions"): payments-api gets three accepted conventions + one past
 * scan row, so the Conventions board renders without a clone.
 *
 * Course lessons populate the other tables (memory, eval, …) once their
 * features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- PR #483 (control-experiment fixture for the Test Quality Reviewer) --
  // Adds `refundFee()` with two branches (expedited / not) but a test that
  // covers ONLY the happy (non-expedited) path — no branch/edge-case test.
  // Expected A/B result (run manually, not asserted here): with the three
  // skills below disabled, Test Quality Reviewer has nothing to flag about
  // coverage; with them enabled, it flags the untested `expedited` branch
  // plus a missing edge case (e.g. amountCents <= 0). Toggling is done via
  // the skill's `enabled` flag — the agent's system prompt never changes —
  // so the experiment isolates the skills' effect. See
  // docs/agent-prompts/test-quality-reviewer.md.
  let [refundFeePr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 483)));
  if (!refundFeePr) {
    [refundFeePr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 483,
        title: 'Add refund fee calculation for expedited refunds',
        author: 'dana.oyelaran',
        branch: 'feat/refund-fee-expedited',
        base: 'main',
        headSha: 'f7e6d5c4b3a2',
        additions: 13,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
        body: 'Adds refundFee() with an expedited-refund surcharge branch.',
      })
      .returning();

    await db.insert(t.prFiles).values([
      {
        prId: refundFeePr!.id,
        path: 'src/services/refundFees.ts',
        additions: 7,
        deletions: 0,
        patch: `@@ -1,3 +1,10 @@
 export function baseFee(amountCents: number): number {
   return Math.round(amountCents * 0.01);
 }
+
+export function refundFee(amountCents: number, expedited: boolean): number {
+  if (expedited) {
+    return Math.round(amountCents * 0.05);
+  }
+  return Math.round(amountCents * 0.02);
+}`,
      },
      {
        prId: refundFeePr!.id,
        path: 'src/services/refundFees.test.ts',
        additions: 6,
        deletions: 0,
        patch: `@@ -6,4 +6,10 @@
   it('computes the 1% base fee', () => {
     expect(baseFee(10000)).toBe(100);
   });
 });
+
+describe('refundFee', () => {
+  it('computes the standard 2% fee for a non-expedited refund', () => {
+    expect(refundFee(10000, false)).toBe(200);
+  });
+});`,
      },
    ]);

    await db.insert(t.prCommits).values({
      prId: refundFeePr!.id,
      sha: 'f7e6d5c4b3a2',
      message: 'Add refundFee() with expedited surcharge',
      author: 'dana.oyelaran',
    });
  }

  // ---- built-in agents (the four starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Judges whether the diff\'s tests adequately cover the diff\'s code.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- Test Quality Reviewer skills (L02 "Skills" feature) -----------------
  // Three skills linked to the agent in this order. Only the `body` on a
  // fresh `skills` row also seeds `skill_versions` v1 — matches the "editing
  // the body bumps the version" contract the skills module owns.
  const [testQualityAgent] = await db
    .select({ id: t.agents.id })
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')));

  if (testQualityAgent) {
    const seedSkills: Array<typeof t.skills.$inferInsert> = [
      {
        workspaceId,
        name: 'uncovered-branch-gate',
        description:
          'Require a test for every new branch (if/else, catch, early return) introduced in the diff.',
        type: 'rubric',
        source: 'manual',
        body: UNCOVERED_BRANCH_GATE_SKILL,
        enabled: true,
        version: 1,
      },
      {
        workspaceId,
        name: 'corner-case-checklist',
        description:
          'Check new/changed functions against commonly-missed edge cases (empty, zero, negative, boundary, Unicode, timezone, concurrency).',
        type: 'rubric',
        source: 'manual',
        body: CORNER_CASE_CHECKLIST_SKILL,
        enabled: true,
        version: 1,
      },
      {
        // The one skill seeded with source 'extracted': it plausibly comes
        // from the team's existing test-review conventions rather than being
        // hand-authored for this workspace — so the badge in the skills list
        // shows all four `source` values across the seed data.
        workspaceId,
        name: 'mock-overuse-gate',
        description:
          'Flag tests that mock the unit under test or assert on mock calls instead of real behaviour.',
        type: 'convention',
        source: 'extracted',
        body: MOCK_OVERUSE_GATE_SKILL,
        enabled: true,
        version: 1,
      },
    ];

    for (let order = 0; order < seedSkills.length; order++) {
      const s = seedSkills[order]!;
      let [existingSkill] = await db
        .select({ id: t.skills.id })
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
      if (!existingSkill) {
        [existingSkill] = await db.insert(t.skills).values(s).returning({ id: t.skills.id });
        await db.insert(t.skillVersions).values({
          skillId: existingSkill!.id,
          version: 1,
          body: s.body,
        });
      }
      await db
        .insert(t.agentSkills)
        .values({ agentId: testQualityAgent.id, skillId: existingSkill!.id, order })
        .onConflictDoUpdate({
          target: [t.agentSkills.agentId, t.agentSkills.skillId],
          set: { order },
        });
    }
  }

  // ---- demo agent_runs for PR #482 (so cost/tokens show in the UI) ----
  // Idempotent: only seed when this PR has no runs yet. Costs are REAL-style
  // values (as if reported by OpenRouter usage.cost); the failed run has none.
  const existingRuns = await db
    .select({ id: t.agentRuns.id })
    .from(t.agentRuns)
    .where(eq(t.agentRuns.prId, pr!.id));
  if (existingRuns.length === 0) {
    const agentRows = await db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    const agentId = (name: string) => agentRows.find((a) => a.name === name)?.id ?? null;
    const at = (min: number) => new Date(Date.now() - min * 60_000);

    const [securityRun] = await db
      .insert(t.agentRuns)
      .values([
        {
          workspaceId,
          agentId: agentId('Security Reviewer'),
          prId: pr!.id,
          ranAt: at(2),
          provider: DEFAULT_PROVIDER,
          model: DEFAULT_MODEL,
          durationMs: 8200,
          tokensIn: 7900,
          tokensOut: 1219,
          costUsd: 0.0013,
          status: 'done',
          source: 'local',
          findingsCount: 3,
          grounding: '3/3 passed',
          score: 38,
          blockers: 2,
        },
        {
          workspaceId,
          agentId: agentId('Performance Reviewer'),
          prId: pr!.id,
          ranAt: at(3),
          provider: DEFAULT_PROVIDER,
          model: DEFAULT_MODEL,
          durationMs: 9100,
          tokensIn: 10500,
          tokensOut: 1511,
          costUsd: 0.0014,
          status: 'done',
          source: 'local',
          findingsCount: 2,
          grounding: '2/2 passed',
          score: 64,
          blockers: 0,
        },
        {
          // Failed run: no usage → cost stays null (UI shows "—", not "$0.00").
          workspaceId,
          agentId: agentId('General Reviewer'),
          prId: pr!.id,
          ranAt: at(3),
          provider: 'openai',
          model: 'gpt-4.1',
          durationMs: 400,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: null,
          status: 'failed',
          source: 'local',
          error: '429 You exceeded your current quota, please check your plan and billing details.',
          findingsCount: 0,
          grounding: '0/0 passed',
        },
        {
          workspaceId,
          agentId: agentId('Performance Reviewer'),
          prId: pr!.id,
          ranAt: at(720),
          provider: DEFAULT_PROVIDER,
          model: DEFAULT_MODEL,
          durationMs: 7600,
          tokensIn: 7100,
          tokensOut: 1357,
          costUsd: 0.0012,
          status: 'done',
          source: 'local',
          findingsCount: 5,
          grounding: '5/5 passed',
          score: 0,
          blockers: 2,
        },
      ])
      .returning({ id: t.agentRuns.id });

    // One trace document (Security run) so the trace drawer shows the Cost tile.
    if (securityRun) {
      await db.insert(t.runTraces).values({
        runId: securityRun.id,
        trace: {
          config: {
            agent: 'Security Reviewer',
            version: '1',
            provider: DEFAULT_PROVIDER,
            model: DEFAULT_MODEL,
            pr: 482,
            source: 'local',
          },
          stats: {
            duration_ms: 8200,
            tokens_in: 7900,
            tokens_out: 1219,
            findings: 3,
            grounding: '3/3 passed',
            cost_usd: 0.0013,
          },
          prompt_assembly: {
            system: SECURITY_REVIEWER_PROMPT,
            user: 'Review PR #482 — Add rate limiting to public API endpoints.',
          },
          tool_calls: [{ tool: 'review_file', args: 'all files', meta: 'single-pass', ms: 8200 }],
          raw_output: '{"verdict":"request_changes","score":38,"findings":[…]}',
          memory_pulled: [],
          specs_read: [],
          log: [
            { t: '00.10', kind: 'info', msg: 'Loading PR diff' },
            { t: '08.20', kind: 'result', msg: 'Citation grounding: 3/3 passed' },
          ],
        },
      });
    }
  }

  // ---- L02 conventions board for payments-api (so the page + e2e have data) ----
  // Idempotent: only when this repo has no conventions yet. payments-api has no
  // clone, so these stand in for a past scan; a real Run Scan needs a cloned repo.
  const existingConventions = await db
    .select({ id: t.conventions.id })
    .from(t.conventions)
    .where(eq(t.conventions.repoId, repoId));
  if (existingConventions.length === 0) {
    const scannedAt = new Date(Date.now() - 60 * 60 * 1000);
    await db.insert(t.conventions).values([
      {
        workspaceId,
        repoId,
        rule: 'Always use async/await instead of .then() chains',
        rationale: 'Flag new .then()/.catch() promise chains in application code.',
        category: 'style',
        evidencePath: 'src/api/users.ts',
        evidenceLine: 23,
        evidenceSnippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });',
        occurrences: 42,
        confidence: 0.91,
        status: 'accepted',
        createdAt: scannedAt,
      },
      {
        workspaceId,
        repoId,
        rule: 'All public route handlers return typed Result<T, ApiError>',
        rationale: 'Flag public handlers that throw or return bare values instead of ok()/err().',
        category: 'api',
        evidencePath: 'src/api/public/index.ts',
        evidenceLine: 14,
        evidenceSnippet: 'function handler(): Result<Item[], ApiError> {\n  return ok(items);\n}',
        occurrences: 7,
        confidence: 0.78,
        status: 'accepted',
        createdAt: scannedAt,
      },
      {
        workspaceId,
        repoId,
        rule: 'Redis access goes through src/lib/redis.ts singleton',
        rationale: 'Flag new Redis(...) clients created outside src/lib/redis.ts.',
        category: 'data_access',
        evidencePath: 'src/lib/redis.ts',
        evidenceLine: 1,
        evidenceSnippet: 'export const redis = new Redis(config.redisUrl);',
        occurrences: 12,
        confidence: 0.85,
        status: 'accepted',
        createdAt: scannedAt,
      },
    ]);
    await db.insert(t.conventionScans).values({
      workspaceId,
      repoId,
      sampledFiles: [
        'package.json',
        'tsconfig.json',
        '.eslintrc.json',
        'src/api/users.ts',
        'src/api/public/index.ts',
        'src/api/public/webhooks.ts',
        'src/lib/redis.ts',
        'src/config.ts',
        'src/middleware/ratelimit.ts',
        'src/services/refundFees.ts',
        'src/services/refundFees.test.ts',
      ],
      proposed: 5,
      droppedUngrounded: 1,
      droppedDuplicate: 0,
      droppedRare: 1,
      kept: 3,
      model: 'deepseek/deepseek-v4-flash',
      apiCostUsd: 0.0011,
      headSha: null,
      durationMs: 41_000,
      createdAt: scannedAt,
    });
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
