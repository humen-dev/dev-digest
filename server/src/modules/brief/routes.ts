import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BriefContextCandidates, BriefPage, GenerateBriefBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * PR Brief module (SPEC-04, plan §3.2).
 *   GET  /pulls/:id/brief                    → BriefPage (read-only; 0 LLM / 0 GitHub calls)
 *   POST /pulls/:id/brief                    → BriefPage (generate; rate limited)
 *   GET  /pulls/:id/brief/context-candidates → BriefContextCandidates
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = () => container.briefService;

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: BriefPage } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().getPage(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, body: GenerateBriefBody.nullish().transform((b) => b ?? {}), response: { 200: BriefPage } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().generate(workspaceId, req.params.id, req.body, req.log);
    },
  );

  app.get(
    '/pulls/:id/brief/context-candidates',
    { schema: { params: IdParams, response: { 200: BriefContextCandidates } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().candidates(workspaceId, req.params.id);
    },
  );
}
