import type { Skill, SkillImportPreview, SkillVersion } from '@devdigest/shared';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { ValidationError } from '../../platform/errors.js';
import { extractSkillFromArchive } from './domain/parse-archive.js';
import { parseSkillMarkdown } from './domain/parse-markdown.js';
import { unifiedDiff } from './domain/diff.js';
import { MAX_IMPORT_BYTES } from './constants.js';
import { toSkillDto, toSkillVersionDto } from './mappers.js';
import type { AgentSummaryRow, SkillsRepositoryPort } from './ports.js';
import type { InsertSkill, UpdateSkill } from './types.js';

/**
 * Skills service — business logic for the `/skills` CRUD, version history,
 * and file import preview. Depends ONLY on the narrow `SkillsRepositoryPort`
 * + `Tokenizer` — NOT `Container` — so it stays out of the depcruise
 * dependency graph onto `platform/container.ts` (see `ports.ts`).
 */
export class SkillsService {
  constructor(
    private repo: SkillsRepositoryPort,
    private tokenizer: Tokenizer,
  ) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.listWithCounts(workspaceId);
    return rows.map((r) =>
      toSkillDto(r, { bodyTokens: this.tokenizer.count(r.body), agentCount: r.agentCount }),
    );
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    return this.toDto(row);
  }

  async create(workspaceId: string, input: Omit<InsertSkill, 'workspaceId'>): Promise<Skill> {
    const row = await this.repo.insert({ ...input, workspaceId });
    return this.toDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    if (!row) return undefined;
    return this.toDto(row);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /** Version history, newest first. `undefined` when the skill isn't in this workspace (→ 404). */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  /** Unified diff between an old version's body and the skill's CURRENT body. */
  async diff(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<{ patch: string } | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const old = await this.repo.getVersion(id, version);
    if (!old) return undefined;
    const patch = unifiedDiff(old.body, skill.body, { oldLabel: `v${version}`, newLabel: 'current' });
    return { patch };
  }

  /** Restore an old version's body as a NEW version (append-only history). */
  async restore(workspaceId: string, id: string, version: number): Promise<Skill | undefined> {
    const row = await this.repo.restoreVersion(workspaceId, id, version);
    if (!row) return undefined;
    return this.toDto(row);
  }

  /** Agents currently linking this skill (Stats tab). `undefined` → 404. */
  async agentsUsing(workspaceId: string, id: string): Promise<AgentSummaryRow[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return this.repo.agentsUsing(id);
  }

  /** Token count for an arbitrary (possibly unsaved) body — the editor's live counter. */
  tokens(body: string): number {
    return this.tokenizer.count(body);
  }

  /**
   * Parse an uploaded `.md` or `.zip` file into a preview draft. Writes
   * NOTHING to the database — saving happens via a normal `create()` call
   * with `source: 'imported_file'` once the user confirms the preview.
   */
  async importPreview(filename: string, contentBase64: string): Promise<SkillImportPreview> {
    let bytes: Buffer;
    try {
      bytes = Buffer.from(contentBase64, 'base64');
    } catch {
      throw new ValidationError('content_base64 is not valid base64.');
    }
    if (bytes.length === 0) throw new ValidationError('Uploaded file is empty.');
    if (bytes.length > MAX_IMPORT_BYTES) {
      throw new ValidationError(`File is too large (${bytes.length} > ${MAX_IMPORT_BYTES} bytes).`);
    }

    if (filename.toLowerCase().endsWith('.zip')) {
      const { draft, ignored_entries, warnings } = extractSkillFromArchive(bytes);
      return { draft, ignored_entries, warnings };
    }
    const { draft, warnings } = parseSkillMarkdown(bytes.toString('utf8'), filename);
    return { draft, ignored_entries: [], warnings };
  }

  private async toDto(row: Awaited<ReturnType<SkillsRepositoryPort['getById']>>): Promise<Skill> {
    // `getById` only returns undefined; callers here already checked for that.
    const r = row!;
    const agentCount = await this.repo.countAgents(r.id);
    return toSkillDto(r, { bodyTokens: this.tokenizer.count(r.body), agentCount });
  }
}
