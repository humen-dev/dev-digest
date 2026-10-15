import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import { DEFAULT_WORKSPACE_NAME } from './seed.js';

/**
 * SPEC-09 (Q1a) — demo data for the Agent Performance dashboard.
 *
 * Kept out of the main `seed()` so PR #482 and the e2e fixtures stay unchanged.
 * Everything hangs off ONE marker PR ("Agent performance demo data", Decision 10):
 * its presence makes a re-run a no-op; `refresh` deletes it (and its runs) and
 * re-inserts, shifting the data back to "now" (otherwise it ages out of 30 days).
 *
 * Deterministic: no randomness, every timestamp is derived from `now`.
 */

export const DEMO_PR_TITLE = 'Agent performance demo data';
export const DEMO_PR_NUMBER = 9001;
const DEMO_REPO_FULL_NAME = 'acme/payments-api';
const HOUR = 3_600_000;

type AgentKey = 'G' | 'S' | 'P' | 'T' | 'A';
const AGENT_NAMES: Record<AgentKey, string> = {
  G: 'General Reviewer',
  S: 'Security Reviewer',
  P: 'Performance Reviewer',
  T: 'Test Quality Reviewer',
  A: 'API Contract Reviewer',
};

/** accepted / dismissed / pending finding outcomes of one review. */
type Outcome = 'accepted' | 'dismissed' | 'pending';

interface RunSpec {
  agent: AgentKey | null; // null → agent_id NULL ("Unknown agent")
  ageH: number; // hours before `now`
  status: 'done' | 'failed' | 'cancelled' | 'running';
  source: 'local' | 'ci';
  model: string;
  costUsd: number | null;
  durationMs: number | null;
  outcomes: Outcome[] | null; // null → no review
}

const MODELS = {
  G: 'openai/gpt-4.1',
  P: 'openai/gpt-4.1-mini',
  T: 'openai/gpt-4.1-mini',
  A: 'anthropic/claude-haiku-4.5',
  S_OLD: 'anthropic/claude-sonnet-4',
  S_NEW: 'anthropic/claude-sonnet-4.5',
} as const;

const BASE_COST: Record<string, number> = {
  [MODELS.G]: 0.0042,
  [MODELS.P]: 0.0011,
  [MODELS.A]: 0.0019,
  [MODELS.S_OLD]: 0.0068,
  [MODELS.S_NEW]: 0.0074,
};

const OUTCOME_CYCLE: Outcome[] = ['accepted', 'accepted', 'dismissed', 'pending'];

/** 2–4 findings with a deterministic accepted-heavy mix. */
function outcomesFor(seed: number): Outcome[] {
  const n = 2 + (seed % 3);
  return Array.from({ length: n }, (_, j) => OUTCOME_CYCLE[(seed + j) % OUTCOME_CYCLE.length]!);
}

function costFor(model: string, seed: number): number {
  return Number(((BASE_COST[model] ?? 0.002) * (1 + (seed % 5) * 0.1)).toFixed(6));
}

function durationFor(seed: number): number {
  return 6000 + ((seed * 371) % 7000);
}

/** The ~50 demo runs, relative to "now" (see the unit's Step 3 for the shape). */
export function buildRunSpecs(): RunSpec[] {
  const specs: RunSpec[] = [];
  const push = (agent: AgentKey | null, ageH: number, seed: number, over: Partial<RunSpec> = {}) => {
    const key = agent ?? 'G';
    const model = key === 'S' ? (ageH > 15 * 24 ? MODELS.S_OLD : MODELS.S_NEW) : MODELS[key];
    specs.push({
      agent,
      ageH,
      status: 'done',
      source: 'local',
      model,
      costUsd: costFor(model, seed),
      durationMs: durationFor(seed),
      outcomes: outcomesFor(seed),
      ...over,
    });
  };

  // Last 24 h (≥ 4 runs, AC "1 day" view).
  push('G', 1, 1);
  push('S', 4, 2);
  push('P', 9, 3);
  push('S', 15, 4);
  // One run still in flight — never counted as a finished run.
  push('G', 0.2, 5, { status: 'running', costUsd: null, durationMs: null, outcomes: null });

  // Days 1..29 — one run on each, so the 30-day view spans ≥ 25 distinct days.
  const testQualityOutcomes: Record<number, Outcome[]> = {
    3: ['accepted'],
    13: ['dismissed'],
    23: ['accepted', 'pending'],
  }; // 3 decided findings in total → small-sample badge
  const ciDays = new Set([5, 11, 17, 24]);
  const nullCostDays = new Set([7, 19]);
  const failedDays = new Set([9, 21]);
  const cancelledDays = new Set([14]);
  const unknownAgentDays = new Set([2, 8, 26]);
  const cycle: AgentKey[] = ['G', 'S', 'P'];
  for (let d = 1; d <= 29; d++) {
    const ageH = 24 * d + 2;
    if (testQualityOutcomes[d]) {
      push('T', ageH, d, { outcomes: testQualityOutcomes[d]! });
    } else if (failedDays.has(d)) {
      push(cycle[d % 3]!, ageH, d, { status: 'failed', costUsd: null, durationMs: 400 + d * 10, outcomes: null });
    } else if (cancelledDays.has(d)) {
      push(cycle[d % 3]!, ageH, d, { status: 'cancelled', costUsd: null, durationMs: 1200, outcomes: null });
    } else if (ciDays.has(d)) {
      push(cycle[d % 3]!, ageH, d, { source: 'ci', outcomes: null });
    } else if (unknownAgentDays.has(d)) {
      push(null, ageH, d);
    } else if (nullCostDays.has(d)) {
      push(cycle[d % 3]!, ageH, d, { costUsd: null });
    } else {
      push(cycle[d % 3]!, ageH, d);
    }
  }

  // Previous period (days 31–59): API Contract Reviewer runs ONLY here.
  const prevAgents: AgentKey[] = ['A', 'A', 'A', 'A', 'A', 'G', 'S', 'P'];
  prevAgents.forEach((agent, k) => push(agent, 24 * (31 + k) + 2, 40 + k));

  return specs;
}

export async function seedPerformanceDemo(
  db: Db,
  opts: { now?: Date; refresh?: boolean } = {},
): Promise<{ inserted: number; skipped: boolean }> {
  const now = opts.now ?? new Date();

  const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) throw new Error('Default workspace not found — run the main seed first (pnpm db:seed).');
  const workspaceId = ws.id;

  const [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, DEMO_REPO_FULL_NAME)));
  if (!repo) throw new Error(`Demo repo ${DEMO_REPO_FULL_NAME} not found — run the main seed first (pnpm db:seed).`);

  const agentRows = await db
    .select({ id: t.agents.id, name: t.agents.name })
    .from(t.agents)
    .where(eq(t.agents.workspaceId, workspaceId));
  const agentIds = {} as Record<AgentKey, string>;
  for (const key of Object.keys(AGENT_NAMES) as AgentKey[]) {
    const row = agentRows.find((a) => a.name === AGENT_NAMES[key]);
    if (!row) throw new Error(`Seeded agent "${AGENT_NAMES[key]}" not found — run the main seed first (pnpm db:seed).`);
    agentIds[key] = row.id;
  }

  const [marker] = await db
    .select({ id: t.pullRequests.id })
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repo.id), eq(t.pullRequests.title, DEMO_PR_TITLE)));

  if (marker && !opts.refresh) return { inserted: 0, skipped: true };

  const specs = buildRunSpecs();

  await db.transaction(async (tx) => {
    if (marker) {
      // agent_runs.pr_id is ON DELETE SET NULL, so the runs must go explicitly first.
      await tx.delete(t.agentRuns).where(eq(t.agentRuns.prId, marker.id));
      await tx.delete(t.pullRequests).where(eq(t.pullRequests.id, marker.id)); // cascades reviews + findings
    }

    const openedAt = new Date(now.getTime() - 60 * 24 * HOUR);
    const [pr] = await tx
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: DEMO_PR_NUMBER,
        title: DEMO_PR_TITLE,
        author: 'demo-bot',
        branch: 'demo/agent-performance',
        base: repo.defaultBranch,
        headSha: 'a9e0000000000000000000000000000000009001',
        status: 'merged',
        body: 'Synthetic data for the Agent Performance dashboard. Safe to delete.',
        openedAt,
        updatedAt: now,
      })
      .returning({ id: t.pullRequests.id });
    const prId = pr!.id;

    for (const [i, s] of specs.entries()) {
      const ranAt = new Date(now.getTime() - s.ageH * HOUR);
      const finishedAt = s.status === 'running' ? null : new Date(ranAt.getTime() + (s.durationMs ?? 0));
      const agentId = s.agent ? agentIds[s.agent] : null;
      const [run] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId,
          prId,
          ranAt,
          provider: s.model.split('/')[0] ?? null,
          model: s.model,
          durationMs: s.durationMs,
          tokensIn: s.status === 'done' ? 6000 + i * 120 : 0,
          tokensOut: s.status === 'done' ? 900 + i * 15 : 0,
          costUsd: s.costUsd,
          status: s.status,
          error: s.status === 'failed' ? 'Provider timeout (demo)' : null,
          source: s.source,
          findingsCount: s.outcomes?.length ?? null,
          finishedAt,
        })
        .returning({ id: t.agentRuns.id });

      if (!s.outcomes) continue;
      const [review] = await tx
        .insert(t.reviews)
        .values({
          workspaceId,
          prId,
          agentId,
          runId: run!.id,
          kind: 'review',
          verdict: 'comment',
          summary: 'Demo review for the Agent Performance dashboard.',
          score: 50 + (i % 40),
          model: s.model,
          createdAt: ranAt,
        })
        .returning({ id: t.reviews.id });

      const decidedAt = new Date(ranAt.getTime() + HOUR);
      await tx.insert(t.findings).values(
        s.outcomes.map((outcome, j) => ({
          reviewId: review!.id,
          file: `src/demo/module-${i}.ts`,
          startLine: 10 + j,
          endLine: 12 + j,
          severity: 'WARNING',
          category: 'general',
          title: `Demo finding ${i}.${j}`,
          rationale: 'Synthetic finding used only for performance statistics.',
          confidence: 0.8,
          acceptedAt: outcome === 'accepted' ? decidedAt : null,
          dismissedAt: outcome === 'dismissed' ? decidedAt : null,
        })),
      );
    }
  });

  return { inserted: specs.length, skipped: false };
}

// CLI entrypoint: `cd server && pnpm exec tsx src/db/seed-performance.ts [--refresh]`
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seedPerformanceDemo(handle.db, { refresh: process.argv.includes('--refresh') })
    .then(async (r) => {
      console.log('✓ performance demo seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ performance demo seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
