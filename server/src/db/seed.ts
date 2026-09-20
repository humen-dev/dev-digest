import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
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

  // ---- built-in agents (the three starter presets) ----
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
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
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
