import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { LinearIssueTracker } from '../../adapters/linear/linear-issue-tracker.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IssueLinksService } from './service.js';

/**
 *   GET /pulls/:id/issues → PullIssueLinks (Linear issues referenced by branch/title/body)
 */
export default async function issueLinksRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const service = new IssueLinksService({
    tracker: new LinearIssueTracker(process.env.LINEAR_API_KEY ?? ''),
    pulls: container.pullsRepo,
  });

  app.get('/pulls/:id/issues', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.forPull(workspaceId, req.params.id);
  });
}
