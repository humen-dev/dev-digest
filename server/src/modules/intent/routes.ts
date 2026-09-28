import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * intent module — PR intent + scope classification (see server/specs/intent-layer.md).
 *   GET  /pulls/:id/intent  → PrIntentState (read-only; never calls a model)
 *   POST /pulls/:id/intent  → PrIntentState (fresh) — classifies (or re-classifies) synchronously;
 *                             concurrent calls for one PR share one in-flight classification.
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.intentService;

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getState(workspaceId, req.params.id);
  });

  app.post(
    '/pulls/:id/intent',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.detect(workspaceId, req.params.id, { logger: req.log });
    },
  );
}
