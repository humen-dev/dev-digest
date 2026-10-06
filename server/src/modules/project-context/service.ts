import type {
  AttachedDocs,
  EffectiveContextDoc,
  EffectiveContextPreview,
  ProjectDocument,
  ProjectDocumentContent,
  ProjectDocumentList,
  ProjectDocumentUsage,
} from '@devdigest/shared';
import { bucketOf, groupByBucket } from '@devdigest/reviewer-core';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { isProjectDocPath, isValidDocPathSyntax } from './domain/paths.js';
import { containsSecretValue } from './domain/secrets.js';
import { buildEffectiveList } from './domain/effective-list.js';
import { ESTIMATED_TOKENS_BYTES_PER_TOKEN, MAX_LISTED_DOCS } from './constants.js';
import type { ProjectContextRepository, ProjectDocsFs, TokenCounter } from './ports.js';

/**
 * Service surface consumed by the run executor (U7, §3.4). `entries` is the
 * full grouped-order status trace (what the run trace shows); `docs` is the
 * subset that is actually `included`, same order, text attached — what the
 * engine renders.
 */
export interface ResolvedProjectContext {
  cloned: boolean;
  entries: EffectiveContextDoc[];
  docs: { path: string; text: string }[];
}

export interface ProjectContextServiceDeps {
  repo: ProjectContextRepository;
  fs: ProjectDocsFs;
  tokens: TokenCounter;
  /** Extra excluded directory names from config (D8, AC-5) — on top of the fs adapter's own defaults. */
  excludedDirs: string[];
}

function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / ESTIMATED_TOKENS_BYTES_PER_TOKEN);
}

/**
 * D6: an attached/addressed path that is excluded, not `.md`, or fails UT-6
 * syntax does not count as a usable project document (→ `skipped_missing` in
 * `resolveEffective`, 404 in the direct read/save endpoints).
 */
function isUsableDocPath(path: string, excludedDirs: readonly string[]): boolean {
  return isValidDocPathSyntax(path) && isProjectDocPath(path, excludedDirs);
}

/**
 * Project Context service (SPEC-01). Depends only on the narrow
 * `ProjectContextRepository` + `ProjectDocsFs` + `TokenCounter` ports — never
 * `Container` — so it stays out of the depcruise graph onto
 * `platform/container.ts` (onion-architecture rule 4).
 *
 * Document TEXT is never logged (NFR-4): every log-worthy error path below
 * carries only a path, a status code or a count, never file contents.
 */
export class ProjectContextService {
  constructor(private deps: ProjectContextServiceDeps) {}

  // ---- /repos/:id/project-docs ---------------------------------------------

  async list(workspaceId: string, repoId: string): Promise<ProjectDocumentList> {
    const repo = await this.deps.repo.getRepoClone(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const scannedAt = new Date().toISOString();
    if (!repo.clonePath) {
      return { cloned: false, documents: [], total: 0, scanned_at: scannedAt };
    }

    const walked = await this.deps.fs.walk(repo.clonePath, this.deps.excludedDirs);
    const total = walked.length;
    const capped = walked.slice(0, MAX_LISTED_DOCS);
    const counts = await this.deps.repo.agentCountsByPath(workspaceId);

    const documents: ProjectDocument[] = capped.map((w) => ({
      path: w.path,
      bucket: bucketOf(w.path),
      // Heuristic from the walk's byte size (never reads the file body — NFR-11).
      estimated_tokens: Math.ceil(w.sizeBytes / ESTIMATED_TOKENS_BYTES_PER_TOKEN),
      used_by_agents: counts.get(w.path) ?? 0,
    }));

    return { cloned: true, documents, total, scanned_at: scannedAt };
  }

  async read(workspaceId: string, repoId: string, path: string): Promise<ProjectDocumentContent> {
    const repo = await this.deps.repo.getRepoClone(workspaceId, repoId);
    if (!repo || !repo.clonePath) throw new NotFoundError('Repo not found');
    this.assertSyntax(path);
    if (!isUsableDocPath(path, this.deps.excludedDirs)) throw new NotFoundError('Document not found');

    const result = await this.deps.fs.read(repo.clonePath, path);
    if (result.status !== 'ok') {
      if (result.status === 'unsafe_path') throw new ValidationError('Invalid document path');
      throw new NotFoundError('Document not found'); // 'missing' | 'unreadable'
    }
    const text = result.text;
    return { path, bucket: bucketOf(path), estimated_tokens: estimateTokens(text), text };
  }

  async save(workspaceId: string, repoId: string, path: string, text: string): Promise<ProjectDocumentContent> {
    const repo = await this.deps.repo.getRepoClone(workspaceId, repoId);
    if (!repo || !repo.clonePath) throw new NotFoundError('Repo not found');
    this.assertSyntax(path);
    if (!isUsableDocPath(path, this.deps.excludedDirs)) throw new NotFoundError('Document not found');

    const result = await this.deps.fs.write(repo.clonePath, path, text);
    if (result.status === 'unsafe_path') throw new ValidationError('Invalid document path');
    if (result.status === 'missing') throw new NotFoundError('Document not found');
    return { path, bucket: bucketOf(path), estimated_tokens: estimateTokens(text), text };
  }

  async usage(workspaceId: string, repoId: string, path: string): Promise<ProjectDocumentUsage> {
    const repo = await this.deps.repo.getRepoClone(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    this.assertSyntax(path);
    const { agents, skills } = await this.deps.repo.usageByPath(workspaceId, path);
    return { path, agents, skills };
  }

  // ---- /agents/:id/context-docs, /skills/:id/context-docs -----------------

  async getAgentDocs(workspaceId: string, agentId: string): Promise<AttachedDocs> {
    if (!(await this.deps.repo.agentExists(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    return { paths: await this.deps.repo.getAgentDocs(agentId) };
  }

  async setAgentDocs(workspaceId: string, agentId: string, paths: string[]): Promise<AttachedDocs> {
    if (!(await this.deps.repo.agentExists(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    this.assertAttachmentPaths(paths);
    await this.deps.repo.replaceAgentDocs(agentId, paths);
    return { paths };
  }

  async getSkillDocs(workspaceId: string, skillId: string): Promise<AttachedDocs> {
    if (!(await this.deps.repo.skillExists(workspaceId, skillId))) throw new NotFoundError('Skill not found');
    return { paths: await this.deps.repo.getSkillDocs(skillId) };
  }

  async setSkillDocs(workspaceId: string, skillId: string, paths: string[]): Promise<AttachedDocs> {
    if (!(await this.deps.repo.skillExists(workspaceId, skillId))) throw new NotFoundError('Skill not found');
    this.assertAttachmentPaths(paths);
    await this.deps.repo.replaceSkillDocs(skillId, paths);
    return { paths };
  }

  // ---- effective context (preview + run executor) -------------------------

  async preview(workspaceId: string, agentId: string, repoId: string): Promise<EffectiveContextPreview> {
    if (!(await this.deps.repo.agentExists(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    const repo = await this.deps.repo.getRepoClone(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const resolved = await this.resolveEffective(workspaceId, agentId, repo.clonePath);
    const total_tokens = resolved.entries.reduce(
      (sum, e) => sum + (e.status === 'included' ? (e.tokens ?? 0) : 0),
      0,
    );
    return { cloned: resolved.cloned, documents: resolved.entries, total_tokens };
  }

  /**
   * §3.4 service surface. `workspaceId` is accepted for interface symmetry
   * with the rest of this service; the sub-queries it calls
   * (`getAgentDocs`/`linkedSkillDocs`) are scoped by `agentId` alone — the
   * caller (preview, or the run executor with an already-resolved agent) is
   * responsible for `agentId` belonging to the right workspace.
   */
  async resolveEffective(
    _workspaceId: string,
    agentId: string,
    clonePath: string | null,
  ): Promise<ResolvedProjectContext> {
    const agentPaths = await this.deps.repo.getAgentDocs(agentId);
    const skills = await this.deps.repo.linkedSkillDocs(agentId);
    const effectiveList = buildEffectiveList(agentPaths, skills);

    const textByPath = new Map<string, string>();
    const entries: EffectiveContextDoc[] = [];

    for (const { path, source } of effectiveList) {
      const bucket = bucketOf(path);

      if (!clonePath) {
        entries.push({ path, source, bucket, tokens: null, status: 'skipped_not_cloned' });
        continue;
      }
      if (!isUsableDocPath(path, this.deps.excludedDirs)) {
        entries.push({ path, source, bucket, tokens: null, status: 'skipped_missing' });
        continue;
      }

      const result = await this.deps.fs.read(clonePath, path);
      if (result.status !== 'ok') {
        const status =
          result.status === 'unsafe_path'
            ? 'skipped_unsafe_path'
            : result.status === 'unreadable'
              ? 'skipped_unreadable'
              : 'skipped_missing';
        entries.push({ path, source, bucket, tokens: null, status });
        continue;
      }
      const text = result.text;
      if (containsSecretValue(text)) {
        entries.push({ path, source, bucket, tokens: null, status: 'skipped_secret' });
        continue;
      }
      textByPath.set(path, text);
      entries.push({ path, source, bucket, tokens: this.deps.tokens.count(text), status: 'included' });
    }

    // AC-59: bucket order, effective-list order preserved within each bucket.
    const grouped = groupByBucket(entries).flatMap((g) => g.docs);
    const docs = grouped
      .filter((e) => e.status === 'included')
      .map((e) => ({ path: e.path, text: textByPath.get(e.path)! }));

    return { cloned: clonePath != null, entries: grouped, docs };
  }

  // ---- shared guards --------------------------------------------------------

  private assertSyntax(path: string): void {
    if (!isValidDocPathSyntax(path)) throw new ValidationError('Invalid document path');
  }

  /** UT-6 syntax (defense-in-depth; the route schema already checks this) + EC-17 duplicates. */
  private assertAttachmentPaths(paths: string[]): void {
    for (const path of paths) this.assertSyntax(path);
    if (new Set(paths).size !== paths.length) {
      throw new ValidationError('Duplicate path in attachment list');
    }
  }
}
