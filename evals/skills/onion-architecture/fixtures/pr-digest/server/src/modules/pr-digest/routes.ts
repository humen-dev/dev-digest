import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { DigestQuery, PrDigest } from './types.js';

/**
 *   GET /repos/:id/digest?days=7 → PrDigest (PRs updated in the window, their intent and file roles,
 *                                  plus the workspace's enabled skills)
 */
export default async function prDigestRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.prDigestService;

  app.get(
    '/repos/:id/digest',
    { schema: { params: IdParams, querystring: DigestQuery, response: { 200: PrDigest } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.build(workspaceId, req.params.id, req.query);
    },
  );
}
