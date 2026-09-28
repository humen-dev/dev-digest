import type {
  FeatureModelChoice,
  IntentSourceKind,
  IntentUnresolvedReason,
  PrIntentState,
  UnifiedDiff,
} from '@devdigest/shared';
import {
  changedFilesFromDiff,
  classifyIntent,
  type IntentClassifierInput,
  type IntentDocument,
  type IntentLinkedIssue,
  type IntentUnresolvedRef,
} from '@devdigest/reviewer-core';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { EXTERNAL_MAX_BYTES, MAX_EXTERNAL_REFS, SOURCE_TIMEOUT_MS } from './constants.js';
import { htmlToText, isAcceptedContentType, isAllowlistedHost } from './domain/external.js';
import { isSafeRepoPath } from './domain/paths.js';
import { extractReferences } from './domain/references.js';
import { redactUrl, sourceLogView } from './domain/redact.js';
import { isStale } from './domain/staleness.js';
import { toIntentForReview, toPrIntentRecord } from './mappers.js';
import type {
  EnsureIntentResult,
  IntentDeps,
  IntentForReviewPort,
  IntentRow,
  IntentSourceJson,
  OpsLogger,
  ProgressSink,
  PullContext,
} from './ports.js';
import type { ExtractedDocRef, ExtractedIssueRef, ExtractedLinkRef, ReferenceOverflow } from './types.js';

/**
 * Intent service — orchestrates source gathering (title/body/issue/files/docs/links),
 * the one classifier call, and persistence. See server/specs/intent-layer.md.
 *
 * `Mirrors reviewer-core's un-exported MAX_ISSUE_BODY_CHARS (reviewer-core/src/intent/constants.ts)`:
 * that cap is applied INSIDE `classifyIntent` when building the prompt; this local copy is only
 * used to report the same char/truncated numbers on the persisted `sources[]` entry.
 */
const ISSUE_BODY_CHARS_FOR_SOURCE_STAT = 4000;

interface DocMeta {
  kind: 'repo_doc' | 'external_link';
  ref: string;
  title: string | null;
}

interface IssueResolution {
  issues: IntentLinkedIssue[];
  unresolved: IntentUnresolvedRef[];
  sources: IntentSourceJson[];
}

interface DocResolution {
  documents: IntentDocument[];
  unresolved: IntentUnresolvedRef[];
  unresolvedSources: IntentSourceJson[];
  resolvedMeta: DocMeta[];
}

function unresolvedSource(kind: IntentSourceKind, ref: string, reason: IntentUnresolvedReason): IntentSourceJson {
  return { kind, ref, title: null, status: 'unresolved', reason, chars: 0, truncated: false };
}

/** Refs dropped past the extraction caps — surfaced as `limit_exceeded` instead of silently lost. */
function overflowSources(overflow: ReferenceOverflow): { unresolved: IntentUnresolvedRef[]; sources: IntentSourceJson[] } {
  const entries: { kind: IntentSourceKind; ref: string }[] = [
    ...overflow.issues.map((ref) => ({ kind: 'github_issue' as const, ref })),
    ...overflow.docs.map((ref) => ({ kind: 'repo_doc' as const, ref })),
    ...overflow.links.map((url) => ({ kind: 'external_link' as const, ref: redactUrl(url) })),
  ];
  return {
    unresolved: entries.map((e) => ({ kind: e.kind, ref: e.ref, reason: 'limit_exceeded' as const })),
    sources: entries.map((e) => unresolvedSource(e.kind, e.ref, 'limit_exceeded')),
  };
}

function classifyIssueError(err: unknown): IntentUnresolvedReason {
  if (err instanceof TimeoutError) return 'timeout';
  const status = (err as { status?: number } | undefined)?.status;
  if (status === 404) return 'not_found';
  if (status === 401 || status === 403) return 'forbidden';
  return 'fetch_failed';
}

export class IntentService implements IntentForReviewPort {
  /** Single-flight per PR: concurrent detections (POST or the review path) share one call. */
  private readonly inFlight = new Map<string, Promise<IntentRow>>();

  constructor(private readonly deps: IntentDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private async requirePull(workspaceId: string, prId: string): Promise<PullContext> {
    const pull = await this.deps.intents.getPullContext(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  private toState(pull: PullContext, row: IntentRow | undefined): PrIntentState {
    return {
      pr_id: pull.id,
      current_head_sha: pull.headSha,
      stale: row ? isStale(row.headSha, pull.headSha) : false,
      intent: row ? toPrIntentRecord(row) : null,
    };
  }

  /** Never calls a model. */
  async getState(workspaceId: string, prId: string): Promise<PrIntentState> {
    const pull = await this.requirePull(workspaceId, prId);
    const row = await this.deps.intents.get(prId);
    return this.toState(pull, row);
  }

  /** Classifies (or re-classifies) synchronously. Concurrent calls for one PR share one call. */
  async detect(
    workspaceId: string,
    prId: string,
    ctx: { logger?: OpsLogger; progress?: ProgressSink } = {},
  ): Promise<PrIntentState> {
    const pull = await this.requirePull(workspaceId, prId);
    const row = await this.classify(pull, ctx);
    return this.toState(pull, row);
  }

  /** Reuses a non-stale intent; otherwise classifies. Never throws — failure resolves to `unavailable`. */
  async ensureForReview(
    workspaceId: string,
    prId: string,
    ctx: { diff?: UnifiedDiff; logger?: OpsLogger; progress?: ProgressSink },
  ): Promise<EnsureIntentResult> {
    try {
      const pull = await this.requirePull(workspaceId, prId);
      const existing = await this.deps.intents.get(prId);
      if (existing && !isStale(existing.headSha, pull.headSha)) {
        return {
          status: 'reused',
          intent: toIntentForReview(existing),
          record: toPrIntentRecord(existing),
          reason: null,
        };
      }
      const row = await this.classify(pull, ctx);
      return { status: 'classified', intent: toIntentForReview(row), record: toPrIntentRecord(row), reason: null };
    } catch (err) {
      const reason = err instanceof AppError ? err.code : 'unknown_error';
      return { status: 'unavailable', intent: null, record: null, reason };
    }
  }

  private classify(
    pull: PullContext,
    ctx: { diff?: UnifiedDiff; logger?: OpsLogger; progress?: ProgressSink },
  ): Promise<IntentRow> {
    const existing = this.inFlight.get(pull.id);
    if (existing) return existing;
    const p = this.runClassification(pull, ctx).finally(() => this.inFlight.delete(pull.id));
    this.inFlight.set(pull.id, p);
    return p;
  }

  private async runClassification(
    pull: PullContext,
    ctx: { diff?: UnifiedDiff; logger?: OpsLogger; progress?: ProgressSink },
  ): Promise<IntentRow> {
    const started = this.now();

    const diff = ctx.diff ?? (await this.deps.loadDiff(pull.workspaceId, pull.id));
    const files = changedFilesFromDiff(diff);
    const changedPaths = files.map((f) => f.path);
    const refs = extractReferences(pull.body, pull.repo, changedPaths);

    const [issueResult, docResult, linkResult] = await Promise.all([
      this.resolveIssues(pull, refs.issues),
      this.resolveDocs(pull, refs.docs),
      this.resolveLinks(refs.links),
    ]);

    const overflow = overflowSources(refs.overflow);

    const documents = [...docResult.documents, ...linkResult.documents];
    const unresolved = [
      ...issueResult.unresolved,
      ...docResult.unresolved,
      ...linkResult.unresolved,
      ...overflow.unresolved,
    ];

    const input: IntentClassifierInput = {
      pr: { number: pull.number, title: pull.title, body: pull.body },
      files,
      issues: issueResult.issues,
      documents,
      unresolved,
    };

    let choice: FeatureModelChoice | undefined;
    try {
      choice = await this.deps.resolveModel(pull.workspaceId);
      const llm = await this.deps.llm(choice.provider).catch((err: unknown) => {
        if (err instanceof ConfigError) {
          throw new AppError(
            'model_not_configured',
            `${err.message}. Add the key in Settings → API keys, or pick another model in Settings → Models → Intent.`,
            422,
          );
        }
        throw err;
      });

      let result;
      try {
        result = await classifyIntent({ llm, model: choice.model, input, sessionId: pull.id });
      } catch {
        throw new AppError('intent_classifier_failed', 'Intent classification failed.', 502, {
          provider: choice.provider,
          model: choice.model,
        });
      }

      const docCharsByRef = new Map(result.documentChars.map((d) => [d.ref, d]));
      const resolvedDocSources: IntentSourceJson[] = [...docResult.resolvedMeta, ...linkResult.resolvedMeta].map(
        (m) => {
          const dc = docCharsByRef.get(m.ref);
          return {
            kind: m.kind,
            ref: m.ref,
            title: m.title,
            status: 'resolved' as const,
            reason: null,
            chars: dc?.chars ?? 0,
            truncated: dc?.truncated ?? false,
          };
        },
      );

      const titleSection = result.sections.find((s) => s.name === 'pr_title');
      const bodySection = result.sections.find((s) => s.name === 'pr_body');
      const fileListSection = result.sections.find((s) => s.name === 'file_list');

      const sources: IntentSourceJson[] = [];
      sources.push({
        kind: 'pr_title',
        ref: 'title',
        title: null,
        status: 'resolved',
        reason: null,
        chars: titleSection?.chars ?? pull.title.length,
        truncated: titleSection?.truncated ?? false,
      });
      if (pull.body && pull.body.trim().length > 0) {
        sources.push({
          kind: 'pr_body',
          ref: 'body',
          title: null,
          status: 'resolved',
          reason: null,
          chars: bodySection?.chars ?? 0,
          truncated: bodySection?.truncated ?? false,
        });
      }
      sources.push(...issueResult.sources);
      sources.push({
        kind: 'file_list',
        ref: 'files',
        title: null,
        status: 'resolved',
        reason: null,
        chars: fileListSection?.chars ?? 0,
        truncated: fileListSection?.truncated ?? false,
      });
      sources.push(
        ...docResult.unresolvedSources,
        ...linkResult.unresolvedSources,
        ...overflow.sources,
        ...resolvedDocSources,
      );

      const promptTokensEst = this.deps.tokenizer.count(result.messages.map((m) => m.content).join('\n'));

      const saved = await this.deps.intents.upsert({
        prId: pull.id,
        intent: result.intent.intent,
        inScope: result.intent.in_scope,
        outOfScope: result.intent.out_of_scope,
        headSha: pull.headSha,
        confidence: result.intent.confidence,
        missingContext: result.intent.missing_context,
        outOfScopeFiles: result.intent.out_of_scope_files,
        sources,
        provider: choice.provider,
        model: choice.model,
        promptTokensEst,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        apiCostUsd: result.apiCostUsd,
      });

      ctx.logger?.info(
        {
          event: 'intent.classified',
          prId: pull.id,
          headSha: pull.headSha,
          provider: choice.provider,
          model: choice.model,
          sections: result.sections,
          promptTokensEst,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          apiCostUsd: result.apiCostUsd,
          confidence: result.intent.confidence,
          modelConfidence: result.modelConfidence,
          sources: sources.map(sourceLogView),
          durationMs: Math.max(0, Math.round(this.now() - started)),
        },
        'intent classified',
      );

      return saved;
    } catch (err) {
      if (err instanceof AppError) {
        ctx.logger?.warn(
          { event: 'intent.failed', prId: pull.id, provider: choice?.provider ?? null, model: choice?.model ?? null, code: err.code },
          'intent classification failed',
        );
      }
      throw err;
    }
  }

  // ------------------------------------------------------------ sources

  private async resolveIssues(pull: PullContext, refs: ExtractedIssueRef[]): Promise<IssueResolution> {
    const issues: IntentLinkedIssue[] = [];
    const unresolved: IntentUnresolvedRef[] = [];
    const sources: IntentSourceJson[] = [];
    if (refs.length === 0) return { issues, unresolved, sources };

    let client: Awaited<ReturnType<IntentDeps['github']>> | null = null;
    try {
      client = await this.deps.github();
    } catch {
      client = null;
    }

    for (const ref of refs) {
      if (!client) {
        unresolved.push({ kind: 'github_issue', ref: ref.ref, reason: 'no_credentials' });
        sources.push(unresolvedSource('github_issue', ref.ref, 'no_credentials'));
        continue;
      }
      try {
        const issue = await withTimeout(
          client.getIssue({ owner: pull.repo.owner, name: pull.repo.name }, ref.number),
          SOURCE_TIMEOUT_MS,
        );
        const body = issue.body ?? '';
        issues.push({ ref: ref.ref, title: issue.title, body });
        const capped = body.slice(0, ISSUE_BODY_CHARS_FOR_SOURCE_STAT);
        const content = `Title: ${issue.title}\n${capped}`;
        sources.push({
          kind: 'github_issue',
          ref: ref.ref,
          title: issue.title,
          status: 'resolved',
          reason: null,
          chars: content.length,
          truncated: body.length > ISSUE_BODY_CHARS_FOR_SOURCE_STAT,
        });
      } catch (err) {
        const reason = classifyIssueError(err);
        unresolved.push({ kind: 'github_issue', ref: ref.ref, reason });
        sources.push(unresolvedSource('github_issue', ref.ref, reason));
      }
    }
    return { issues, unresolved, sources };
  }

  private async resolveDocs(pull: PullContext, refs: ExtractedDocRef[]): Promise<DocResolution> {
    const documents: IntentDocument[] = [];
    const unresolved: IntentUnresolvedRef[] = [];
    const unresolvedSources: IntentSourceJson[] = [];
    const resolvedMeta: DocMeta[] = [];

    for (const ref of refs) {
      if (!isSafeRepoPath(ref.path)) {
        unresolved.push({ kind: 'repo_doc', ref: ref.path, reason: 'invalid_ref' });
        unresolvedSources.push(unresolvedSource('repo_doc', ref.path, 'invalid_ref'));
        continue;
      }
      if (!pull.repo.clonePath) {
        unresolved.push({ kind: 'repo_doc', ref: ref.path, reason: 'repo_not_cloned' });
        unresolvedSources.push(unresolvedSource('repo_doc', ref.path, 'repo_not_cloned'));
        continue;
      }
      try {
        const content = await withTimeout(
          this.deps.files.readFileAt({ owner: pull.repo.owner, name: pull.repo.name }, pull.headSha, ref.path),
          SOURCE_TIMEOUT_MS,
        );
        documents.push({ kind: 'repo_doc', ref: ref.path, role: ref.role, content });
        resolvedMeta.push({ kind: 'repo_doc', ref: ref.path, title: null });
      } catch (err) {
        const reason: IntentUnresolvedReason = err instanceof TimeoutError ? 'timeout' : 'not_found';
        unresolved.push({ kind: 'repo_doc', ref: ref.path, reason });
        unresolvedSources.push(unresolvedSource('repo_doc', ref.path, reason));
      }
    }
    return { documents, unresolved, unresolvedSources, resolvedMeta };
  }

  private async resolveLinks(refs: ExtractedLinkRef[]): Promise<DocResolution> {
    const documents: IntentDocument[] = [];
    const unresolved: IntentUnresolvedRef[] = [];
    const unresolvedSources: IntentSourceJson[] = [];
    const resolvedMeta: DocMeta[] = [];

    let index = 0;
    for (const ref of refs) {
      const redacted = redactUrl(ref.url);
      if (index >= MAX_EXTERNAL_REFS) {
        unresolved.push({ kind: 'external_link', ref: redacted, reason: 'limit_exceeded' });
        unresolvedSources.push(unresolvedSource('external_link', redacted, 'limit_exceeded'));
        index++;
        continue;
      }
      index++;
      if (!isAllowlistedHost(ref.url, this.deps.linkAllowlist)) {
        unresolved.push({ kind: 'external_link', ref: redacted, reason: 'not_allowlisted' });
        unresolvedSources.push(unresolvedSource('external_link', redacted, 'not_allowlisted'));
        continue;
      }
      try {
        const fetched = await withTimeout(this.deps.urls.fetch(ref.url, EXTERNAL_MAX_BYTES), SOURCE_TIMEOUT_MS);
        if (!isAcceptedContentType(fetched.contentType)) {
          unresolved.push({ kind: 'external_link', ref: redacted, reason: 'unsupported_content' });
          unresolvedSources.push(unresolvedSource('external_link', redacted, 'unsupported_content'));
          continue;
        }
        const base = (fetched.contentType ?? '').split(';')[0]!.trim().toLowerCase();
        const raw = fetched.bytes.toString('utf8');
        const text = base === 'text/html' ? htmlToText(raw) : raw;
        if (text.trim().length === 0) {
          unresolved.push({ kind: 'external_link', ref: redacted, reason: 'fetch_failed' });
          unresolvedSources.push(unresolvedSource('external_link', redacted, 'fetch_failed'));
          continue;
        }
        documents.push({ kind: 'external_link', ref: redacted, role: ref.role, content: text });
        resolvedMeta.push({ kind: 'external_link', ref: redacted, title: null });
      } catch (err) {
        const reason: IntentUnresolvedReason = err instanceof TimeoutError ? 'timeout' : 'fetch_failed';
        unresolved.push({ kind: 'external_link', ref: redacted, reason });
        unresolvedSources.push(unresolvedSource('external_link', redacted, reason));
      }
    }
    return { documents, unresolved, unresolvedSources, resolvedMeta };
  }
}
