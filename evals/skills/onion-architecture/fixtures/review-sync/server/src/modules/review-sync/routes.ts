import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { StartSyncBody } from './types.js';

/**
 *   POST /reviews/:id/sync        → { prId } → SyncRun (posts the review's findings as PR comments)
 *   GET  /review-sync/:id         → SyncRun
 *   POST /review-sync/:id/resync  → { missing } (marks comments deleted on GitHub)
 */
export default async function reviewSyncRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.reviewSyncService;

  app.post(
    '/reviews/:id/sync',
    { schema: { params: IdParams, body: StartSyncBody }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const run = await service.sync(workspaceId, req.params.id, req.body.prId);
      return reply.code(201).send(run);
    },
  );

  app.get('/review-sync/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getRun(workspaceId, req.params.id);
  });

  app.post('/review-sync/:id/resync', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.resync(workspaceId, req.params.id);
  });
}
