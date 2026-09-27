import type {
  FeatureModelChoice,
  GitClient,
  GitHubClient,
  IntentConfidence,
  IntentForReview,
  IntentSourceKind,
  IntentUnresolvedReason,
  LLMProvider,
  PrIntentRecord,
  Provider,
  UnifiedDiff,
} from '@devdigest/shared';

/**
 * Ports the intent service depends on — NOT the `Container`. Row shapes are
 * plain hand-written interfaces (no ORM import); `IntentRepository` returns
 * values structurally assignable to them.
 */

/** One intent source as persisted in `pr_intent.sources` (mirrors the `IntentSource` contract). */
export interface IntentSourceJson {
  kind: IntentSourceKind;
  /** '#12' | 'docs/plans/x.md' | URL without query/fragment/userinfo. */
  ref: string;
  title: string | null;
  status: 'resolved' | 'unresolved';
  /** Non-null iff unresolved. */
  reason: IntentUnresolvedReason | null;
  /** Chars sent to the classifier (0 when unresolved). */
  chars: number;
  truncated: boolean;
}

export interface IntentRow {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  headSha: string | null;
  confidence: IntentConfidence;
  missingContext: string[];
  outOfScopeFiles: string[];
  sources: IntentSourceJson[];
  provider: string | null;
  model: string | null;
  promptTokensEst: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  apiCostUsd: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UpsertIntent = Omit<IntentRow, 'createdAt' | 'updatedAt'>;

/** The slice of a PR (+ its repo) the intent service needs. `pulls`/`repos` own the tables. */
export interface PullContext {
  id: string;
  workspaceId: string;
  number: number;
  title: string;
  body: string | null;
  base: string;
  headSha: string;
  repo: { owner: string; name: string; fullName: string; clonePath: string | null };
}

export interface IntentRepositoryPort {
  getPullContext(workspaceId: string, prId: string): Promise<PullContext | undefined>;
  get(prId: string): Promise<IntentRow | undefined>;
  /** `updated_at = now()` on conflict; `created_at` is kept. */
  upsert(row: UpsertIntent): Promise<IntentRow>;
}

export interface OpsLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}

export interface ProgressSink {
  info(msg: string): void;
}

export interface EnsureIntentResult {
  status: 'reused' | 'classified' | 'unavailable';
  intent: IntentForReview | null;
  record: PrIntentRecord | null;
  reason: string | null;
}

export interface IntentForReviewPort {
  /** Never throws — a classification failure resolves to `status: 'unavailable'`, not a rejection. */
  ensureForReview(
    workspaceId: string,
    prId: string,
    ctx: { diff?: UnifiedDiff; logger?: OpsLogger; progress?: ProgressSink },
  ): Promise<EnsureIntentResult>;
}

/**
 * Structural subset of the server's `UrlFetcher` adapter (`src/adapters/url-fetcher`),
 * declared locally so this `ports.ts` stays adapter-free — `domain-no-outer-layers`
 * bans importing `src/adapters/**` from a port (`.dependency-cruiser.cjs`). The real
 * `HttpUrlFetcher` (wired in `container.ts`) satisfies this shape structurally.
 */
export interface IntentUrlFetch {
  fetch(url: string, maxBytes: number): Promise<{ filename: string; bytes: Buffer; contentType: string | null }>;
}

export interface TokenCounter {
  count(text: string): number;
}

export interface IntentDeps {
  intents: IntentRepositoryPort;
  /** `container.github()`; may throw `ConfigError` when no token is configured. */
  github: () => Promise<Pick<GitHubClient, 'getIssue'>>;
  /** Inline in `container.ts` over `reviews`' `loadDiff` — `intent` never imports `reviews` internals. */
  loadDiff: (workspaceId: string, prId: string) => Promise<UnifiedDiff>;
  /** Plan/spec file content at the PR head SHA. */
  files: Pick<GitClient, 'readFileAt'>;
  /** SSRF-safe fetch of an allowlisted external link (`container.urlFetcher`). */
  urls: IntentUrlFetch;
  /** `config.intentLinkAllowlist` — lower-cased hostnames. */
  linkAllowlist: string[];
  /** Resolved lazily: a key may be missing or rotated (see composition root). */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** Settings → Models → Intent (workspace override, else registry default). */
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  tokenizer: TokenCounter;
  now?: () => number;
}
