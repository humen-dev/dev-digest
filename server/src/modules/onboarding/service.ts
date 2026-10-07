import type { OnboardingTour, OnboardingTourState, RepoRef, StructuredResult, TourIndexStatus } from '@devdigest/shared';
import { AppError, ConfigError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { containsSecretValue } from '../_shared/secrets.js';
import {
  CANDIDATE_TOP_N,
  DRAFT_MAX_TOKENS,
  DRAFT_TEMPERATURE,
  isCommandSourcePath,
  MAX_EXCERPT_FILES,
  MIN_STRUCTURED_TIMEOUT_MS,
  PROMPT_TOKEN_BUDGET,
  STRUCTURED_MAX_RETRIES,
  TREE_RANK_POOL,
} from './constants.js';
import { groundTour, isEmptyTour, type GroundingContext } from './domain/grounding.js';
import { buildFileTree, excerptOf, fitToBudget, isExcludedPath, isReadableInput } from './domain/input.js';
import { buildMessages } from './domain/prompt.js';
import { toOnboardingTour } from './mappers.js';
import type { OnboardingDeps, OpsLogger, RepoBasics, TourRow } from './ports.js';
import { TourDraft, TOUR_DRAFT_SCHEMA_NAME, type InputFile, type PromptInput, type TourDocument } from './types.js';

/**
 * Onboarding-tour service (SPEC-03). One generation is a synchronous,
 * single-flight, single-model-call pipeline: gather candidates from the
 * tracked tree at the last-indexed commit, read + ground them, write exactly
 * one `completeStructured` draft, ground + persist. See server/specs or
 * docs/plans/onboarding-tour.md §3.2 for the check order and error taxonomy.
 */
export class OnboardingTourService {
  /** One generation per repo at a time (single-process lock, like conventions/intent). */
  private readonly inFlight = new Set<string>();

  constructor(private readonly deps: OnboardingDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoBasics> {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  /** Generation in flight in THIS API process (OnboardingTourState.generating). */
  isGenerating(repoId: string): boolean {
    return this.inFlight.has(repoId);
  }

  /** Never calls a model. */
  async getState(workspaceId: string, repoId: string): Promise<OnboardingTourState> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const [row, indexState] = await Promise.all([
      this.deps.onboarding.get(repoId),
      this.deps.repoIntel.getIndexState(repoId),
    ]);
    const tour = row ? toOnboardingTour(row) : null;

    // The facade's `getIndexState` ALWAYS returns a row, synthesizing a
    // degraded default (`lastIndexedSha: ''`) when none is persisted — that
    // empty sha is the only observable signal of "no repo_index_state row"
    // (EC-36) through this narrowed port.
    const hasIndexRow = indexState.lastIndexedSha !== '';
    const currentCommit = hasIndexRow ? indexState.lastIndexedSha : null;
    const indexStatus: TourIndexStatus | null = hasIndexRow ? indexState.status : null;
    const stale = tour !== null && hasIndexRow && tour.tour_commit !== currentCommit;

    return {
      tour,
      cloned: repo.clonePath !== null,
      index_status: indexStatus,
      generating: this.isGenerating(repoId),
      stale,
      current_commit: currentCommit,
    };
  }

  /**
   * Generates (or regenerates) the tour synchronously. Single-flight per
   * repo (409 `generation_in_progress`); races a `timeoutMs` wall clock
   * (504 `generation_timeout`) — a late result is discarded (never
   * persisted), and the in-flight lock is released only when the underlying
   * work actually settles, not when the race's loser gives up (EC-12, NFR-3).
   */
  async generate(workspaceId: string, repoId: string, log?: OpsLogger): Promise<OnboardingTour> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (this.inFlight.has(repoId)) {
      throw new AppError('generation_in_progress', 'A tour generation for this repo is already running.', 409);
    }
    this.inFlight.add(repoId);

    const started = this.now();
    // M-1: the deadline the underlying work is bounded by too (see
    // runGeneration's LLM-call budgeting) — not just this race's own timer.
    const deadline = started + this.deps.timeoutMs;
    const state = { timedOut: false };
    const work = this.runGeneration(workspaceId, repoId, repo, started, deadline, state, log).finally(() => {
      this.inFlight.delete(repoId);
    });

    let timer!: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        state.timedOut = true;
        // M-2: this 504 was never logged before — the user saw nothing.
        log?.warn(
          {
            event: 'onboarding.tour_failed',
            repoId,
            code: 'generation_timeout',
            durationMs: Math.max(0, Math.round(this.now() - started)),
          },
          'onboarding tour generation failed',
        );
        reject(new AppError('generation_timeout', 'Tour generation timed out.', 504));
      }, this.deps.timeoutMs);
    });

    try {
      return await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
      // The loser of the race keeps running; swallow its eventual settlement
      // here so it never surfaces as an unhandled rejection.
      work.catch(() => {});
    }
  }

  private async runGeneration(
    workspaceId: string,
    repoId: string,
    repo: RepoBasics,
    started: number,
    deadline: number,
    state: { timedOut: boolean },
    log?: OpsLogger,
  ): Promise<OnboardingTour> {
    let tourCommit: string | null = null;
    // Hoisted above the try so the catch below can still report it (M-2:
    // "attempts" tells slow-model repair loops apart from a hard failure).
    let result: StructuredResult<TourDraft> | undefined;

    try {
      if (!repo.clonePath) {
        throw new AppError(
          'repo_not_cloned',
          `${repo.fullName} has no local clone. Clone it first, then generate the tour.`,
          422,
        );
      }
      const ref: RepoRef = { owner: repo.owner, name: repo.name };

      const indexState = await this.deps.repoIntel.getIndexState(repoId);
      if (indexState.lastIndexedSha === '') {
        throw new AppError(
          'repo_not_indexed',
          'This repo has not been indexed yet. Index it first, then generate the tour.',
          422,
        );
      }
      if (indexState.status === 'failed' || indexState.status === 'degraded') {
        throw new AppError(
          'index_not_ready',
          'The index for this repo is not ready yet. Re-index it, then generate the tour.',
          422,
        );
      }
      tourCommit = indexState.lastIndexedSha;

      const choice = await this.deps.resolveModel(workspaceId);
      const llm = await this.deps.llm(choice.provider).catch((err: unknown) => {
        if (err instanceof ConfigError) {
          throw new AppError(
            'model_not_configured',
            `${err.message}. Add the key in Settings → API keys, or pick another model in Settings → Models → Onboarding.`,
            422,
          );
        }
        throw err;
      });

      const tracked = await this.deps.git.listTrackedFiles(ref, tourCommit);
      if (tracked.length === 0) {
        throw new AppError('repo_empty', 'This repo has no tracked files at the indexed commit.', 422);
      }
      const trackedPaths = tracked.map((f) => f.path);
      const trackedSet = new Set(trackedPaths);
      const sizeByPath = new Map(tracked.map((f) => [f.path, f.size]));

      // AC-44 candidates: top-ranked files ∪ critical-path chain files ∪
      // command sources, filtered to tracked + non-excluded.
      const [topFiles, criticalPaths, rankedForTree] = await Promise.all([
        this.deps.repoIntel.getTopFilesByRank(repoId, CANDIDATE_TOP_N),
        this.deps.repoIntel.getCriticalPaths(repoId),
        this.deps.repoIntel.getRankedPaths(repoId, TREE_RANK_POOL),
      ]);
      const chainFiles = criticalPaths.flat();
      const commandPaths = trackedPaths.filter(isCommandSourcePath);

      const candidateSet = new Set<string>();
      for (const path of [...topFiles, ...chainFiles, ...commandPaths]) {
        if (trackedSet.has(path) && !isExcludedPath(path, this.deps.excludedDirs)) candidateSet.add(path);
      }

      // Read every candidate once; command sources keep their full text
      // (grounding needs it verbatim), the rest become excerpts.
      const excerpts: InputFile[] = [];
      const commandFiles: InputFile[] = [];
      const commandSources = new Map<string, string>();
      for (const path of candidateSet) {
        const size = sizeByPath.get(path) ?? 0;
        if (!isReadableInput(path, size, this.deps.maxFileBytes)) continue;
        let text: string;
        try {
          text = await this.deps.git.readFileAt(ref, tourCommit, path);
        } catch {
          continue; // unreadable in this clone — never fails the whole generation
        }
        if (containsSecretValue(text)) continue; // UT-7
        const excerpt = excerptOf(text);
        if (excerpt === null) continue;
        if (isCommandSourcePath(path)) {
          commandSources.set(path, text);
          commandFiles.push({ path, text });
        } else {
          excerpts.push({ path, text: excerpt });
        }
      }

      const tree = buildFileTree(trackedPaths, rankedForTree.map((r) => r.path), this.deps.excludedDirs);
      // AC-40: at most MAX_EXCERPT_FILES candidate files are excerpted, in the
      // rank order `candidateSet` was built in — command sources (full text)
      // are never subject to this cap.
      const cappedExcerpts = excerpts.slice(0, MAX_EXCERPT_FILES);
      const systemPrompt = await this.deps.loadSystemPrompt();
      const countTokens = (i: PromptInput): number =>
        this.deps.tokenizer.count(
          buildMessages(systemPrompt, i)
            .map((m) => m.content)
            .join('\n'),
        );
      const input = fitToBudget(
        { repoName: repo.fullName, tree, excerpts: cappedExcerpts, commandFiles },
        countTokens,
        PROMPT_TOKEN_BUDGET,
      );
      const messages = buildMessages(systemPrompt, input);

      // M-1 (revised): a single attempt (`maxRetries: 0`) gets the WHOLE
      // remaining budget as its `timeoutMs` — not a 1/(maxRetries+1) slice.
      // A real successful generation can take up to ~45s in one attempt, so
      // splitting the budget across adapter repair attempts (tried first)
      // would time out correct single-attempt generations. No adapter
      // repair means an invalid response fails normally (EC-10) instead of
      // the repair loop silently stacking attempts past the 120s deadline
      // (EC-12, NFR-3) and holding the `inFlight` lock for minutes.
      const remainingMs = Math.max(MIN_STRUCTURED_TIMEOUT_MS, deadline - this.now());
      try {
        result = await llm.completeStructured({
          model: choice.model,
          schema: TourDraft,
          schemaName: TOUR_DRAFT_SCHEMA_NAME,
          messages,
          temperature: DRAFT_TEMPERATURE,
          maxTokens: DRAFT_MAX_TOKENS,
          timeoutMs: remainingMs,
          maxRetries: STRUCTURED_MAX_RETRIES,
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new ExternalServiceError(err instanceof Error ? err.message : 'Tour generation failed.');
      }

      const groundingCtx: GroundingContext = { tracked: trackedSet, candidates: candidateSet, commandSources };
      const grounded = groundTour(result.data, groundingCtx);
      if (isEmptyTour(grounded)) {
        throw new AppError(
          'nothing_grounded',
          'Nothing in the model draft could be verified against the repo.',
          422,
        );
      }

      const citedPaths = [
        ...grounded.critical_paths.map((p) => p.path),
        ...grounded.guided_reading.map((p) => p.path),
      ];
      const importerCounts =
        citedPaths.length > 0 ? await this.deps.repoIntel.getImporterCounts(repoId, citedPaths) : {};

      const doc: TourDocument = {
        tracked_file_count: trackedPaths.length,
        indexed_file_count: indexState.filesIndexed,
        architecture: grounded.architecture,
        critical_paths: grounded.critical_paths.map((p) => ({
          ...p,
          importer_count: importerCounts[p.path] ?? 0,
        })),
        how_to_run: grounded.how_to_run,
        guided_reading: grounded.guided_reading.map((p) => ({
          ...p,
          importer_count: importerCounts[p.path] ?? 0,
        })),
        first_tasks: grounded.first_tasks,
        counters: grounded.counters,
      };

      const row: TourRow = {
        repoId,
        json: doc,
        generatedAt: new Date(this.now()),
        tourCommit,
        model: result.model || choice.model,
        // Real provider cost only — never an estimate (AC-54, NFR-11).
        apiCostUsd: result.apiCostUsd,
        durationMs: Math.max(0, Math.round(this.now() - started)),
      };

      // EC-12: a result that arrives after the 120s race lost is never stored.
      if (!state.timedOut) {
        await this.deps.onboarding.replace(row);
      }

      log?.info(
        {
          event: 'onboarding.tour_generated',
          repoId,
          commit: tourCommit,
          outcome: state.timedOut ? 'discarded_late' : 'generated',
          durationMs: row.durationMs,
          counters: doc.counters,
          apiCostUsd: row.apiCostUsd,
          attempts: result.attempts,
        },
        'onboarding tour generated',
      );

      const tour = toOnboardingTour(row);
      if (!tour) throw new AppError('internal_error', 'Failed to build the generated tour.', 500);
      return tour;
    } catch (err) {
      // M-2: every failure gets a log line — not just AppErrors — with a code
      // (or `internal_error` for an unexpected one) and the error's own
      // message, never file text. `attempts` (from the StructuredResult) is
      // included when the draft call already completed, so a failure after a
      // slow repair loop can be told apart from one that never reached it.
      const code = err instanceof AppError ? err.code : 'internal_error';
      const message = err instanceof Error ? err.message : String(err);
      log?.warn(
        {
          event: 'onboarding.tour_failed',
          repoId,
          commit: tourCommit,
          code,
          message,
          durationMs: Math.max(0, Math.round(this.now() - started)),
          attempts: result?.attempts,
        },
        'onboarding tour generation failed',
      );
      throw err;
    }
  }
}
