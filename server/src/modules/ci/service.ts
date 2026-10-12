import { strToU8, zipSync } from 'fflate';
import type {
  CiExport,
  CiExportInput,
  CiFile,
  CiInstallation,
  CiPreview,
  CiRunsPage,
  CiRunsQuery,
  CiRunSummary,
  CiSecretStatus,
  CiTargetOption,
  CiWorkflowViolation,
  CiWorkflowWarning,
  GitHubClient,
  RepoRef,
} from '@devdigest/shared';
import { AppError, ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  CI_BRANCH,
  EXPORT_PR_TITLE,
  GENERATOR_VERSION,
  OPENROUTER_SECRET_NAME,
} from './constants.js';
import { assembleFileSet } from './domain/file-set.js';
import { classifyGithubError } from './domain/github-errors.js';
import { isOutdated } from './domain/installation-state.js';
import { renderExportPrBody } from './domain/pr-body.js';
import { agentSlug } from './domain/slug.js';
import { CI_TARGETS } from './domain/targets.js';
import { buildWorkflowYaml } from './domain/workflow.js';
import { validateWorkflow } from './domain/workflow-validate.js';
import { workflowVersion } from './domain/workflow-version.js';
import type {
  CiAgentRecord,
  CiClock,
  CiInstallationRecord,
  CiLogger,
  CiRepository,
  CiSources,
} from './ports.js';

/**
 * SPEC-07 — export side + reads of the CI module. Orchestration only: the file
 * set, workflow generation and validation are pure `domain/` functions; every
 * outside system (agents, skills, repos, the runner bundle, GitHub) arrives as
 * a narrow dependency. Nothing here opens a transaction or holds secret values
 * beyond one generation call.
 */

export interface CiServiceDeps extends CiSources {
  repo: CiRepository;
  /** Resolves the GitHub client (throws when no token is configured). */
  github: () => Promise<GitHubClient>;
  clock?: CiClock;
  logger?: CiLogger;
}

const RUNS_DEFAULT_RANGE_MS = 7 * 24 * 60 * 60 * 1000;

const MSG_GITHUB_NOT_CONNECTED = 'Connect GitHub in Settings';
const MSG_REPO_NOT_FOUND = 'Repository not found or not accessible';
const MSG_RUNNER_MISSING = 'Runner bundle missing — run pnpm --dir agent-runner build';

export type CiExportRequest = CiExportInput;

interface Generated {
  agent: CiAgentRecord;
  existing: CiInstallationRecord | undefined;
  manifestSlug: string;
  /** Full contents, runner files included. */
  files: CiFile[];
  warnings: string[];
  workflow: string;
  violations: CiWorkflowViolation[];
  workflowWarnings: CiWorkflowWarning[];
}

const splitRepo = (fullName: string): RepoRef => {
  const [owner = '', name = ''] = fullName.split('/');
  return { owner, name };
};

/** Map an error thrown by a GitHub call to the API error the user should see. */
function githubError(err: unknown): AppError {
  const message = err instanceof Error ? err.message : String(err);
  const kind = classifyGithubError(err);
  if (kind === 'not_found') return new ValidationError(MSG_REPO_NOT_FOUND, { reason: 'repo_not_found' });
  if (kind === 'permission') return new ValidationError(message, { reason: 'github_permission' });
  return new ExternalServiceError(message);
}

function toInstallation(
  r: CiInstallationRecord,
  agentVersion: number | null,
  lastRun: CiRunSummary | null,
): CiInstallation {
  return {
    id: r.id,
    agent_id: r.agentId,
    repo: r.repo,
    target_type: r.targetType,
    github_repo_id: r.githubRepoId,
    manifest_slug: r.manifestSlug,
    triggers: r.triggers,
    post_as: r.postAs,
    workflow_version: r.workflowVersion,
    generator_version: r.generatorVersion,
    agent_version: r.agentVersion,
    exported_ci_fail_on: r.exportedCiFailOn,
    pr_url: r.prUrl,
    state: r.state,
    outdated: agentVersion === null ? false : isOutdated(r, agentVersion),
    installed_at: r.installedAt.toISOString(),
    updated_at: r.updatedAt ? r.updatedAt.toISOString() : null,
    last_refreshed_at: r.lastRefreshedAt ? r.lastRefreshedAt.toISOString() : null,
    last_run: lastRun,
  };
}

export class CiService {
  private readonly clock: CiClock;

  constructor(private readonly deps: CiServiceDeps) {
    this.clock = deps.clock ?? { now: () => new Date() };
  }

  listTargets(): CiTargetOption[] {
    return CI_TARGETS;
  }

  // ---- generation ----------------------------------------------------------

  private async generate(ws: string, agentId: string, input: CiExportRequest): Promise<Generated> {
    const { deps } = this;
    const agent = await deps.agents.getById(ws, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    if (agent.provider !== 'openrouter') {
      throw new ValidationError(
        `Agent provider "${agent.provider}" is not supported in CI — the CI runner supports OpenRouter only.`,
        { reason: 'provider_not_supported', provider: agent.provider },
      );
    }

    const runnerFiles = await deps.bundle.load();
    if (!runnerFiles || runnerFiles.length === 0) {
      throw new ValidationError(MSG_RUNNER_MISSING, { reason: 'runner_bundle_missing' });
    }

    const existing = await deps.repo.findInstallationByRepo(ws, input.repo);
    // AC-86 — a re-export keeps the slug fixed at the first export, even after a rename.
    const manifestSlug =
      existing && existing.agentId === agentId && existing.manifestSlug
        ? existing.manifestSlug
        : agentSlug(agent.name);

    const skills = await deps.skills.linkedSkills(agentId);
    const repoRow = await deps.repos.findByFullName(ws, input.repo);
    const memoryRows = repoRow ? await deps.repo.memoryForRepo(ws, repoRow.id) : [];
    const knownSecretValues = await deps.secretValues.list();

    const workflow = input.workflow ?? buildWorkflowYaml({ triggers: input.triggers, postAs: input.post_as });

    const set = assembleFileSet({
      agent,
      skills,
      memoryRows,
      workflow,
      runnerFiles,
      manifestSlug,
      knownSecretValues,
    });
    if ('credentialPath' in set) {
      throw new ValidationError(`Credential-shaped content detected in ${set.credentialPath}`, {
        reason: 'credential_detected',
        path: set.credentialPath,
      });
    }

    const validation = validateWorkflow(workflow);
    return {
      agent,
      existing,
      manifestSlug,
      files: set.files,
      warnings: set.warnings,
      workflow,
      violations: validation.violations,
      workflowWarnings: validation.warnings,
    };
  }

  private requireValid(g: Generated): void {
    if (g.violations.length > 0) {
      throw new ValidationError('The workflow failed validation', {
        reason: 'workflow_invalid',
        violations: g.violations,
      });
    }
  }

  // ---- preview / archive ---------------------------------------------------

  async preview(ws: string, agentId: string, input: CiExportRequest): Promise<CiPreview> {
    const g = await this.generate(ws, agentId, input);
    return {
      // AC-13 — the runner bundle is never sent to the browser.
      files: g.files.map((f) => (f.kind === 'runner' ? { ...f, contents: null } : f)),
      warnings: g.warnings,
      workflow_violations: g.violations,
      workflow_warnings: g.workflowWarnings,
      workflow_version: workflowVersion(g.workflow),
      generator_version: GENERATOR_VERSION,
    };
  }

  /** AC-41 / AC-82 / AC-83 — same files as the preview, zipped; no GitHub call, no DB write. */
  async archive(ws: string, agentId: string, input: CiExportRequest): Promise<Uint8Array> {
    const g = await this.generate(ws, agentId, input);
    this.requireValid(g);
    const entries: Record<string, Uint8Array> = {};
    for (const f of g.files) entries[f.path] = strToU8(f.contents ?? '');
    return zipSync(entries);
  }

  // ---- secrets -------------------------------------------------------------

  private async requireGithub(): Promise<GitHubClient> {
    if (!(await this.deps.githubConnection.hasToken())) {
      throw new ValidationError(MSG_GITHUB_NOT_CONNECTED, { reason: 'github_not_connected' });
    }
    return this.deps.github();
  }

  /** AC-31 / EC-13 — names only; `unknown` when the credential cannot list secrets. */
  async secrets(_ws: string, repo: string): Promise<CiSecretStatus[]> {
    const github = await this.requireGithub();
    const ref = splitRepo(repo);
    let names: string[] | null;
    try {
      await github.getRepository(ref);
      names = await github.listRepoSecretNames(ref);
    } catch (err) {
      throw githubError(err);
    }
    const status = names === null ? 'unknown' : names.includes(OPENROUTER_SECRET_NAME) ? 'set' : 'not_set';
    return [{ name: OPENROUTER_SECRET_NAME, status }];
  }

  // ---- export --------------------------------------------------------------

  async exportToGithub(
    ws: string,
    agentId: string,
    input: CiExportRequest,
  ): Promise<{ status: 200 | 201; body: CiExport }> {
    const { deps } = this;
    const g = await this.generate(ws, agentId, input);
    this.requireValid(g);

    // AC-7 — a repository holds one agent; refuse without touching anything.
    if (g.existing && g.existing.agentId !== agentId) {
      const other = await deps.agents.getById(ws, g.existing.agentId);
      const label = other ? `"${other.name}"` : g.existing.agentId;
      return {
        status: 200,
        body: {
          installation: null,
          pr_url: null,
          reused_pr: false,
          warnings: g.warnings,
          refused_reason: `${input.repo} already has DevDigest CI installed for agent ${label}. A repository can run one agent.`,
        },
      };
    }

    const github = await this.requireGithub();
    const ref = splitRepo(input.repo);

    let info;
    try {
      info = await github.getRepository(ref);
    } catch (err) {
      throw githubError(err);
    }

    try {
      await github.commitFiles(ref, {
        branch: CI_BRANCH,
        base: info.default_branch,
        message: g.existing ? 'Update DevDigest CI review' : EXPORT_PR_TITLE,
        files: g.files.map((f) => ({ path: f.path, contents: f.contents ?? '' })),
      });
    } catch (err) {
      throw githubError(err);
    }

    let prUrl: string;
    let reusedPr = false;
    try {
      const open = await github.findOpenPr(ref, CI_BRANCH);
      if (open) {
        prUrl = open.url;
        reusedPr = true;
      } else {
        const pr = await github.openPullRequest(ref, {
          title: EXPORT_PR_TITLE,
          head: CI_BRANCH,
          base: info.default_branch,
          body: renderExportPrBody({ repo: input.repo, triggers: input.triggers, postAs: input.post_as }),
        });
        prUrl = pr.url;
      }
    } catch (err) {
      // The commit already landed; a retry reuses the branch (EC-5). No row is written.
      const message = err instanceof Error ? err.message : String(err);
      throw new ExternalServiceError(`Could not open the pull request: ${message}`, {
        reason: 'pr_create_failed',
      });
    }

    const { record, created } = await deps.repo.upsertInstallation({
      workspaceId: ws,
      agentId,
      repo: input.repo,
      targetType: 'gha',
      githubRepoId: info.id,
      manifestSlug: g.manifestSlug,
      triggers: input.triggers,
      postAs: input.post_as,
      workflowVersion: workflowVersion(g.workflow),
      generatorVersion: GENERATOR_VERSION,
      agentVersion: g.agent.version,
      exportedCiFailOn: g.agent.ciFailOn,
      prUrl,
      state: 'pr_open',
    });

    deps.logger?.info({ agentId, repo: input.repo, reusedPr, created }, 'ci export opened');
    return {
      status: created ? 201 : 200,
      body: {
        installation: toInstallation(record, g.agent.version, null),
        pr_url: prUrl,
        reused_pr: reusedPr,
        warnings: g.warnings,
        refused_reason: null,
      },
    };
  }

  // ---- reads ---------------------------------------------------------------

  async installations(ws: string, agentId: string): Promise<CiInstallation[]> {
    const agent = await this.deps.agents.getById(ws, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const records = await this.deps.repo.listInstallations(ws, agentId);
    const lastRuns = await this.deps.repo.lastRuns(
      ws,
      records.map((r) => r.id),
    );
    return records.map((r) => toInstallation(r, agent.version, lastRuns.get(r.id) ?? null));
  }

  async runs(ws: string, query: CiRunsQuery): Promise<CiRunsPage> {
    const from = query.from ?? new Date(this.clock.now().getTime() - RUNS_DEFAULT_RANGE_MS).toISOString();
    return this.deps.repo.listRuns(ws, { ...query, from });
  }
}
