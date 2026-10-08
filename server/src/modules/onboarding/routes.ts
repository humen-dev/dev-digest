import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Onboarding-tour module (SPEC-03, §3.2).
 *   GET  /repos/:id/tour           → OnboardingTourState (read-only; never calls a model)
 *   POST /repos/:id/tour/generate  → OnboardingTour — synchronous, single-flight per repo
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = () => container.onboardingTourService;

  app.get('/repos/:id/tour', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service().getState(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/tour/generate',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().generate(workspaceId, req.params.id, req.log);
    },
  );
}
