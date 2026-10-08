import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ContextPreviewQuery, DocPathQuery, SaveProjectDocumentRouteBody, SetAttachedDocsRouteBody } from './types.js';

/**
 * Project Context module (SPEC-01, §3.2). The request body limit (1 MiB,
 * `src/app.ts`) already covers UT-12 for the PUT content route — no
 * per-route override needed.
 *
 *   GET /repos/:id/project-docs                       → ProjectDocumentList
 *   GET /repos/:id/project-docs/content?path=          → ProjectDocumentContent
 *   PUT /repos/:id/project-docs/content                → ProjectDocumentContent (saved text)
 *   GET /repos/:id/project-docs/usage?path=            → ProjectDocumentUsage
 *   GET /agents/:id/context-docs                       → AttachedDocs
 *   PUT /agents/:id/context-docs                       → AttachedDocs
 *   GET /skills/:id/context-docs                        → AttachedDocs
 *   PUT /skills/:id/context-docs                        → AttachedDocs
 *   GET /agents/:id/context-preview?repo_id=            → EffectiveContextPreview
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = () => container.projectContextService;

  app.get('/repos/:id/project-docs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service().list(workspaceId, req.params.id);
  });

  app.get(
    '/repos/:id/project-docs/content',
    { schema: { params: IdParams, querystring: DocPathQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().read(workspaceId, req.params.id, req.query.path);
    },
  );

  app.put(
    '/repos/:id/project-docs/content',
    { schema: { params: IdParams, body: SaveProjectDocumentRouteBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().save(workspaceId, req.params.id, req.body.path, req.body.text);
    },
  );

  app.get(
    '/repos/:id/project-docs/usage',
    { schema: { params: IdParams, querystring: DocPathQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().usage(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get('/agents/:id/context-docs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service().getAgentDocs(workspaceId, req.params.id);
  });

  app.put(
    '/agents/:id/context-docs',
    { schema: { params: IdParams, body: SetAttachedDocsRouteBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().setAgentDocs(workspaceId, req.params.id, req.body.paths);
    },
  );

  app.get('/skills/:id/context-docs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service().getSkillDocs(workspaceId, req.params.id);
  });

  app.put(
    '/skills/:id/context-docs',
    { schema: { params: IdParams, body: SetAttachedDocsRouteBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().setSkillDocs(workspaceId, req.params.id, req.body.paths);
    },
  );

  app.get(
    '/agents/:id/context-preview',
    { schema: { params: IdParams, querystring: ContextPreviewQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().preview(workspaceId, req.params.id, req.query.repo_id);
    },
  );
}
