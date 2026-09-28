import { and, eq, sql } from 'drizzle-orm';
import type { IntentUnresolvedReason } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { IntentRepositoryPort, IntentRow, IntentSourceJson, PullContext, UpsertIntent } from './ports.js';

/**
 * Drizzle implementation of the intent port. Owns `pr_intent`; `getPullContext`
 * reads `pull_requests` + `repos` (workspace-scoped) but never writes them —
 * those tables belong to the `pulls`/`repos` modules.
 */
export class IntentRepository implements IntentRepositoryPort {
  constructor(private readonly db: Db) {}

  async getPullContext(workspaceId: string, prId: string): Promise<PullContext | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        workspaceId: t.pullRequests.workspaceId,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        base: t.pullRequests.base,
        headSha: t.pullRequests.headSha,
        repoOwner: t.repos.owner,
        repoName: t.repos.name,
        repoFullName: t.repos.fullName,
        repoClonePath: t.repos.clonePath,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      number: row.number,
      title: row.title,
      body: row.body,
      base: row.base,
      headSha: row.headSha,
      repo: {
        owner: row.repoOwner,
        name: row.repoName,
        fullName: row.repoFullName,
        clonePath: row.repoClonePath,
      },
    };
  }

  async get(prId: string): Promise<IntentRow | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row ? toIntentRow(row) : undefined;
  }

  /** `updated_at = now()` on conflict; `created_at` is kept (not part of the `set` clause). */
  async upsert(row: UpsertIntent): Promise<IntentRow> {
    const values = {
      prId: row.prId,
      intent: row.intent,
      inScope: row.inScope,
      outOfScope: row.outOfScope,
      headSha: row.headSha,
      confidence: row.confidence,
      missingContext: row.missingContext,
      outOfScopeFiles: row.outOfScopeFiles,
      sources: row.sources,
      provider: row.provider,
      model: row.model,
      promptTokensEst: row.promptTokensEst,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      apiCostUsd: row.apiCostUsd,
    };
    const [saved] = await this.db
      .insert(t.prIntent)
      .values(values)
      .onConflictDoUpdate({
        target: t.prIntent.prId,
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning();
    return toIntentRow(saved!);
  }
}

/**
 * `pr_intent.sources` is typed loosely in `db/schema/reviews.ts` (`reason: string | null`) —
 * the schema module cannot depend on `@devdigest/shared`'s zod enum without pulling
 * ring-1 contracts into the ORM layer's `.$type<>()` generic. Narrow it here, at the
 * one place allowed to know both the row shape and the port's contract-derived type.
 */
function toSourceJson(row: (typeof t.prIntent.$inferSelect)['sources'][number]): IntentSourceJson {
  return {
    kind: row.kind,
    ref: row.ref,
    title: row.title,
    status: row.status,
    reason: row.reason as IntentUnresolvedReason | null,
    chars: row.chars,
    truncated: row.truncated,
  };
}

function toIntentRow(row: typeof t.prIntent.$inferSelect): IntentRow {
  return {
    prId: row.prId,
    intent: row.intent,
    inScope: row.inScope,
    outOfScope: row.outOfScope,
    headSha: row.headSha,
    confidence: row.confidence,
    missingContext: row.missingContext,
    outOfScopeFiles: row.outOfScopeFiles,
    sources: row.sources.map(toSourceJson),
    provider: row.provider,
    model: row.model,
    promptTokensEst: row.promptTokensEst,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    apiCostUsd: row.apiCostUsd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
