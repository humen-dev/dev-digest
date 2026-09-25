# Ports and adapters for external tools

Read this when adding, replacing or wrapping an external tool: GitHub, an LLM, git, ripgrep,
ast-grep, a tokenizer, a job queue.

## The tools and their seams

| Tool (package) | Port | Adapter (`src/adapters/…`) | Test double | Notes |
|---|---|---|---|---|
| GitHub (`octokit`) | `GitHubClient` | `github/octokit.ts` | `MockGitHubClient` | Token via `secrets.get('GITHUB_TOKEN')`; `container.github()` is async and throws `ConfigError` when unset |
| OpenAI / Anthropic (`openai`, `@anthropic-ai/sdk`) | `LLMProvider` | `llm/openai.ts`, `llm/anthropic.ts` | `MockLLMProvider` | OpenRouter lives in `reviewer-core`. Only OpenRouter reports real cost; the others return `estimateCost(...)` (INSIGHTS 2026-09-18) |
| Embeddings | `Embedder` | `embedder/openai.ts` | `MockEmbedder` | Gated by `config.embeddingsEnabled` — throws before any client is built |
| git (`simple-git`) | `GitClient` | `git/simple-git.ts` | `MockGitClient` | Diff parsing is pure (`git/diff-parser.ts`) |
| ripgrep (`@vscode/ripgrep`) | `CodeIndex` | `codeindex/ripgrep.ts` | `MockCodeIndex` | Fallback when the index is degraded |
| ast-grep (`@ast-grep/napi`) | (symbol extraction) | `astgrep/index.ts` | fixtures | Exact-pinned native binary |
| tokenizer (`js-tiktoken`) | `Tokenizer` | `tokenizer/index.ts` | inject fake | Port is declared beside the adapter today |
| import graph (`dependency-cruiser` as a library) | `DepGraph` | `depgraph/index.ts` | inject fake | Port declared beside the adapter today |
| secrets / auth | `SecretsProvider`, `AuthProvider` | `secrets/local.ts`, `auth/local.ts` | `MockSecretsProvider`, `MockAuthProvider` | Secrets **only** via `SecretsProvider` (`~/.devdigest/secrets.json`) |
| job queue (`p-queue`) | `JobRunner` (`platform/jobs.ts`) | — | — | Services enqueue by *kind*; nobody imports `p-queue` outside it (the indexer's `pipeline/full.ts` is the one exception) |
| graph maths (`graphology`) | none — pure computation | — | — | Allowed in `repo-intel/pipeline/rank.ts` |

The vendor SDK imports are already confined to `src/adapters/` (verified). The
`sdk-only-in-adapters` rule keeps it that way.

## Designing a port

- Name the **conversation the use case needs**, not the SDK call: `listPullRequests`, not
  `octokit.rest.pulls.list` (Cockburn 1.6, Graça 1.4).
- Parameters and results are `@devdigest/shared` contracts or plain data. **No SDK type in a
  signature** — if you cannot express it without one, the port is too close to the tool.
- Failures cross as `ExternalServiceError` / `ConfigError`, or as an explicit degraded result
  (see below) — never as a raw vendor exception.
- Secrets are read in the adapter/container, never passed through a service.
- One port per purpose; do not build a generic "ExternalService".

Where the port lives: shared across modules → `@devdigest/shared/adapters.ts` (**vendored: edit at
the source package, then re-vendor**); used by one module → that module's `ports.ts`. Prefer the
module-local port unless two modules really need it.

## The facade pattern — `repo-intel`

`modules/repo-intel/types.ts` is the model to copy when several tools serve one capability:
features import the `RepoIntel` interface, "never the libraries" (ast-grep, dependency-cruiser,
graphology, tokenizer). It also defines a **degraded contract**: object results carry
`degraded?: boolean`, array results return `[]`, and the reason is observable via `getIndexState()`.
Use the same idea when a tool can be unavailable: let the consumer fall back instead of throwing.

## Adding an adapter — checklist

1. Port (interface) in the right place; contract types only.
2. Real adapter in `src/adapters/<tool>/`, the **only** file that imports the SDK.
3. Fake in `src/adapters/mocks.ts` (deterministic, no network) and a contract test in
   `test/adapters.test.ts`.
4. Container getter + an `overrides` key in `ContainerOverrides` so tests inject the fake
   ([composition-root-and-di](composition-root-and-di.md)).
5. If it needs a secret: add the key to `SecretKey`, read it through `SecretsProvider`, and clear its
   cache in `invalidateSecretCaches()`.
6. Run depcruise — `sdk-only-in-adapters` and `adapters-not-into-modules` must stay green.

## Replacing a tool

Change the adapter and the container line that constructs it. If a service or route has to change,
the port leaked the old tool — fix the port first.
