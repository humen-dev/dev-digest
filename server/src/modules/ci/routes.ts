import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CiExport,
  CiExportInput,
  CiInstallation,
  CiPreview,
  CiRefreshInput,
  CiRefreshResult,
  CiRunsPage,
  CiRunsQuery,
  CiSecretStatus,
  CiTargetOption,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiSecretsQuery } from './types.js';

/**
 * CI module (SPEC-07, plan §3.7). Every route resolves the workspace first and
 * hands plain arguments to the service. `/ci/refresh` is added by the ingest unit.
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = () => container.ciService;

  app.get('/ci/targets', { schema: { response: { 200: z.array(CiTargetOption) } } }, async () =>
    service().listTargets(),
  );

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiExportInput, response: { 200: CiPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().preview(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/agents/:id/ci/secrets',
    { schema: { params: IdParams, querystring: CiSecretsQuery, response: { 200: z.array(CiSecretStatus) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().secrets(workspaceId, req.query.repo);
    },
  );

  app.post(
    '/agents/:id/export-ci',
    { schema: { params: IdParams, body: CiExportInput, response: { 200: CiExport, 201: CiExport } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const { status, body } = await service().exportToGithub(workspaceId, req.params.id, req.body);
      return reply.code(status).send(body);
    },
  );

  app.post(
    '/agents/:id/export-ci/archive',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const zip = await service().archive(workspaceId, req.params.id, req.body);
      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', 'attachment; filename="devdigest-ci.zip"')
        .send(Buffer.from(zip));
    },
  );

  app.get(
    '/agents/:id/ci/installations',
    { schema: { params: IdParams, response: { 200: z.array(CiInstallation) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().installations(workspaceId, req.params.id);
    },
  );

  app.get(
    '/ci/runs',
    { schema: { querystring: CiRunsQuery, response: { 200: CiRunsPage } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().runs(workspaceId, req.query);
    },
  );

  // The body is optional: an absent / null body means a non-forced refresh.
  app.post(
    '/ci/refresh',
    {
      schema: {
        body: CiRefreshInput.nullish().transform((b) => b ?? { force: false }),
        response: { 200: CiRefreshResult },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ciRefreshService.refresh(workspaceId, req.body.force, req.log);
    },
  );
}
