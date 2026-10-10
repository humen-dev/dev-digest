import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, eq, isNull } from 'drizzle-orm';
import { watchlistEntries } from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AddWatchBody } from './types.js';

/**
 *   GET    /watchlist            → WatchEntry[]
 *   GET    /watchlist/unchecked  → WatchEntry[] never checked yet
 *   POST   /watchlist            → { repoId, prNumber, note? } → WatchEntry
 *   GET    /watchlist/:id/status → WatchStatus (live PR state from GitHub)
 *   DELETE /watchlist/:id        → 204
 */
export default async function watchlistRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.watchlistService;

  app.get('/watchlist', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.get('/watchlist/unchecked', async (req) => {
    const { workspaceId } = await getContext(container, req);
    const rows = await container.db
      .select()
      .from(watchlistEntries)
      .where(and(eq(watchlistEntries.workspaceId, workspaceId), isNull(watchlistEntries.checkedAt)));
    return rows.map((r) => ({
      id: r.id,
      repoId: r.repoId,
      prNumber: r.prNumber,
      note: r.note,
      lastSeenSha: r.lastSeenSha,
      createdAt: r.createdAt.toISOString(),
      checkedAt: null,
    }));
  });

  app.post('/watchlist', { schema: { body: AddWatchBody } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(container, req);
    const entry = await service.add(workspaceId, userId, req.body);
    return reply.code(201).send(entry);
  });

  app.get('/watchlist/:id/status', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.status(workspaceId, req.params.id);
  });

  app.delete('/watchlist/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    await service.remove(workspaceId, req.params.id);
    return reply.code(204).send();
  });
}
