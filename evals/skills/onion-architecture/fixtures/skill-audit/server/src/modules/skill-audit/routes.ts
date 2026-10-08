import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BulkStatusBody } from '../conventions/types.js';
import { AuditReport } from './types.js';

/**
 *   POST  /repos/:id/skill-audit   → AuditReport (scan enabled skills for stale issue refs / missing evidence files)
 *   GET   /repos/:id/skill-audit   → AuditFinding[]
 *   PATCH /skill-audit/findings    → { ids, status } → AuditFinding[] (accepting drafts replacement skills)
 */
export default async function skillAuditRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.skillAuditService;

  app.post(
    '/repos/:id/skill-audit',
    { schema: { params: IdParams, response: { 200: AuditReport } }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.run(workspaceId, req.params.id);
    },
  );

  app.get('/repos/:id/skill-audit', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.patch('/skill-audit/findings', { schema: { body: BulkStatusBody } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.decide(workspaceId, req.body.ids, req.body.status);
  });
}
