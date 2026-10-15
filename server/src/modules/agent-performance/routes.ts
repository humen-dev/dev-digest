import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AgentPerf, AgentStats } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PerfQuery } from './types.js';

/**
 * Agent Performance (SPEC-09): two read-only GETs. `/agents/performance` is a
 * static segment, so it wins over the agents module's `/agents/:id`.
 */
export default async function agentPerformanceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = () => container.agentPerformanceService;

  app.get(
    '/agents/performance',
    { schema: { querystring: PerfQuery, response: { 200: AgentPerf } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().performance(workspaceId, req.query);
    },
  );

  app.get(
    '/agents/:id/stats',
    { schema: { params: IdParams, querystring: PerfQuery, response: { 200: AgentStats } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().stats(workspaceId, req.params.id, req.query);
    },
  );
}
