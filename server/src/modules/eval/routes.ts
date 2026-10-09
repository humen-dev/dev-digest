import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalAgentDetail,
  EvalCase,
  EvalCaseDetail,
  EvalCaseInput,
  EvalCaseListItem,
  EvalCasePatch,
  EvalCompare,
  EvalCompareQuery,
  EvalDashboard,
  EvalRunAllResult,
  EvalRunDetail,
  EvalRunEstimate,
  EvalRunRecord,
  EvalRunStarted,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EVAL_RUN_RATE_LIMIT } from './constants.js';

/**
 * Eval module (SPEC-05, plan §3.4). Every route resolves the workspace first;
 * a foreign workspace's ids surface as 404 from the service.
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = () => container.evalService;

  app.post(
    '/findings/:id/eval-case',
    { schema: { params: IdParams, response: { 200: EvalCase, 201: EvalCase } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const { case: evalCase, created } = await service().createFromFinding(workspaceId, req.params.id);
      return reply.code(created ? 201 : 200).send(evalCase);
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCaseListItem) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseInput, response: { 201: EvalCase } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      return reply.code(201).send(await service().createManual(workspaceId, req.params.id, req.body));
    },
  );

  app.get(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: EvalCaseDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().getCaseDetail(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: EvalCasePatch, response: { 200: EvalCase } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().patchCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    await service().deleteCase(workspaceId, req.params.id);
    return reply.code(204).send();
  });

  app.get(
    '/agents/:id/eval-runs/estimate',
    { schema: { params: IdParams, response: { 200: EvalRunEstimate } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().estimate(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-runs',
    {
      schema: { params: IdParams, response: { 202: EvalRunStarted } },
      config: { rateLimit: EVAL_RUN_RATE_LIMIT },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      return reply.code(202).send(await service().startRun(workspaceId, req.params.id, req.log));
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: z.array(EvalRunRecord) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().listRuns(workspaceId, req.params.id);
    },
  );

  app.post(
    '/eval-runs/all',
    { schema: { response: { 200: EvalRunAllResult } }, config: { rateLimit: EVAL_RUN_RATE_LIMIT } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().runAll(workspaceId, req.log);
    },
  );

  app.get(
    '/eval-runs/compare',
    { schema: { querystring: EvalCompareQuery, response: { 200: EvalCompare } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().compare(workspaceId, req.query.a, req.query.b);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalRunDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().getRun(workspaceId, req.params.id);
    },
  );

  app.get('/eval/dashboard', { schema: { response: { 200: EvalDashboard } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service().dashboard(workspaceId);
  });

  app.get(
    '/eval/agents/:id',
    { schema: { params: IdParams, response: { 200: EvalAgentDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service().agentDetail(workspaceId, req.params.id);
    },
  );
}
