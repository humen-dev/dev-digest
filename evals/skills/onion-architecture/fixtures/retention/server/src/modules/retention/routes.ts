import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RETENTION_JOB_KIND } from './constants.js';
import { PutRetentionPolicyBody, type RetentionJobPayload } from './types.js';

/**
 *   GET  /repos/:id/retention        → RetentionPolicy
 *   PUT  /repos/:id/retention        → { keepDays, keepLatestPerPr } → RetentionPolicy
 *   POST /repos/:id/retention/sweep  → 202 { jobId } (runs in the background)
 */
export default async function retentionRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.retentionService;

  container.jobs.register(RETENTION_JOB_KIND, async (payload) => {
    const { workspaceId, repoId } = payload as RetentionJobPayload;
    const result = await service.sweep(workspaceId, repoId);
    app.log.info({ repoId, ...result }, 'retention sweep finished');
  });

  app.get('/repos/:id/retention', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getPolicy(workspaceId, req.params.id);
  });

  app.put(
    '/repos/:id/retention',
    { schema: { params: IdParams, body: PutRetentionPolicyBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.putPolicy(workspaceId, req.params.id, req.body);
    },
  );

  app.post('/repos/:id/retention/sweep', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const payload: RetentionJobPayload = { workspaceId, repoId: req.params.id };
    const job = await container.jobs.enqueue(workspaceId, RETENTION_JOB_KIND, payload);
    return reply.code(202).send({ jobId: job.id });
  });
}
