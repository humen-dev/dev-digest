import type { PrBriefRecord } from '@devdigest/shared';

/**
 * SPEC-04 — seeded PR Brief for PR #482 so the Overview tab shows a brief in
 * the demo/e2e without an LLM call. Every file/line below lies inside the
 * hunks seeded into `pr_files` for #482 in `seed.ts` (new-side ranges:
 * ratelimit.ts 1-10, webhooks.ts 3-15, config.ts 1-13, users.ts 40-47,
 * pnpm-lock.yaml 120-126) so each focus click lands on a rendered diff line.
 * `head_sha` equals the seeded PR head so the brief is not "outdated".
 */
export const SEED_PR_482_BRIEF: PrBriefRecord = {
  brief: {
    summary:
      'Adds a token-bucket rate limiter in front of the public webhook endpoint. Solid middleware approach, but a Stripe live key is committed in plaintext and the user-list endpoint introduces an N+1 query that the new limiter will make worse.',
    risks: [
      {
        kind: 'auth_surface',
        title: 'Auth surface touched',
        explanation:
          'The limiter now runs before signature verification on the public webhook route, so a bug in the bucket logic changes who reaches the handler.',
        severity: 'high',
        file_refs: ['src/middleware/ratelimit.ts:5-9'],
      },
      {
        kind: 'dependency',
        title: 'New dependency: token-bucket',
        explanation: 'The lockfile gains a `token-bucket` entry; review the lockfile diff and the package provenance.',
        severity: 'medium',
        file_refs: ['pnpm-lock.yaml:124-126'],
      },
      {
        kind: 'performance',
        title: 'N+1 query in the user list',
        explanation: 'One orders lookup per user inside a loop; the cost grows with the page size under load.',
        severity: 'low',
        file_refs: ['src/api/users.ts:42-44'],
      },
    ],
    review_focus: [
      { file: 'src/config.ts', line: 12, reason: 'live Stripe key (sk_live_…) committed in plaintext' },
      {
        file: 'src/api/public/webhooks.ts',
        line: 7,
        reason: 'the 429 branch returns no Retry-After header, so well-behaved clients cannot back off',
      },
      { file: 'src/middleware/ratelimit.ts', line: 7, reason: 'the bucket is in-memory only and never refills' },
      { file: 'src/api/users.ts', line: 43, reason: 'N+1 query — one orders lookup per user' },
    ],
  },
  provenance: {
    head_sha: 'a1b2c3d4e5f6',
    generated_at: '2026-10-07T09:00:00.000Z',
    provider: 'seed',
    model: 'seed',
    attempts: 1,
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: null,
    context_docs: [],
    dropped_inputs: [],
    missing_sources: ['no_context_docs'],
  },
};
