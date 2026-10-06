import type {
  AuthProvider,
  SecretsProvider,
  GitHubClient,
  GitClient,
  CodeIndex,
  Embedder,
  LLMProvider,
} from '@devdigest/shared';
import type { AppConfig } from './config.js';
import type { Db } from '../db/client.js';
import { JobRunner } from './jobs.js';
import { runBus, type RunBus } from './sse.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { LocalNoAuthProvider } from '../adapters/auth/local.js';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { SimpleGitClient } from '../adapters/git/simple-git.js';
import { RipgrepCodeIndex } from '../adapters/codeindex/ripgrep.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenAIEmbedder } from '../adapters/embedder/openai.js';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { estimateCost } from '../adapters/llm/pricing.js';
import { PriceBook } from './price-book.js';
import { ConfigError, NotFoundError } from './errors.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import { parseUnifiedDiff } from '../adapters/git/diff-parser.js';
import { SkillsRepository } from '../modules/skills/repository.js';
import { SkillsService } from '../modules/skills/service.js';
import { SettingsRepository } from '../modules/settings/repository.js';
import { FeatureModelResolver } from '../modules/settings/feature-models.service.js';
import { RepoRepository } from '../modules/repos/repository.js';
import { ConventionsRepository } from '../modules/conventions/repository.js';
import { ConventionsService } from '../modules/conventions/service.js';
import type { ConventionsRepositoryPort } from '../modules/conventions/ports.js';
import { IntentRepository } from '../modules/intent/repository.js';
import { IntentService } from '../modules/intent/service.js';
import type { IntentRepositoryPort } from '../modules/intent/ports.js';
import { SmartDiffRepository } from '../modules/smart-diff/repository.js';
import { SmartDiffService } from '../modules/smart-diff/service.js';
import type { SmartDiffRepositoryPort } from '../modules/smart-diff/ports.js';
import { BlastRepository } from '../modules/blast/repository.js';
import { BlastService } from '../modules/blast/service.js';
import type { BlastRepositoryPort } from '../modules/blast/ports.js';
import { PrHistoryRepository } from '../modules/pr-history/repository.js';
import { PrHistoryService } from '../modules/pr-history/service.js';
import type { PrHistoryRepositoryPort, PrHistorySourcePort } from '../modules/pr-history/ports.js';
import { OctokitPrHistorySource } from '../adapters/github/pr-history.js';
import { BFS_DEPTH, MAX_CALLERS_PER_SYMBOL } from '../modules/repo-intel/constants.js';
import type { RepoIntel } from '../modules/repo-intel/types.js';
import { RepoIntelService } from '../modules/repo-intel/service.js';
import { type DepGraph, DepCruiseGraph } from '../adapters/depgraph/index.js';
import { type Tokenizer, TiktokenTokenizer } from '../adapters/tokenizer/index.js';
import { type UrlFetcher, HttpUrlFetcher } from '../adapters/url-fetcher/index.js';
import { FsProjectDocs } from '../adapters/project-docs/index.js';
import { DrizzleProjectContextRepository } from '../modules/project-context/repository.js';
import { ProjectContextService } from '../modules/project-context/service.js';
import type { ProjectDocsFs } from '../modules/project-context/ports.js';
import { DrizzleOnboardingRepository } from '../modules/onboarding/repository.js';
import { OnboardingTourService } from '../modules/onboarding/service.js';
import type { OnboardingTourRepositoryPort, TourGitPort } from '../modules/onboarding/ports.js';
import { GENERATION_TIMEOUT_MS } from '../modules/onboarding/constants.js';
import { GitTreeReader } from '../adapters/git/tree.js';
import { loadPromptTemplate } from './prompts.js';
import { EXCLUDED_DIRS, MAX_FILE_SIZE } from '../modules/repo-intel/types.js';

/**
 * DI container. One per app instance. Holds config, db, the JobRunner,
 * the SSE bus, and lazily-constructed adapters resolved through SecretsProvider.
 *
 * Tests construct a container with `overrides` to inject mock adapters; the
 * Services depend on these interfaces, not the concrete classes.
 */
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  github?: GitHubClient;
  git?: GitClient;
  codeIndex?: CodeIndex;
  embedder?: Embedder;
  /** Pre-built providers by id (skip key lookup). */
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
  /** repo-intel facade (T1.1+) — tests inject mock RepoIntel implementations. */
  repoIntel?: RepoIntel;
  /** repo-intel T3 adapters — only the indexer pipeline reads these. */
  depgraph?: DepGraph;
  tokenizer?: Tokenizer;
  /** Remote skill-file downloader (Import from URL) — tests inject a stub. */
  urlFetcher?: UrlFetcher;
  /** Conventions persistence port — tests swap the port, not the service. */
  conventionsRepo?: ConventionsRepositoryPort;
  /** Intent persistence port — tests swap the port, not the service. */
  intentRepo?: IntentRepositoryPort;
  /** Smart-diff persistence port — tests swap the port, not the service. */
  smartDiffRepo?: SmartDiffRepositoryPort;
  /** Blast-radius persistence port — tests swap the port, not the service. */
  blastRepo?: BlastRepositoryPort;
  /** Prior-PR history persistence port — tests swap the port, not the service. */
  prHistoryRepo?: PrHistoryRepositoryPort;
  /** Prior-PR GitHub GraphQL source — tests inject a fake (never the network). */
  prHistorySource?: PrHistorySourcePort;
  /**
   * Project-docs filesystem adapter. Typed as the PORT (`ProjectDocsFs`), not
   * the concrete `FsProjectDocs` — `adapters-not-into-modules` forbids the
   * adapter from importing the port it implements, so this is the one place
   * that checks the shapes actually match (see `adapters/project-docs/index.ts`
   * file header).
   */
  projectDocsFs?: ProjectDocsFs;
  /** Onboarding-tour persistence port — tests swap the port, not the service. */
  onboardingRepo?: OnboardingTourRepositoryPort;
  /** Onboarding-tour git reader (listTrackedFiles + readFileAt) — tests inject a fake. */
  gitTree?: TourGitPort;
}

export class Container {
  readonly config: AppConfig;
  readonly db: Db;
  readonly secrets: SecretsProvider;
  readonly auth: AuthProvider;
  readonly jobs: JobRunner;
  readonly runBus: RunBus;

  private _git?: GitClient;
  private _github?: GitHubClient;
  private _codeIndex?: CodeIndex;
  private _embedder?: Embedder;
  private llmCache = new Map<string, LLMProvider>();

  // Shared repositories for cross-cutting entities (agents, reviews/pulls,
  // runs). Constructed here, in the composition root, so consuming modules use
  // `container.agentsRepo` instead of reaching into another module's folder.
  private _agentsRepo?: AgentsRepository;
  private _reviewRepo?: ReviewRepository;
  private _skillsRepo?: SkillsRepository;
  private _featureModels?: FeatureModelResolver;
  private _reposRepo?: RepoRepository;
  private _conventionsService?: ConventionsService;
  private _intentService?: IntentService;
  private _smartDiffService?: SmartDiffService;
  private _blastService?: BlastService;
  private _prHistoryService?: PrHistoryService;
  private _prHistorySource?: PrHistorySourcePort;
  private _repoIntel?: RepoIntel;
  private _depgraph?: DepGraph;
  private _tokenizer?: Tokenizer;
  private _urlFetcher?: UrlFetcher;
  private _priceBook?: PriceBook;
  private _projectDocsFs?: ProjectDocsFs;
  private _projectContextService?: ProjectContextService;
  private _gitTree?: TourGitPort;
  private _onboardingTourService?: OnboardingTourService;

  constructor(config: AppConfig, db: Db, private overrides: ContainerOverrides = {}) {
    this.config = config;
    this.db = db;
    this.secrets = overrides.secrets ?? new LocalSecretsProvider(config.secretsPath);
    this.auth = overrides.auth ?? new LocalNoAuthProvider(db);
    this.runBus = runBus;
    this.jobs = new JobRunner(db);
  }

  get git(): GitClient {
    if (this.overrides.git) return this.overrides.git;
    this._git ??= new SimpleGitClient(this.config.cloneDir);
    return this._git;
  }

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  get skillsRepo(): SkillsRepository {
    return (this._skillsRepo ??= new SkillsRepository(this.db));
  }

  /** Settings → Models: per-feature provider/model, workspace override else registry default. */
  get featureModels(): FeatureModelResolver {
    return (this._featureModels ??= new FeatureModelResolver(new SettingsRepository(this.db)));
  }

  get reposRepo(): RepoRepository {
    return (this._reposRepo ??= new RepoRepository(this.db));
  }

  /** L02 conventions extractor — the service receives narrow deps, never the container. */
  get conventionsService(): ConventionsService {
    return (this._conventionsService ??= new ConventionsService({
      conventions: this.overrides.conventionsRepo ?? new ConventionsRepository(this.db),
      repos: this.reposRepo,
      repoIntel: this.repoIntel,
      files: this.git,
      codeIndex: this.codeIndex,
      llm: (provider) => this.llm(provider),
      resolveModel: (workspaceId) => this.featureModels.resolve(workspaceId, 'conventions'),
      skills: new SkillsService(this.skillsRepo, this.tokenizer, this.urlFetcher),
      tokenizer: this.tokenizer,
    }));
  }

  /**
   * Intent layer — PR intent + scope classification (server/specs/intent-layer.md).
   * `loadDiff` re-implements `reviews`' `loadDiff` (server/src/modules/reviews/diff-loader.ts)
   * INLINE rather than importing it: that file type-imports `Container` itself, so importing
   * ANY of its exports from here closes a `container.ts -> diff-loader.ts -> container.ts`
   * cycle (depcruise `no-circular`, confirmed by running the check) — `intent` must not import
   * `reviews` internals either way. Same two-step behavior: real `git diff`, else reconstruct
   * from `pr_files.patch`.
   */
  get intentService(): IntentService {
    return (this._intentService ??= new IntentService({
      intents: this.overrides.intentRepo ?? new IntentRepository(this.db),
      github: () => this.github(),
      loadDiff: async (workspaceId, prId) => {
        const pull = await this.reviewRepo.getPull(workspaceId, prId);
        if (!pull) throw new NotFoundError('Pull request not found');
        const repoRow = await this.reviewRepo.getRepo(pull.repoId);
        if (!repoRow) throw new NotFoundError('Repo not found');
        try {
          const diff = await this.git.diff({ owner: repoRow.owner, name: repoRow.name }, pull.base, pull.headSha);
          if (diff.files.length > 0) return diff;
        } catch {
          /* fall through to pr_files reconstruction */
        }
        const files = await this.reviewRepo.getPrFiles(pull.id);
        const parts: string[] = [];
        for (const f of files) {
          if (!f.patch) continue;
          parts.push(`diff --git a/${f.path} b/${f.path}`, `--- a/${f.path}`, `+++ b/${f.path}`, f.patch);
        }
        return parseUnifiedDiff(parts.join('\n'));
      },
      files: this.git,
      urls: this.urlFetcher,
      linkAllowlist: this.config.intentLinkAllowlist,
      llm: (provider) => this.llm(provider),
      resolveModel: (workspaceId) => this.featureModels.resolve(workspaceId, 'review_intent'),
      tokenizer: this.tokenizer,
    }));
  }

  /** Smart Diff — files-changed grouped by role (docs/plans/smart-diff.md). */
  get smartDiffService(): SmartDiffService {
    return (this._smartDiffService ??= new SmartDiffService({
      smartDiff: this.overrides.smartDiffRepo ?? new SmartDiffRepository(this.db),
    }));
  }

  /** Blast radius — what else a PR can affect (docs/plans/blast-radius.md). */
  get blastService(): BlastService {
    return (this._blastService ??= new BlastService({
      blast: this.overrides.blastRepo ?? new BlastRepository(this.db),
      intel: this.repoIntel,
      repoIntelEnabled: this.config.repoIntelEnabled,
      maxCallersPerSymbol: MAX_CALLERS_PER_SYMBOL,
      bfsDepth: BFS_DEPTH,
    }));
  }

  /** Prior PRs touching a PR's files — GitHub GraphQL behind a narrow port (docs/plans/blast-radius-p3.md). */
  get prHistoryService(): PrHistoryService {
    return (this._prHistoryService ??= new PrHistoryService({
      pulls: this.overrides.prHistoryRepo ?? new PrHistoryRepository(this.db),
      github: () => this.prHistorySource(),
    }));
  }

  get codeIndex(): CodeIndex {
    if (this.overrides.codeIndex) return this.overrides.codeIndex;
    this._codeIndex ??= new RipgrepCodeIndex(this.git);
    return this._codeIndex;
  }

  /**
   * The repo-intel facade (T1.1). All higher-level features (reviews,
   * blast/onboarding migrations, phantom-gate) code against this interface.
   * Tests inject a mock via `ContainerOverrides.repoIntel`.
   */
  get repoIntel(): RepoIntel {
    if (this.overrides.repoIntel) return this.overrides.repoIntel;
    this._repoIntel ??= new RepoIntelService(this);
    return this._repoIntel;
  }

  /** Import-graph builder (dependency-cruiser). T3 indexer pipeline only. */
  get depgraph(): DepGraph {
    if (this.overrides.depgraph) return this.overrides.depgraph;
    this._depgraph ??= new DepCruiseGraph();
    return this._depgraph;
  }

  /** Downloader for the skills "Import from URL" flow. */
  get urlFetcher(): UrlFetcher {
    if (this.overrides.urlFetcher) return this.overrides.urlFetcher;
    this._urlFetcher ??= new HttpUrlFetcher();
    return this._urlFetcher;
  }

  /** Token counter (js-tiktoken) for the repo-map budget search. */
  get tokenizer(): Tokenizer {
    if (this.overrides.tokenizer) return this.overrides.tokenizer;
    this._tokenizer ??= new TiktokenTokenizer();
    return this._tokenizer;
  }

  /** Project-docs filesystem adapter (SPEC-01) — walk/read/write repo Markdown docs. */
  get projectDocsFs(): ProjectDocsFs {
    if (this.overrides.projectDocsFs) return this.overrides.projectDocsFs;
    this._projectDocsFs ??= new FsProjectDocs();
    return this._projectDocsFs;
  }

  /**
   * Project Context — attachments, documents and the effective-context
   * preview (SPEC-01). `tokens` reuses the `tokenizer` getter: `TokenCounter`
   * (ports.ts) and `Tokenizer` (adapters/tokenizer) are the same
   * `{ count(text): number }` shape.
   */
  get projectContextService(): ProjectContextService {
    return (this._projectContextService ??= new ProjectContextService({
      repo: new DrizzleProjectContextRepository(this.db),
      fs: this.projectDocsFs,
      tokens: this.tokenizer,
      excludedDirs: this.config.projectDocsExcludedDirs,
    }));
  }

  /**
   * Onboarding-tour git reader: `listTrackedFiles` (GitTreeReader —
   * `git ls-tree` at an arbitrary ref, adapters/git/tree.ts) merged with
   * `readFileAt` (the existing `GitClient`, same clone-path convention) into
   * the one structural `TourGitPort` the service depends on.
   */
  get gitTree(): TourGitPort {
    if (this.overrides.gitTree) return this.overrides.gitTree;
    if (!this._gitTree) {
      const reader = new GitTreeReader(this.config.cloneDir);
      const git = this.git;
      this._gitTree = {
        listTrackedFiles: (repo, ref) => reader.listTrackedFiles(repo, ref),
        readFileAt: (repo, ref, path) => git.readFileAt(repo, ref, path),
      };
    }
    return this._gitTree;
  }

  /** Onboarding tour — grounded five-section tour of an indexed repo (SPEC-03). */
  get onboardingTourService(): OnboardingTourService {
    return (this._onboardingTourService ??= new OnboardingTourService({
      onboarding: this.overrides.onboardingRepo ?? new DrizzleOnboardingRepository(this.db),
      repos: this.reposRepo,
      git: this.gitTree,
      repoIntel: this.repoIntel,
      llm: (provider) => this.llm(provider),
      resolveModel: (workspaceId) => this.featureModels.resolve(workspaceId, 'onboarding'),
      tokenizer: this.tokenizer,
      loadSystemPrompt: () => loadPromptTemplate('onboarding.system.md'),
      excludedDirs: [...EXCLUDED_DIRS, ...this.config.projectDocsExcludedDirs],
      maxFileBytes: MAX_FILE_SIZE,
      timeoutMs: GENERATION_TIMEOUT_MS,
    }));
  }

  /**
   * Live OpenRouter pricing for cost attribution. The lister builds a bare
   * OpenRouter provider just for `/models` (no estimator needed) and degrades to
   * `[]` when no key is configured; the static `estimateCost` table is the
   * fallback for OpenAI/Anthropic and a cold/cold-failed cache.
   */
  get priceBook(): PriceBook {
    this._priceBook ??= new PriceBook(async () => {
      try {
        const key = await this.secrets.get('OPENROUTER_API_KEY');
        if (!key) return [];
        return await new OpenRouterProvider(key).listModels();
      } catch {
        return [];
      }
    }, estimateCost);
    return this._priceBook;
  }

  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github;
    if (this._github) return this._github;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._github = new OctokitGitHubClient(token);
    return this._github;
  }

  async prHistorySource(): Promise<PrHistorySourcePort> {
    if (this.overrides.prHistorySource) return this.overrides.prHistorySource;
    if (this._prHistorySource) return this._prHistorySource;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._prHistorySource = new OctokitPrHistorySource(token);
    return this._prHistorySource;
  }

  /** Resolve an LLM provider by id; constructs from the secret key, cached. */
  async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    const cached = this.llmCache.get(id);
    if (cached) return cached;
    const provider = await this.buildLlm(id);
    this.llmCache.set(id, provider);
    return provider;
  }

  private async buildLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    if (id === 'openai') {
      const key = await this.secrets.get('OPENAI_API_KEY');
      if (!key) throw new ConfigError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key);
    }
    if (id === 'openrouter') {
      // Single OpenRouter provider lives in reviewer-core (shared with the CI
      // runner); inject the PriceBook so cost attribution uses LIVE OpenRouter
      // prices (with the static table as a fallback) rather than a hardcoded one.
      const key = await this.secrets.get('OPENROUTER_API_KEY');
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, {
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    }
    const key = await this.secrets.get('ANTHROPIC_API_KEY');
    if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key);
  }

  async embedder(): Promise<Embedder> {
    // Injected embedders (tests) always win. Otherwise embeddings are gated by
    // config: when disabled we throw BEFORE constructing the OpenAI client, so
    // the app makes ZERO OpenAI requests. All callers wrap this in try/catch and
    // degrade gracefully (memory/RAG simply returns no hits).
    if (this.overrides.embedder) return this.overrides.embedder;
    if (!this.config.embeddingsEnabled) {
      throw new ConfigError('Embeddings are disabled (set EMBEDDINGS_ENABLED=true to enable memory/RAG)');
    }
    if (this._embedder) return this._embedder;
    const openai = await this.llm('openai');
    this._embedder = new OpenAIEmbedder(openai);
    return this._embedder;
  }

  /**
   * Drop cached provider clients so the next resolve picks up changed secrets.
   * Call after persisting a new API key/PAT via SecretsProvider.set.
   */
  invalidateSecretCaches(): void {
    this.llmCache.clear();
    this._github = undefined;
    this._prHistorySource = undefined;
    this._embedder = undefined;
  }
}
