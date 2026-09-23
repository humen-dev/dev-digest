import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/** `/skills/:id/versions/:version` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: SkillType,
  source: SkillSource.optional(),
  body: z.string().min(1),
  enabled: z.boolean().optional(),
});

/** Upper bound on the version note — a one-line summary, not a second body. */
const VERSION_MESSAGE_MAX = 200;

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  type: SkillType.optional(),
  source: SkillSource.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  /** Blank or whitespace-only is normalised to null at this boundary, not stored. */
  version_message: z
    .string()
    .max(VERSION_MESSAGE_MAX)
    .nullish()
    .transform((v) => {
      const trimmed = v?.trim();
      return trimmed ? trimmed : null;
    }),
});

const TokensBody = z.object({ body: z.string() });

const ImportPreviewBody = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
});

/** 4 MB — comfortably above the base64 encoding of `MAX_IMPORT_BYTES` (2 MB raw). */
const IMPORT_PREVIEW_BODY_LIMIT = 4 * 1024 * 1024;

/**
 * A1 — skills module.
 *   GET    /skills                              → list (workspace-scoped, with body_tokens + agent_count)
 *   GET    /skills/:id                           → one skill
 *   POST   /skills                                → create (source defaults to 'manual'); writes v1
 *   PUT    /skills/:id                            → update; a `body` change bumps version + snapshots
 *                                                    (with the optional `version_message` note)
 *   DELETE /skills/:id                            → delete (agent_skills cascade)
 *   GET    /skills/:id/versions                   → history, newest first
 *   GET    /skills/:id/versions/:version/diff     → unified diff vs the current body
 *   POST   /skills/:id/versions/:version/restore  → new version with the old body (append-only)
 *   GET    /skills/:id/agents                     → agents currently linking this skill
 *   POST   /skills/tokens                          → { body } → { tokens } (unsaved-editor counter)
 *   POST   /skills/import/preview                  → { filename, content_base64 } → SkillImportPreview
 *                                                    (writes NOTHING; bodyLimit 4MB on this route only)
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SkillsService(container.skillsRepo, container.tokenizer);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const { version_message: versionMessage, ...patch } = req.body;
      const skill = await service.update(workspaceId, req.params.id, { ...patch, versionMessage });
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get(
    '/skills/:id/versions/:version/diff',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.diff(workspaceId, req.params.id, req.params.version);
      if (!result) throw new NotFoundError('Skill or version not found');
      return result;
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const skill = await service.restore(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill or version not found');
      return skill;
    },
  );

  app.get('/skills/:id/agents', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const agents = await service.agentsUsing(workspaceId, req.params.id);
    if (!agents) throw new NotFoundError('Skill not found');
    return agents;
  });

  app.post('/skills/tokens', { schema: { body: TokensBody } }, async (req) => {
    await getContext(container, req);
    return { tokens: service.tokens(req.body.body) };
  });

  app.post(
    '/skills/import/preview',
    { schema: { body: ImportPreviewBody }, bodyLimit: IMPORT_PREVIEW_BODY_LIMIT },
    async (req) => {
      await getContext(container, req);
      return service.importPreview(req.body.filename, req.body.content_base64);
    },
  );
}
