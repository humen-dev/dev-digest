import type {
  ConventionBoard,
  ConventionCandidate,
  ConventionSkillDraft,
  ConventionStatus,
  RepoRef,
  Skill,
} from '@devdigest/shared';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import {
  CODE_FILE_MAX_CHARS,
  CODE_FILE_MAX_LINES,
  CONFIG_FILE_MAX_CHARS,
  CONFIG_SAMPLE_PATHS,
  DEDUPE_JACCARD,
  DIVERSITY_EXTRA,
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_SCHEMA_NAME,
  EXTRACTION_TEMPERATURE,
  EXTRACTION_TIMEOUT_MS,
  GREP_CONCURRENCY,
  GREP_MAX_CANDIDATES,
  GREP_TIMEOUT_MS,
  GREP_TOTAL_BUDGET_MS,
  MAX_DECIDED_IN_PROMPT,
  RANK_POOL,
  RARE_MAX_FILES,
  SAMPLE_BUDGET_CHARS,
  TOP_SAMPLES,
} from './constants.js';
import { verifyCandidate } from './domain/evidence-gate.js';
import { chooseGrepLiteral, countDistinctFiles, toPortableRegex } from './domain/frequency.js';
import { ConventionExtraction, buildMessages, type DecidedRule } from './domain/prompt.js';
import {
  isSafeRelativePath,
  looksBinary,
  pickDiversityExtras,
  toPosix,
  truncateForSample,
} from './domain/sampling.js';
import { dedupeCandidates } from './domain/similarity.js';
import {
  assembleSkillBody,
  evidenceFilesOf,
  skillDescriptionFor,
  skillNameFor,
  type SkillConvention,
} from './domain/skill-body.js';
import { toConventionDto, toScanDto } from './mappers.js';
import type { ConventionPatch, ConventionRow, ConventionsDeps, RepoBasics } from './ports.js';
import type { CreateSkillFromConventionsBody, SampledFile, VerifiedCandidate } from './types.js';

/**
 * Conventions extractor — SAMPLE (code) → PROPOSE (one model call) → GATE,
 * DEDUPE, FREQUENCY (code) → persist as `pending`. Then triage and merge the
 * accepted rows into one skill. See server/specs/conventions.md.
 */
export class ConventionsService {
  /** One scan per repo at a time (single-process lock; a job queue is on the roadmap). */
  private readonly inFlight = new Set<string>();

  constructor(private readonly deps: ConventionsDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoBasics> {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  async board(workspaceId: string, repoId: string): Promise<ConventionBoard> {
    await this.requireRepo(workspaceId, repoId);
    const [rows, scan] = await Promise.all([
      this.deps.conventions.listByRepo(workspaceId, repoId),
      this.deps.conventions.latestScan(workspaceId, repoId),
    ]);
    return { candidates: rows.map(toConventionDto), last_scan: scan ? toScanDto(scan) : null };
  }

  async update(workspaceId: string, id: string, patch: ConventionPatch): Promise<ConventionCandidate> {
    const row = await this.deps.conventions.update(workspaceId, id, patch);
    if (!row) throw new NotFoundError('Convention not found');
    return toConventionDto(row);
  }

  async setStatusMany(
    workspaceId: string,
    repoId: string,
    ids: string[],
    status: ConventionStatus,
  ): Promise<ConventionBoard> {
    await this.requireRepo(workspaceId, repoId);
    await this.deps.conventions.setStatusMany(workspaceId, repoId, ids, status);
    return this.board(workspaceId, repoId);
  }

  // ------------------------------------------------------------------ extract

  async extract(workspaceId: string, repoId: string): Promise<ConventionBoard> {
    const lockKey = `${workspaceId}:${repoId}`;
    if (this.inFlight.has(lockKey)) {
      throw new AppError('scan_in_progress', 'A scan of this repo is already running.', 409);
    }
    this.inFlight.add(lockKey);
    try {
      await this.runExtraction(workspaceId, repoId);
    } finally {
      this.inFlight.delete(lockKey);
    }
    return this.board(workspaceId, repoId);
  }

  private async runExtraction(workspaceId: string, repoId: string): Promise<void> {
    const started = this.now();
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) {
      throw new AppError(
        'repo_not_cloned',
        `${repo.fullName} has no local clone. Clone and index it first, then run the scan.`,
        422,
      );
    }
    const ref: RepoRef = { owner: repo.owner, name: repo.name };

    // 1. SAMPLE — code only.
    const samples = await this.sample(repoId, ref);
    const files = new Map(samples.map((f) => [f.path, f.content]));
    const headSha = await this.deps.files.currentHead(ref).catch(() => null);

    // 2. Decided rules steer the model away from what the maintainer already judged.
    const existing = await this.deps.conventions.listByRepo(workspaceId, repoId);
    const decided = existing
      .filter((r) => r.status !== 'pending')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const decidedForPrompt: DecidedRule[] = decided
      .slice(0, MAX_DECIDED_IN_PROMPT)
      .map((r) => ({ rule: r.rule, status: r.status as DecidedRule['status'] }));

    // 3. PROPOSE — the one model call.
    const choice = await this.deps.resolveModel(workspaceId);
    const llm = await this.deps.llm(choice.provider).catch((err: unknown) => {
      if (err instanceof ConfigError) {
        throw new AppError(
          'model_not_configured',
          `${err.message}. Add the key in Settings → API keys, or pick another model in Settings → Models → Conventions.`,
          422,
        );
      }
      throw err;
    });
    const result = await llm.completeStructured({
      model: choice.model,
      schema: ConventionExtraction,
      schemaName: EXTRACTION_SCHEMA_NAME,
      messages: buildMessages(repo.fullName, samples, decidedForPrompt),
      temperature: EXTRACTION_TEMPERATURE,
      maxTokens: EXTRACTION_MAX_TOKENS,
      timeoutMs: EXTRACTION_TIMEOUT_MS,
    });
    const proposed = result.data.conventions;

    // 4. GATE — code verifies every citation.
    const grounded: VerifiedCandidate[] = [];
    for (const p of proposed) {
      const r = verifyCandidate(p, files);
      if (r.ok) grounded.push(r.candidate);
    }
    grounded.sort((a, b) => b.confidence - a.confidence);

    // 5. DEDUPE — within the batch and against every decided rule.
    const { kept: unique, droppedDuplicate } = dedupeCandidates(
      grounded,
      decided.map((r) => r.rule),
      DEDUPE_JACCARD,
    );

    // 6. FREQUENCY — measured, not claimed.
    const { kept, droppedRare } = await this.measureFrequency(ref, unique, files);
    kept.sort(
      (a, b) =>
        (b.occurrences ?? -1) - (a.occurrences ?? -1) || b.confidence - a.confidence,
    );

    // 7. PERSIST — replace pending only; decided rows are never touched.
    await this.deps.conventions.replacePending(
      workspaceId,
      repoId,
      kept.map((c) => ({
        workspaceId,
        repoId,
        rule: c.rule,
        rationale: c.rationale,
        category: c.category,
        evidencePath: c.evidencePath,
        evidenceLine: c.evidenceLine,
        evidenceSnippet: c.evidenceSnippet,
        occurrences: c.occurrences,
        confidence: c.confidence,
      })),
      {
        workspaceId,
        repoId,
        sampledFiles: samples.map((f) => f.path),
        proposed: proposed.length,
        droppedUngrounded: proposed.length - grounded.length,
        droppedDuplicate,
        droppedRare,
        kept: kept.length,
        model: result.model || choice.model,
        // Real provider cost only — never the estimate (`costUsd`).
        apiCostUsd: result.apiCostUsd,
        headSha,
        durationMs: Math.max(0, Math.round(this.now() - started)),
      },
    );
  }

  /**
   * Configs + `repoIntel.getConventionSamples()` top files + diversity extras
   * (layers the top-N missed, tests included). Every path is checked before it
   * is read; files are truncated per file and to a total budget.
   */
  private async sample(repoId: string, ref: RepoRef): Promise<SampledFile[]> {
    const top = await this.deps.repoIntel.getConventionSamples(repoId, TOP_SAMPLES);
    if (top.length === 0) {
      throw new AppError(
        'repo_not_indexed',
        'This repo has no ranked files yet. Wait for indexing to finish (or re-index it), then run the scan.',
        422,
      );
    }
    const ranked = await this.deps.repoIntel.getRankedPaths(repoId, RANK_POOL);
    const extras = pickDiversityExtras(ranked, top, DIVERSITY_EXTRA);

    const out: SampledFile[] = [];
    let budget = SAMPLE_BUDGET_CHARS;
    const read = async (path: string): Promise<string | null> => {
      if (!isSafeRelativePath(path)) return null;
      const content = await this.deps.files.readFile(ref, path).catch(() => null);
      if (!content || !content.trim() || looksBinary(content)) return null;
      return content;
    };

    for (const path of CONFIG_SAMPLE_PATHS) {
      const content = await read(path);
      if (content === null) continue;
      const t = truncateForSample(content, { maxChars: CONFIG_FILE_MAX_CHARS });
      if (t.content.length > budget) continue;
      budget -= t.content.length;
      out.push({ path, kind: 'config', content: t.content, truncated: t.truncated });
    }

    let codeFiles = 0;
    for (const raw of [...top, ...extras]) {
      const path = toPosix(raw);
      if (out.some((f) => f.path === path)) continue;
      const content = await read(path);
      if (content === null) continue;
      const t = truncateForSample(content, { maxLines: CODE_FILE_MAX_LINES, maxChars: CODE_FILE_MAX_CHARS });
      if (t.content.length > budget) break;
      budget -= t.content.length;
      out.push({ path, kind: 'code', content: t.content, truncated: t.truncated });
      codeFiles++;
    }

    if (codeFiles === 0) {
      throw new AppError(
        'repo_not_readable',
        'None of the ranked files could be read from the clone. Re-clone the repo, then run the scan.',
        422,
      );
    }
    return out;
  }

  /**
   * Count how many files contain each candidate's literal (bounded ripgrep).
   * Failure / timeout / no literal → `occurrences: null` (kept, not penalized).
   * A MODEL-supplied literal found in only one file → dropped as rare.
   */
  private async measureFrequency(
    ref: RepoRef,
    candidates: VerifiedCandidate[],
    files: ReadonlyMap<string, string>,
  ): Promise<{ kept: VerifiedCandidate[]; droppedRare: number }> {
    const deadline = this.now() + GREP_TOTAL_BUDGET_MS;
    const results: Array<{ occurrences: number | null; rare: boolean }> = candidates.map(() => ({
      occurrences: null,
      rare: false,
    }));

    const measureOne = async (i: number) => {
      const c = candidates[i]!;
      const literal = chooseGrepLiteral(c.grepLiteral, files.get(c.evidencePath) ?? '', c.evidenceSnippet);
      const remaining = deadline - this.now();
      if (!literal || remaining <= 0) return;
      try {
        const matches = await withTimeout(
          this.deps.codeIndex.grep(ref, toPortableRegex(literal.literal)),
          Math.min(GREP_TIMEOUT_MS, remaining),
        );
        const count = countDistinctFiles(matches);
        // 0 means the index could not even see the evidence file — unmeasured, not rare.
        if (count === 0) return;
        results[i] = { occurrences: count, rare: literal.source === 'model' && count <= RARE_MAX_FILES };
      } catch {
        // ripgrep missing / timed out / bad pattern — leave unmeasured.
      }
    };

    const queue = candidates.slice(0, GREP_MAX_CANDIDATES).map((_, i) => i);
    const workers = Array.from({ length: Math.min(GREP_CONCURRENCY, queue.length) }, async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) await measureOne(i);
    });
    await Promise.all(workers);

    const kept: VerifiedCandidate[] = [];
    let droppedRare = 0;
    candidates.forEach((c, i) => {
      const r = results[i]!;
      if (r.rare) droppedRare++;
      else kept.push({ ...c, occurrences: r.occurrences });
    });
    return { kept, droppedRare };
  }

  // ------------------------------------------------------------ skill merge

  private async acceptedRows(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    const rows = await this.deps.conventions.listByRepo(workspaceId, repoId);
    return rows.filter((r) => r.status === 'accepted');
  }

  /** Un-persisted skill assembled from accepted conventions (optionally a subset). */
  async skillDraft(workspaceId: string, repoId: string, ids?: string[]): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    let accepted = await this.acceptedRows(workspaceId, repoId);
    if (ids?.length) accepted = accepted.filter((r) => ids.includes(r.id));
    if (accepted.length === 0) {
      throw new AppError('no_accepted_conventions', 'Accept at least one convention first.', 422);
    }
    const name = skillNameFor(repo.name);
    const body = assembleSkillBody(name, repo.name, accepted.map(toSkillConvention));
    return {
      name,
      description: skillDescriptionFor(accepted.length, repo.name),
      type: 'convention',
      enabled: true,
      body,
      body_tokens: this.deps.tokenizer.count(body),
      evidence_files: evidenceFilesOf(accepted.map(toSkillConvention)),
      convention_ids: accepted.map((r) => r.id),
    };
  }

  /**
   * Persist ONE skill from the user-edited draft. Every referenced convention
   * must be accepted and belong to this repo. Linking to an agent happens on
   * the agent's Skills tab, not here.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateSkillFromConventionsBody,
  ): Promise<Skill> {
    await this.requireRepo(workspaceId, repoId);
    const accepted = new Map((await this.acceptedRows(workspaceId, repoId)).map((r) => [r.id, r]));
    const selected = input.convention_ids.map((id) => accepted.get(id));
    if (selected.some((r) => !r)) {
      throw new AppError(
        'conventions_not_accepted',
        'Every convention in the skill must be accepted and belong to this repo.',
        422,
      );
    }
    return this.deps.skills.create(workspaceId, {
      name: input.name,
      description: input.description,
      type: input.type,
      source: 'extracted',
      body: input.body,
      enabled: input.enabled,
      evidenceFiles: evidenceFilesOf((selected as ConventionRow[]).map(toSkillConvention)),
    });
  }
}

function toSkillConvention(r: ConventionRow): SkillConvention {
  return {
    rule: r.rule,
    rationale: r.rationale,
    category: r.category,
    evidencePath: r.evidencePath ?? '',
    evidenceLine: r.evidenceLine ?? 1,
    evidenceSnippet: r.evidenceSnippet ?? '',
    occurrences: r.occurrences,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
