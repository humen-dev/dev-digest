# Composition root and dependency injection

Read this when replacing a `Container` parameter, adding a container getter, or wiring a new
service, repository or adapter.

## What the container is — and is not

`platform/container.ts` is the **composition root**: the one place where concrete classes meet the
abstractions that rings 1–2 declare (Graça 1.4: "configure which adapter implements which port at
the composition root"). It constructs lazily, resolves secrets, and accepts `overrides` so tests
inject fakes instead of monkey-patching.

It is **not** a bag every service reaches into. Passing the whole `Container` to a service is a
service locator: the constructor signature no longer says what the use case depends on, and any test
must build a container to run it. Today `ReviewService`, `RepoService`, `AgentsService` and
`RepoIntelService` all do this — it is baselined drift (`inner-not-to-container`).

## Target shape

```ts
// service.ts — depends on what it uses, nothing else
export interface PullServiceDeps {
  pulls: PullRepository;                       // port (ports.ts)
  github: () => Promise<GitHubClient>;         // lazily resolved: may be missing / rotated
  jobs: Pick<JobRunner, 'enqueue'>;
}
export class PullService {
  constructor(private readonly deps: PullServiceDeps) {}
}

// platform/container.ts — the only place that builds it
get pullService(): PullService {
  return (this._pullService ??= new PullService({
    pulls: new DrizzlePullRepository(this.db),
    github: () => this.github(),
    jobs: this.jobs,
  }));
}

// routes.ts — consumes, never constructs
const service = app.container.pullService;
```

Two details worth keeping:

- **Async deps as functions.** `github()`, `llm(id)` and `embedder()` read secrets, may throw
  `ConfigError`, and are cached until `invalidateSecretCaches()` runs after a key changes. Injecting
  the *function* keeps that behaviour; injecting the resolved client would freeze a stale one.
- **`Pick<…>` for wide collaborators** (`JobRunner`) so the service declares the slice it uses.

## Migrating a service off `Container`

1. List what the service actually reads from `container` (`db`, `jobs`, `github()`, `secrets`, …).
2. Declare `<Name>Deps` with exactly those, as ports or `Pick<>`s.
3. Put persistence behind a port (`ports.ts`) if the service builds a repository itself
   (`new ReviewRepository(container.db)` inside the constructor is the tell).
4. Add the container getter; delete the `new Service(container)` calls in routes.
5. Tests: construct the service with fakes directly — no `buildApp`, no Docker.
6. Run depcruise, regenerate the baseline, confirm it shrank ([enforcement](enforcement.md)).

Do this **per service, when you are already changing it** — not as a sweep. `RepoIntelService` is the
hard one: `container.repoIntel` builds it with `this`, and the container ↔ service import cycle shows
up in the baseline. Breaking it is exactly the same fix: pass deps instead of `this`.

## Rules

- `new <Adapter>()` and `new <Repository>(db)` appear only in `platform/container.ts` and tests.
- Rings 1–2 never import the `Container` type. Routes reach it as `app.container`.
- Getters stay logic-free: construct, cache, return. Anything with branching or I/O belongs in an
  adapter (the inline `priceBook` lister is borderline — do not copy that style).
- Every adapter getter honours its `overrides` key first, so a test can replace it. A service getter
  does the same for the **repository port** it builds: add a `<name>Repo?: <Name>Repository` key to
  `ContainerOverrides` and write `this.overrides.<name>Repo ?? new Drizzle<Name>Repository(this.db)`.
  Tests then swap the port, not the service (`buildApp({ overrides: { notificationRepo: fake } })`).
- Adding a dependency to a service means adding it to `Deps` and to the getter — one visible diff.

## Job handlers

Handlers are registered on `container.jobs` by kind (`registerCloneJobHandler`,
`registerIndexJobHandlers`). Keep the handler body in the service (a use case), keep the payload type in
`types.ts`, and enqueue by kind from wherever the trigger is. The queue library (`p-queue`) stays
behind `JobRunner`.
