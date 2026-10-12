import type {
  CiRefreshResult,
  CiResultArtifact,
  GitHubClient,
  RepoRef,
  RunTrace,
  WorkflowRun,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { buildRunTrace } from '../../platform/trace-builder.js';
import { CI_FAILURE_REASONS, MAX_ARTIFACT_ZIP_BYTES, WORKFLOW_PATH } from './constants.js';
import { readArtifactZip, type CiFailureKey } from './domain/artifact-zip.js';
import { shouldSkipDebounced } from './domain/debounce.js';
import { classifyGithubError, type GithubErrorKind } from './domain/github-errors.js';
import { installationState } from './domain/installation-state.js';
import { ciRunStatus, decideRunOutcome } from './domain/run-outcome.js';
import { verifyRun } from './domain/verify-run.js';
import type {
  CiAgentRecord,
  CiAgentRunWriter,
  CiAgentSource,
  CiClock,
  CiInstallationRecord,
  CiLogger,
  CiRepository,
  GithubConnection,
  NewCiRunInput,
  WorkspaceSecretValues,
} from './ports.js';

/**
 * SPEC-07 — the ingest side of the CI module: `POST /ci/refresh`. For every
 * installation of the workspace it reads GitHub (never before the debounce
 * allows), verifies each unseen run's artifact and stores one `ci_runs` row per
 * run id (+ one mirrored `agent_runs` row for accepted runs). Orchestration only:
 * every decision is a pure `domain/` function, every outside system a port.
 *
 * Transactions hold database work only (plan Decision 4): `claimRun` →
 * `insertCompletedCiRun` → `linkAgentRun` are three separate calls, never one
 * cross-module transaction, and no GitHub call happens inside any of them.
 */

export interface CiRefreshServiceDeps {
  repo: CiRepository;
  agents: CiAgentSource;
  secretValues: WorkspaceSecretValues;
  githubConnection: GithubConnection;
  runWriter: CiAgentRunWriter;
  /** Resolves the GitHub client (throws when no token is configured). */
  github: () => Promise<GitHubClient>;
  clock?: CiClock;
  logger?: CiLogger;
}

const MSG_GITHUB_NOT_CONNECTED = 'Connect GitHub in Settings';
const RUNS_PER_INSTALLATION = 20;
/** Bounded fan-out of per-run GitHub calls inside one installation. */
const RUN_CONCURRENCY = 5;

const DEGRADED_REASONS: Record<GithubErrorKind, string> = {
  not_found: 'repository not found on GitHub',
  permission: 'GitHub denied access',
  rate_limited: 'GitHub rate limit reached',
  unavailable: 'GitHub is unavailable',
};

const splitRepo = (fullName: string): RepoRef => {
  const [owner = '', name = ''] = fullName.split('/');
  return { owner, name };
};

/** `https://github.com/o/r/pull/12` → 12. */
function pullNumberFromUrl(url: string | null): number | null {
  if (!url) return null;
  const m = /\/pull\/(\d+)(?:[/?#].*)?$/.exec(url);
  return m ? Number(m[1]) : null;
}

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

interface InstallationOutcome {
  ingested: number;
  failed: number;
  degradedReason: string | null;
}

type RunResult = 'ingested' | 'failed' | 'ignored' | 'known';

class InstallationGithubError extends Error {
  constructor(readonly kind: GithubErrorKind) {
    super(DEGRADED_REASONS[kind]);
  }
}

export class CiRefreshService {
  private readonly clock: CiClock;

  constructor(private readonly deps: CiRefreshServiceDeps) {
    this.clock = deps.clock ?? { now: () => new Date() };
  }

  /** `logger` is the request logger (routes pass `req.log`); falls back to the injected one. */
  async refresh(ws: string, force: boolean, logger?: CiLogger): Promise<CiRefreshResult> {
    const { deps } = this;
    const log = logger ?? deps.logger;
    if (!(await deps.githubConnection.hasToken())) {
      throw new ValidationError(MSG_GITHUB_NOT_CONNECTED, { reason: 'github_not_connected' });
    }
    const github = await deps.github();
    const installations = await deps.repo.listInstallations(ws);
    const secretValues = await deps.secretValues.list();
    const now = this.clock.now();

    const due: CiInstallationRecord[] = [];
    let skippedDebounced = 0;
    for (const inst of installations) {
      if (shouldSkipDebounced(inst.lastRefreshedAt, now, force)) skippedDebounced += 1;
      else due.push(inst);
    }

    const outcomes = await Promise.all(due.map((inst) => this.refreshInstallation(ws, inst, github, secretValues, log)));

    let ingested = 0;
    let failed = 0;
    let reason: string | null = null;
    for (const o of outcomes) {
      ingested += o.ingested;
      failed += o.failed;
      reason ??= o.degradedReason;
    }
    const result: CiRefreshResult = {
      checked: due.length,
      ingested,
      failed,
      skipped_debounced: skippedDebounced,
      degraded: reason !== null,
      reason,
    };
    log?.info({ workspaceId: ws, force, ...result }, 'ci refresh finished');
    return result;
  }

  private async refreshInstallation(
    ws: string,
    inst: CiInstallationRecord,
    github: GitHubClient,
    secretValues: readonly string[],
    log: CiLogger | undefined,
  ): Promise<InstallationOutcome> {
    const { deps } = this;
    const ref = splitRepo(inst.repo);
    try {
      // (2) the export PR's state, from the stored `pr_url` only.
      const prNumber = pullNumberFromUrl(inst.prUrl);
      const prState = prNumber === null ? null : await this.guard(() => github.getPullRequestState(ref, prNumber));

      // (3) completed runs of the generated workflow.
      const runs = await this.guard(() =>
        github.listWorkflowRuns(ref, { workflowPath: WORKFLOW_PATH, perPage: RUNS_PER_INSTALLATION }),
      );

      const agent = await deps.agents.getById(ws, inst.agentId);
      const results = await mapLimit(runs, RUN_CONCURRENCY, (run) =>
        this.ingestRun({ ws, inst, ref, run, github, agent, secretValues, log }),
      );
      const ingested = results.filter((r) => r === 'ingested').length;
      const failed = results.filter((r) => r === 'failed').length;

      // (6) installation state (AC-58). A previously active installation stays active.
      const hasIngestedRun = results.includes('ingested') || inst.state === 'active';
      const next = prState
        ? installationState({ prState, hasIngestedRun })
        : results.includes('ingested')
          ? 'active'
          : null;
      if (next && next !== inst.state) await deps.repo.setInstallationState(inst.id, next);

      // (7)
      await deps.repo.touchRefreshed(inst.id, this.clock.now());
      return { ingested, failed, degradedReason: null };
    } catch (err) {
      if (err instanceof InstallationGithubError) {
        // Stored rows stay untouched; the next refresh retries (no `touchRefreshed`).
        log?.warn({ workspaceId: ws, repo: inst.repo, kind: err.kind }, 'ci refresh degraded');
        return { ingested: 0, failed: 0, degradedReason: err.message };
      }
      throw err;
    }
  }

  /** Run one GitHub call; any failure becomes an `InstallationGithubError`. */
  private async guard<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (err) {
      throw new InstallationGithubError(classifyGithubError(err));
    }
  }

  private async ingestRun(a: {
    ws: string;
    inst: CiInstallationRecord;
    ref: RepoRef;
    run: WorkflowRun;
    github: GitHubClient;
    agent: CiAgentRecord | undefined;
    secretValues: readonly string[];
    log: CiLogger | undefined;
  }): Promise<RunResult> {
    const { ws, inst, ref, run, github, log } = a;
    const { deps } = this;
    const providerRunId = String(run.id);
    if (await deps.repo.hasRun(ws, providerRunId)) return 'known';

    const artifacts = run.status === 'completed' ? await this.guard(() => github.listRunArtifacts(ref, run.id)) : [];
    const outcome = decideRunOutcome(run, artifacts);
    if (outcome === 'ignore') return 'ignored'; // AC-85, EC-15 — nothing stored.

    // Job and PR links come only from run metadata, never from the artifact (AC-80).
    const prNumberFromRun = run.pull_requests[0] ?? null;
    const base = {
      workspaceId: ws,
      ciInstallationId: inst.id,
      agentId: inst.agentId,
      repo: inst.repo,
      providerRunId,
      commitSha: run.head_sha,
      ranAt: new Date(run.run_started_at ?? run.created_at),
      jobUrl: run.html_url,
      ingestedAt: this.clock.now(),
    };
    const prUrlFor = (n: number | null) => (n === null ? null : `${run.repository_html_url}/pull/${n}`);

    const storeFailed = async (key: CiFailureKey): Promise<RunResult> => {
      const failureReason = CI_FAILURE_REASONS[key];
      const id = await deps.repo.claimRun({
        ...base,
        prNumber: prNumberFromRun,
        prTitle: null,
        prUrl: prUrlFor(prNumberFromRun),
        agentName: null,
        status: 'failed',
        findingsCount: null,
        critical: null,
        warning: null,
        suggestion: null,
        verdict: null,
        blockers: null,
        costUsd: null,
        durationMs: null,
        failureReason,
      });
      if (id === null) return 'known';
      log?.warn({ run_id: run.id, reason: failureReason }, 'ci run failed');
      return 'failed';
    };

    if (typeof outcome === 'object' && 'failure' in outcome) return storeFailed(outcome.failure);

    const bytes = await this.guard(() => github.downloadArtifact(ref, outcome.download, MAX_ARTIFACT_ZIP_BYTES));
    const zip = readArtifactZip(bytes);
    if ('failure' in zip) return storeFailed(zip.failure);

    const verdict = verifyRun({
      run: { repository_id: run.repository_id, path: run.path, head_sha: run.head_sha },
      installation: { githubRepoId: inst.githubRepoId, repo: inst.repo },
      resultText: zip.result,
      metaText: zip.meta,
      secretValues: a.secretValues,
    });
    if (!verdict.accepted) return storeFailed(verdict.reason);

    const { artifact, meta } = verdict;
    const status = ciRunStatus(artifact);
    const prNumber = meta.pr_number;
    const row: NewCiRunInput = {
      ...base,
      commitSha: meta.commit_sha,
      prNumber,
      prTitle: meta.pr_title,
      prUrl: prUrlFor(prNumber),
      agentName: artifact.agent,
      status: status.status,
      findingsCount: artifact.findings_count,
      critical: artifact.critical ?? null,
      warning: artifact.warning ?? null,
      suggestion: artifact.suggestion ?? null,
      verdict: artifact.verdict ?? null,
      blockers: artifact.blockers ?? null,
      costUsd: artifact.cost_usd,
      durationMs: artifact.duration_ms ?? null,
      failureReason: status.status === 'failed' ? CI_FAILURE_REASONS[status.reason] : null,
    };
    const ciRunId = await deps.repo.claimRun(row);
    if (ciRunId === null) return 'known';

    // The mirrored agent_runs row. A failure here must not lose the stored ci_runs row.
    try {
      const agentRunId = await deps.runWriter.insertCompletedCiRun({
        workspaceId: ws,
        agentId: inst.agentId,
        model: a.agent?.model ?? null,
        ranAt: row.ranAt,
        durationMs: row.durationMs,
        costUsd: row.costUsd,
        findingsCount: artifact.findings_count,
        blockers: row.blockers,
        trace: this.traceFor(artifact, prNumber, a.agent?.model ?? ''),
      });
      await deps.repo.linkAgentRun(ciRunId, agentRunId);
    } catch {
      log?.warn({ run_id: run.id, reason: 'agent run mirror failed' }, 'ci run mirror failed');
    }

    if (status.status === 'failed') {
      log?.warn({ run_id: run.id, reason: CI_FAILURE_REASONS[status.reason] }, 'ci run failed');
      return 'failed';
    }
    return 'ingested';
  }

  private traceFor(artifact: CiResultArtifact, prNumber: number, model: string): RunTrace {
    return buildRunTrace({
      config: { agent: artifact.agent, version: artifact.version ?? null, provider: 'openrouter', model, pr: prNumber, source: 'ci' },
      stats: {
        duration_ms: artifact.duration_ms ?? 0,
        tokens_in: 0,
        tokens_out: 0,
        findings: artifact.findings_count,
        grounding: '',
        cost_usd: artifact.cost_usd,
      },
      promptAssembly: { system: '', user: '' },
      toolCalls: [],
      rawOutput: '',
      memoryPulled: [],
      specsRead: [],
      log: [],
    });
  }
}
