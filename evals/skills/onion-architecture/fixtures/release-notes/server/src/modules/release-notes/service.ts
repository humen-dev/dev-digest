import type { FastifyRequest } from 'fastify';
import { Octokit } from '@octokit/rest';
import { and, eq } from 'drizzle-orm';
import type { RepoRef, SecretsProvider } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { ReleaseNotesRepositoryPort } from './ports.js';
import type { CommitSummary, GenerateReleaseNotesBody, ReleaseNote } from './types.js';

export interface ReleaseNotesDeps {
  repo: ReleaseNotesRepositoryPort;
  repos: { get(workspaceId: string, id: string): Promise<RepoRef | null> };
  secrets: SecretsProvider;
  db: Db;
}

const SECTION_ORDER = ['feat', 'fix', 'perf', 'refactor', 'docs', 'chore'] as const;

export class ReleaseNotesService {
  constructor(private readonly deps: ReleaseNotesDeps) {}

  list(workspaceId: string, repoId: string): Promise<ReleaseNote[]> {
    return this.deps.repo.listByRepo(workspaceId, repoId);
  }

  async generate(
    req: FastifyRequest<{ Params: { id: string }; Body: GenerateReleaseNotesBody }>,
    userId: string,
  ): Promise<ReleaseNote> {
    const workspaceId = String(req.headers['x-workspace-id']);
    const repoId = req.params.id;
    const { fromRef, toRef } = req.body;

    const repo = await this.deps.repos.get(workspaceId, repoId);
    if (!repo) throw new NotFoundError('repo', repoId);

    const commits = await this.compare(repo, fromRef, toRef);
    const markdown = renderMarkdown(fromRef, toRef, commits);
    return this.deps.repo.insert({ workspaceId, repoId, fromRef, toRef, markdown, createdBy: userId });
  }

  async publish(workspaceId: string, id: string): Promise<ReleaseNote> {
    const note = await this.deps.repo.get(workspaceId, id);
    if (!note) throw new NotFoundError('release note', id);
    if (note.status === 'published') throw new AppError('already published', 409);

    await this.deps.db.transaction(async (tx) => {
      await tx
        .update(t.releaseNotes)
        .set({ status: 'published', publishedAt: new Date() })
        .where(and(eq(t.releaseNotes.workspaceId, workspaceId), eq(t.releaseNotes.id, id)));
      await tx.insert(t.releaseNoteEvents).values({ workspaceId, releaseNoteId: id, kind: 'published' });
    });

    return (await this.deps.repo.get(workspaceId, id))!;
  }

  private async compare(repo: RepoRef, fromRef: string, toRef: string): Promise<CommitSummary[]> {
    const token = await this.deps.secrets.get('GITHUB_TOKEN');
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.repos.compareCommits({
      owner: repo.owner,
      repo: repo.name,
      base: fromRef,
      head: toRef,
    });
    return data.commits.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.author?.login ?? c.commit.author?.name ?? 'unknown',
    }));
  }
}

function renderMarkdown(fromRef: string, toRef: string, commits: CommitSummary[]): string {
  const groups = new Map<string, string[]>();
  for (const c of commits) {
    const firstLine = c.message.split('\n')[0] ?? '';
    const match = /^(\w+)(\(.+\))?!?:\s*(.+)$/.exec(firstLine);
    const type = match?.[1] ?? 'other';
    const text = match?.[3] ?? firstLine;
    const list = groups.get(type) ?? [];
    list.push(`- ${text} (${c.sha.slice(0, 7)}, @${c.author})`);
    groups.set(type, list);
  }
  const ordered = [...SECTION_ORDER, ...[...groups.keys()].filter((k) => !SECTION_ORDER.includes(k as never))];
  const sections = ordered
    .filter((k) => groups.has(k))
    .map((k) => `### ${k}\n\n${groups.get(k)!.join('\n')}`);
  return [`## ${fromRef}…${toRef}`, ...sections].join('\n\n');
}
