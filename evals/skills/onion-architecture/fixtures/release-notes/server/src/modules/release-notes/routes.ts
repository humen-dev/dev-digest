import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { GenerateReleaseNotesBody } from './types.js';

/**
 *   GET  /repos/:id/release-notes          → ReleaseNote[]
 *   POST /repos/:id/release-notes          → { fromRef, toRef } → ReleaseNote (draft)
 *   POST /release-notes/:id/publish        → ReleaseNote (published)
 */
export default async function releaseNotesRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.releaseNotesService;

  app.get('/repos/:id/release-notes', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/release-notes',
    { schema: { params: IdParams, body: GenerateReleaseNotesBody } },
    async (req, reply) => {
      const { userId } = await getContext(container, req);
      const note = await service.generate(req, userId);
      return reply.code(201).send(note);
    },
  );

  app.post('/release-notes/:id/publish', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.publish(workspaceId, req.params.id);
  });
}
