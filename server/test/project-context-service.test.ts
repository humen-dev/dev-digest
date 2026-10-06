/**
 * ProjectContextService — pure unit tests (fake `ProjectContextRepository` +
 * `ProjectDocsFs` + `TokenCounter`, no DB, no real filesystem). DB-backed
 * behavior (replace/read order, usage joins, EC-12, EC-14) and real-fs
 * behavior (AC-66, AC-67, AC-69, UT-12) live in `project-context.it.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import { NotFoundError, ValidationError } from '../src/platform/errors.js';
import type {
  DocOwnerRef,
  DocReadResult,
  DocWriteResult,
  LinkedSkillDocs,
  ProjectContextRepository,
  ProjectDocsFs,
  TokenCounter,
  WalkedDoc,
} from '../src/modules/project-context/ports.js';

const WORKSPACE = 'ws-1';
const REPO_ID = 'repo-1';
const AGENT_ID = 'agent-1';
const SKILL_ID = 'skill-1';
const CLONE = '/fake/clone';

/** In-memory fake repository — mirrors what Drizzle's `DrizzleProjectContextRepository` would do. */
class FakeRepo implements ProjectContextRepository {
  repoClone: { id: string; clonePath: string | null } | null = { id: REPO_ID, clonePath: CLONE };
  agentIds = new Set([AGENT_ID]);
  skillIds = new Set([SKILL_ID]);
  agentDocs: string[] = [];
  skillDocs: string[] = [];
  linkedSkills: LinkedSkillDocs[] = [];
  agentCounts = new Map<string, number>();
  usage: { agents: DocOwnerRef[]; skills: DocOwnerRef[] } = { agents: [], skills: [] };

  async getRepoClone() {
    return this.repoClone;
  }
  async agentExists(_ws: string, id: string) {
    return this.agentIds.has(id);
  }
  async skillExists(_ws: string, id: string) {
    return this.skillIds.has(id);
  }
  async getAgentDocs() {
    return this.agentDocs;
  }
  async replaceAgentDocs(_agentId: string, paths: string[]) {
    this.agentDocs = paths;
  }
  async getSkillDocs() {
    return this.skillDocs;
  }
  async replaceSkillDocs(_skillId: string, paths: string[]) {
    this.skillDocs = paths;
  }
  async linkedSkillDocs() {
    return this.linkedSkills;
  }
  async agentCountsByPath() {
    return this.agentCounts;
  }
  async usageByPath() {
    return this.usage;
  }
}

/** In-memory fake fs — files map path → text; `unsafePaths` simulate a symlink escape (UT-7). */
class FakeFs implements ProjectDocsFs {
  files = new Map<string, string>();
  unsafePaths = new Set<string>();
  walkResult: WalkedDoc[] = [];
  lastWalkExcludedDirs: readonly string[] = [];

  async walk(_root: string, excludedDirNames: readonly string[]) {
    this.lastWalkExcludedDirs = excludedDirNames;
    return this.walkResult;
  }
  async read(_root: string, relPath: string): Promise<DocReadResult> {
    if (this.unsafePaths.has(relPath)) return { status: 'unsafe_path' };
    const text = this.files.get(relPath);
    if (text === undefined) return { status: 'missing' };
    return { status: 'ok', text };
  }
  async write(_root: string, relPath: string, text: string): Promise<DocWriteResult> {
    if (this.unsafePaths.has(relPath)) return { status: 'unsafe_path' };
    if (!this.files.has(relPath)) return { status: 'missing' };
    this.files.set(relPath, text);
    return { status: 'ok' };
  }
}

class FakeTokens implements TokenCounter {
  count(text: string) {
    return text.length; // deterministic, distinguishable from the byte-size heuristic
  }
}

function makeService(repo: FakeRepo, fs: FakeFs, excludedDirs: string[] = []) {
  return new ProjectContextService({ repo, fs, tokens: new FakeTokens(), excludedDirs });
}

describe('ProjectContextService.list — AC-2, AC-5, EC-1, EC-5', () => {
  let repo: FakeRepo;
  let fs: FakeFs;

  beforeEach(() => {
    repo = new FakeRepo();
    fs = new FakeFs();
  });

  it('returns path, bucket, estimated tokens and used-by count for every walked doc — AC-2', async () => {
    fs.walkResult = [
      { path: 'README.md', sizeBytes: 40 },
      { path: 'docs/a.md', sizeBytes: 8 },
      { path: 'specs/b.md', sizeBytes: 400 },
    ];
    repo.agentCounts = new Map([['README.md', 2]]);
    const service = makeService(repo, fs);

    const result = await service.list(WORKSPACE, REPO_ID);
    expect(result.cloned).toBe(true);
    expect(result.total).toBe(3);
    expect(result.documents).toEqual([
      { path: 'README.md', bucket: 'root', estimated_tokens: 10, used_by_agents: 2 },
      { path: 'docs/a.md', bucket: 'docs', estimated_tokens: 2, used_by_agents: 0 },
      { path: 'specs/b.md', bucket: 'specs', estimated_tokens: 100, used_by_agents: 0 },
    ]);
  });

  it('forwards the configured excluded dir names to the fs walk — AC-5 (wiring half)', async () => {
    const service = makeService(repo, fs, ['dist', 'vendor']);
    await service.list(WORKSPACE, REPO_ID);
    expect(fs.lastWalkExcludedDirs).toEqual(['dist', 'vendor']);
  });

  it('returns cloned: false and an empty list when the repo has no clone — EC-1', async () => {
    repo.repoClone = { id: REPO_ID, clonePath: null };
    const service = makeService(repo, fs);
    const result = await service.list(WORKSPACE, REPO_ID);
    expect(result).toMatchObject({ cloned: false, documents: [], total: 0 });
  });

  it('404s for a repo outside the workspace', async () => {
    repo.repoClone = null;
    const service = makeService(repo, fs);
    await expect(service.list(WORKSPACE, REPO_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('caps at 500 docs but reports the true total — EC-5', async () => {
    fs.walkResult = Array.from({ length: 600 }, (_, i) => ({ path: `docs/f${i}.md`, sizeBytes: 4 }));
    const service = makeService(repo, fs);
    const result = await service.list(WORKSPACE, REPO_ID);
    expect(result.documents).toHaveLength(500);
    expect(result.total).toBe(600);
  });
});

describe('ProjectContextService.read / save — UT-6, UT-7, AC-66, AC-69', () => {
  let repo: FakeRepo;
  let fs: FakeFs;

  beforeEach(() => {
    repo = new FakeRepo();
    fs = new FakeFs();
    fs.files.set('docs/a.md', 'hello');
  });

  it.each([
    ['absolute path', '/etc/secrets.md'],
    ['drive letter', 'C:\\notes.md'],
    ['parent traversal', '../outside.md'],
    ['NUL byte', 'notes\0.md'],
    ['wrong extension', 'notes.txt'],
  ])('rejects a hostile path on read with 422, no fs call — %s', async (_label, path) => {
    const service = makeService(repo, fs);
    await expect(service.read(WORKSPACE, REPO_ID, path)).rejects.toBeInstanceOf(ValidationError);
    expect(fs.files.has(path)).toBe(false);
  });

  it.each([
    ['absolute path', '/etc/secrets.md'],
    ['drive letter', 'C:\\notes.md'],
    ['parent traversal', '../outside.md'],
    ['NUL byte', 'notes\0.md'],
    ['wrong extension', 'notes.txt'],
  ])('rejects a hostile path on save with 422, no file written — %s', async (_label, path) => {
    const service = makeService(repo, fs);
    await expect(service.save(WORKSPACE, REPO_ID, path, 'x')).rejects.toBeInstanceOf(ValidationError);
    expect(fs.files.has(path)).toBe(false);
  });

  it('returns the saved text and bucket on a successful save — AC-66', async () => {
    const service = makeService(repo, fs);
    const result = await service.save(WORKSPACE, REPO_ID, 'docs/a.md', 'new text');
    expect(result).toMatchObject({ path: 'docs/a.md', bucket: 'docs', text: 'new text' });
    expect(fs.files.get('docs/a.md')).toBe('new text');
  });

  it('404s saving a path that is not an existing project document — AC-69', async () => {
    const service = makeService(repo, fs);
    await expect(service.save(WORKSPACE, REPO_ID, 'docs/new.md', 'x')).rejects.toBeInstanceOf(NotFoundError);
    expect(fs.files.has('docs/new.md')).toBe(false);
  });

  it('404s saving inside a dot-directory (excluded) — AC-69', async () => {
    const service = makeService(repo, fs);
    await expect(service.save(WORKSPACE, REPO_ID, '.github/x.md', 'x')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s read/save on an uncloned repo', async () => {
    repo.repoClone = { id: REPO_ID, clonePath: null };
    const service = makeService(repo, fs);
    await expect(service.read(WORKSPACE, REPO_ID, 'docs/a.md')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.save(WORKSPACE, REPO_ID, 'docs/a.md', 'x')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('422s a symlink escape on read and save — UT-7', async () => {
    fs.unsafePaths.add('docs/a.md');
    const service = makeService(repo, fs);
    await expect(service.read(WORKSPACE, REPO_ID, 'docs/a.md')).rejects.toBeInstanceOf(ValidationError);
    await expect(service.save(WORKSPACE, REPO_ID, 'docs/a.md', 'x')).rejects.toBeInstanceOf(ValidationError);
  });

  it('two sequential saves: the second write wins — EC-24', async () => {
    const service = makeService(repo, fs);
    await service.save(WORKSPACE, REPO_ID, 'docs/a.md', 'first');
    await service.save(WORKSPACE, REPO_ID, 'docs/a.md', 'second');
    expect(fs.files.get('docs/a.md')).toBe('second');
  });
});

describe('ProjectContextService attachments — EC-17', () => {
  let repo: FakeRepo;
  let fs: FakeFs;

  beforeEach(() => {
    repo = new FakeRepo();
    fs = new FakeFs();
  });

  it('replaces an agent\'s attachments in the given order', async () => {
    const service = makeService(repo, fs);
    const result = await service.setAgentDocs(WORKSPACE, AGENT_ID, ['b.md', 'a.md']);
    expect(result.paths).toEqual(['b.md', 'a.md']);
    expect(repo.agentDocs).toEqual(['b.md', 'a.md']);
  });

  it('replaces a skill\'s attachments in the given order', async () => {
    const service = makeService(repo, fs);
    const result = await service.setSkillDocs(WORKSPACE, SKILL_ID, ['b.md', 'a.md']);
    expect(result.paths).toEqual(['b.md', 'a.md']);
    expect(repo.skillDocs).toEqual(['b.md', 'a.md']);
  });

  it('rejects a duplicate path in an agent attachment list with 422', async () => {
    const service = makeService(repo, fs);
    await expect(service.setAgentDocs(WORKSPACE, AGENT_ID, ['a.md', 'a.md'])).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('rejects a duplicate path in a skill attachment list with 422', async () => {
    const service = makeService(repo, fs);
    await expect(service.setSkillDocs(WORKSPACE, SKILL_ID, ['a.md', 'a.md'])).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('404s an agent outside the workspace', async () => {
    const service = makeService(repo, fs);
    await expect(service.getAgentDocs(WORKSPACE, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.setAgentDocs(WORKSPACE, 'nope', ['a.md'])).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s a skill outside the workspace', async () => {
    const service = makeService(repo, fs);
    await expect(service.getSkillDocs(WORKSPACE, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.setSkillDocs(WORKSPACE, 'nope', ['a.md'])).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ProjectContextService.resolveEffective / preview — AC-33, AC-59, EC-2, EC-3, EC-20, NFR-2', () => {
  let repo: FakeRepo;
  let fs: FakeFs;

  beforeEach(() => {
    repo = new FakeRepo();
    fs = new FakeFs();
  });

  it('every entry is skipped_not_cloned when clonePath is null — EC-2', async () => {
    repo.agentDocs = ['README.md', 'docs/a.md'];
    const service = makeService(repo, fs);
    const result = await service.resolveEffective(WORKSPACE, AGENT_ID, null);
    expect(result.cloned).toBe(false);
    expect(result.entries.every((e) => e.status === 'skipped_not_cloned')).toBe(true);
    expect(result.docs).toEqual([]);
  });

  it('a deleted attachment is skipped_missing and the run continues — EC-3, EC-20', async () => {
    repo.agentDocs = ['docs/gone.md', 'docs/here.md'];
    fs.files.set('docs/here.md', 'present');
    const service = makeService(repo, fs);
    const result = await service.resolveEffective(WORKSPACE, AGENT_ID, CLONE);
    const byPath = new Map(result.entries.map((e) => [e.path, e]));
    expect(byPath.get('docs/gone.md')?.status).toBe('skipped_missing');
    expect(byPath.get('docs/here.md')?.status).toBe('included');
    expect(result.docs).toEqual([{ path: 'docs/here.md', text: 'present' }]);
  });

  it('groups by bucket, preserving effective-list order within each bucket — AC-59', async () => {
    repo.agentDocs = ['README.md', 'insights/a.md', 'client/x.md'];
    repo.linkedSkills = [{ skillName: 'my-skill', enabled: true, body: 'rules', paths: ['docs/c.md', 'specs/d.md'] }];
    for (const p of ['README.md', 'insights/a.md', 'client/x.md', 'docs/c.md', 'specs/d.md']) fs.files.set(p, p);
    const service = makeService(repo, fs);

    const result = await service.resolveEffective(WORKSPACE, AGENT_ID, CLONE);
    expect(result.entries.map((e) => e.path)).toEqual([
      'specs/d.md',
      'docs/c.md',
      'insights/a.md',
      'client/x.md',
      'README.md',
    ]);
  });

  it('preview: included + skipped_missing in grouped order, with counted tokens — AC-33', async () => {
    repo.agentDocs = ['docs/present.md', 'docs/absent.md'];
    fs.files.set('docs/present.md', 'twelve chars');
    const service = makeService(repo, fs);

    const preview = await service.preview(WORKSPACE, AGENT_ID, REPO_ID);
    expect(preview.cloned).toBe(true);
    const present = preview.documents.find((d) => d.path === 'docs/present.md')!;
    const absent = preview.documents.find((d) => d.path === 'docs/absent.md')!;
    expect(present.status).toBe('included');
    expect(present.tokens).toBe('twelve chars'.length);
    expect(absent.status).toBe('skipped_missing');
    expect(absent.tokens).toBeNull();
    expect(preview.total_tokens).toBe('twelve chars'.length);
  });

  it('404s preview for an agent outside the workspace', async () => {
    const service = makeService(repo, fs);
    await expect(service.preview(WORKSPACE, 'nope', REPO_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s preview for a repo outside the workspace', async () => {
    repo.repoClone = null;
    const service = makeService(repo, fs);
    await expect(service.preview(WORKSPACE, AGENT_ID, REPO_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is deterministic: same inputs → identical output — NFR-2', async () => {
    repo.agentDocs = ['README.md', 'docs/a.md'];
    fs.files.set('README.md', 'x');
    fs.files.set('docs/a.md', 'y');
    const service = makeService(repo, fs);

    const first = await service.resolveEffective(WORKSPACE, AGENT_ID, CLONE);
    const second = await service.resolveEffective(WORKSPACE, AGENT_ID, CLONE);
    expect(second).toEqual(first);
  });
});

describe('ProjectContextService usage — AC-9', () => {
  it('reports the agents and skills that directly attach a path', async () => {
    const repo = new FakeRepo();
    const fs = new FakeFs();
    repo.usage = { agents: [{ id: AGENT_ID, name: 'Agent One' }], skills: [{ id: SKILL_ID, name: 'Skill One' }] };
    const service = makeService(repo, fs);

    const result = await service.usage(WORKSPACE, REPO_ID, 'docs/a.md');
    expect(result.agents.map((a) => a.name)).toEqual(['Agent One']);
    expect(result.skills.map((s) => s.name)).toEqual(['Skill One']);
  });
});

describe('ProjectContextService — NFR-4 (no document text in logs)', () => {
  it('never passes the document text to a console/log call', async () => {
    const repo = new FakeRepo();
    const fs = new FakeFs();
    const sentinel = 'TOP-SECRET-SENTINEL-4f8c';
    fs.files.set('docs/a.md', sentinel);
    repo.agentDocs = ['docs/a.md'];
    const service = makeService(repo, fs);

    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    try {
      await service.read(WORKSPACE, REPO_ID, 'docs/a.md');
      await service.resolveEffective(WORKSPACE, AGENT_ID, CLONE);
      await service.preview(WORKSPACE, AGENT_ID, REPO_ID);
      for (const spy of spies) {
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call)).not.toContain(sentinel);
        }
      }
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
