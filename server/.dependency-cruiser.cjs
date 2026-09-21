/**
 * Architecture fitness rules for `@devdigest/api` — the mechanical half of the
 * `onion-architecture` skill (.claude/skills/onion-architecture/SKILL.md).
 *
 * Rings (inner → outer):
 *   1 domain        src/vendor/shared/**, modules/<m>/domain/**, constants.ts, types.ts
 *   2 application   modules/<m>/service*.ts + ports.ts (repository ports)
 *   3 infrastructure modules/<m>/repository*, modules/<m>/mappers.ts, src/db/**, src/adapters/**
 *   4 presentation  modules/<m>/routes.ts; composition root = platform/container.ts, app.ts
 *
 * Existing violations are recorded in `.dependency-cruiser-known-violations.json`
 * (the baseline) and ignored via `--ignore-known`; every NEW violation fails.
 * Shrink the baseline as modules migrate — never grow it. See
 * .claude/skills/onion-architecture/references/enforcement.md.
 *
 * Run:  pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known
 */

/** npm packages that belong to exactly one ring (matched on the resolved path; pnpm-safe). */
const npm = (names) => `(^|/)node_modules/(${names.join('|')})(/|$)`;

const ORM = ['drizzle-orm', 'postgres', 'drizzle-kit'];
const HTTP_FRAMEWORK = ['fastify', 'fastify-plugin', 'fastify-sse-v2', 'fastify-type-provider-zod', '@fastify/[^/]+'];
const SDKS = [
  'octokit',
  '@octokit/[^/]+',
  'openai',
  '@anthropic-ai/sdk',
  'simple-git',
  '@ast-grep/napi',
  'js-tiktoken',
  '@vscode/ripgrep',
];

/** Files that make up the inner rings of a feature module. */
const DOMAIN_FILES = [
  '^src/vendor/shared/',
  '^src/modules/[^/]+/domain/',
  '^src/modules/[^/]+/(constants|types)\\.ts$',
];
const PORT_FILES = ['^src/modules/[^/]+/ports\\.ts$'];
const SERVICE_FILES = ['^src/modules/[^/]+/(service|[^/]+\\.service)\\.ts$'];

/** Module files that may talk to Drizzle: only the repository (file or folder). */
const REPOSITORY = '^src/modules/[^/]+/repository(\\.ts$|/)';
/** Row → contract mappers live beside the repository and legitimately know the row type. */
const MAPPERS = '^src/modules/[^/]+/mappers\\.ts$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Cycles make the dependency direction unknowable. Break them with a port or by moving the shared piece inward.',
      from: { path: '^src' },
      to: { circular: true },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'Ring 1 (domain, ports) may not know a framework, ORM or SDK. It compiles and runs without Fastify, Postgres or the network.',
      from: { path: [...DOMAIN_FILES, ...PORT_FILES] },
      to: { path: [npm(HTTP_FRAMEWORK), npm(ORM), npm(SDKS)] },
    },
    {
      name: 'domain-no-outer-layers',
      severity: 'error',
      comment:
        'Ring 1/2 contracts may not import db, adapters, the container or another ring\'s files. Depend on a port instead.',
      from: { path: [...DOMAIN_FILES, ...PORT_FILES] },
      to: {
        path: [
          '^src/db/',
          '^src/adapters/',
          '^src/platform/container\\.ts$',
          '^src/modules/[^/]+/(routes|service|repository)',
        ],
      },
    },
    {
      name: 'service-no-http-framework',
      severity: 'error',
      comment: 'Services are use cases: no FastifyRequest/Reply, no HTTP framework. The route translates HTTP to plain arguments.',
      from: { path: SERVICE_FILES },
      to: { path: npm(HTTP_FRAMEWORK) },
    },
    {
      name: 'orm-only-in-repositories',
      severity: 'error',
      comment:
        'Only a module\'s repository and its mappers.ts (row types) may import db/schema or db/rows; only the repository may import drizzle-orm. Routes, services and helpers get data through a port and never see rows.',
      from: { path: '^src/modules/', pathNot: [REPOSITORY, MAPPERS] },
      to: { path: ['^src/db/', npm(ORM)] },
    },
    {
      name: 'mappers-no-orm-library',
      severity: 'error',
      comment:
        'mappers.ts knows the row SHAPE (type imports from db/schema or db/rows) but must not use the ORM itself — no queries, no drizzle-orm. Queries belong in repository.ts.',
      from: { path: MAPPERS },
      to: { path: npm(ORM) },
    },
    {
      name: 'inner-not-to-container',
      severity: 'error',
      comment:
        'Passing the whole Container into a service is a service locator. Inject the narrow ports the use case needs; the composition root wires them.',
      from: {
        path: '^src/modules/',
        pathNot: ['^src/modules/[^/]+/routes\\.ts$', '^src/modules/_shared/', '^src/modules/index\\.ts$'],
      },
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'inner-not-to-routes',
      severity: 'error',
      comment: 'Application and infrastructure code never import the presentation layer.',
      from: { path: ['^src/modules/[^/]+/(service|repository|ports)', '^src/modules/[^/]+/domain/'] },
      to: { path: '^src/modules/[^/]+/routes\\.ts$' },
    },
    {
      name: 'no-import-of-module-registry',
      severity: 'error',
      comment: 'modules/index.ts is the composition list of every route plugin. Only app.ts imports it; a module importing the registry re-couples itself to all its siblings.',
      from: { path: '^src/modules/', pathNot: '^src/modules/index\\.ts$' },
      to: { path: '^src/modules/index\\.ts$' },
    },
    {
      name: 'sdk-only-in-adapters',
      severity: 'error',
      comment:
        'Vendor SDKs (Octokit, OpenAI, Anthropic, simple-git, ast-grep, tiktoken, ripgrep) live behind a port in src/adapters/. Their types never cross the boundary.',
      from: { path: '^src', pathNot: '^src/adapters/' },
      to: { path: npm(SDKS) },
    },
    {
      name: 'adapters-not-into-modules',
      severity: 'error',
      comment: 'Infrastructure implements ports owned by the core; it must not reach into feature modules. Move the shared constant/type inward (domain or @devdigest/shared).',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        'A module\'s public surface is index.ts / ports.ts / types.ts. Do not import another module\'s routes, service, helpers, constants or repository — depend on its port or promote the shared piece.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: [
          '^src/modules/$1/',
          '^src/modules/_shared/',
          '^src/modules/[^/]+/(index|ports|types)\\.ts$',
        ],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // The reviewer-core alias resolves to ../reviewer-core/src — a separate package
    // with its own rules. Keep it out of this graph.
    exclude: { path: '^\\.\\./reviewer-core' },
    tsConfig: { fileName: 'tsconfig.json' },
    // Also see `import type` edges: a leaked `import type { AgentRow }` is still a
    // dependency on the infrastructure ring.
    tsPreCompilationDeps: true,
    moduleSystems: ['es6', 'cjs'],
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
