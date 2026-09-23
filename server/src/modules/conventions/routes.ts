import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import {
  BulkStatusBody,
  CreateSkillFromConventionsBody,
  PatchConventionBody,
  SkillDraftBody,
} from './types.js';

/**
 * L02 — conventions extractor (see server/specs/conventions.md).
 *   GET   /repos/:id/conventions              → ConventionBoard
 *   POST  /repos/:id/conventions/extract      → scan (one model call) → ConventionBoard
 *   PATCH /repos/:id/conventions              → { ids, status } bulk triage → ConventionBoard
 *   PATCH /conventions/:id                     → { status?, rule?, rationale?, category? } → ConventionCandidate
 *   POST  /repos/:id/conventions/skill-draft  → { ids? } → ConventionSkillDraft (writes nothing)
 *   POST  /repos/:id/conventions/skill        → create ONE skill from accepted conventions → Skill
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.conventionsService;

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.board(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/repos/:id/conventions',
    { schema: { params: IdParams, body: BulkStatusBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.setStatusMany(workspaceId, req.params.id, req.body.ids, req.body.status);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: PatchConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: IdParams, body: SkillDraftBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.skillDraft(workspaceId, req.params.id, req.body?.ids);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillFromConventionsBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return skill;
    },
  );
}
