import type { IntentForReview, PrIntentRecord } from '@devdigest/shared';
import type { IntentRow } from './ports.js';

/** Row → contract mapping for the intent module. Pure, no I/O. */

export function toPrIntentRecord(row: IntentRow): PrIntentRecord {
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    pr_id: row.prId,
    head_sha: row.headSha,
    confidence: row.confidence,
    missing_context: row.missingContext,
    out_of_scope_files: row.outOfScopeFiles,
    sources: row.sources.map((s) => ({
      kind: s.kind,
      ref: s.ref,
      title: s.title,
      status: s.status,
      reason: s.reason,
      chars: s.chars,
      truncated: s.truncated,
    })),
    provider: row.provider,
    model: row.model,
    prompt_tokens_est: row.promptTokensEst,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    api_cost_usd: row.apiCostUsd,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** What the review engine consumes — the persisted record minus bookkeeping fields. */
export function toIntentForReview(row: IntentRow): IntentForReview {
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    out_of_scope_files: row.outOfScopeFiles,
    confidence: row.confidence,
  };
}
