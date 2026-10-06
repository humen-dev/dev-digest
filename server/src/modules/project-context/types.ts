import { z } from 'zod';
import { isValidDocPathSyntax } from './domain/paths.js';

/**
 * Module-local zod schemas (ring 1). `DocPath` is the one syntax guard shared
 * by every route that takes a project-doc path (UT-6): absolute, drive-letter,
 * `..`-segment, NUL-byte or non-`.md` paths fail validation BEFORE the
 * handler runs, which is what turns them into a 422 (via the zod type
 * provider) without ever touching the filesystem. `isValidDocPathSyntax`
 * lives in `domain/paths.ts` (U2) — this just wraps it for route schemas.
 */
export const DocPath = z.string().refine(isValidDocPathSyntax, { message: 'Invalid document path' });
export type DocPath = z.infer<typeof DocPath>;

/** `?path=` query for GET content / GET usage. */
export const DocPathQuery = z.object({ path: DocPath });
export type DocPathQuery = z.infer<typeof DocPathQuery>;

/** `PUT /repos/:id/project-docs/content` body. */
export const SaveProjectDocumentRouteBody = z.object({ path: DocPath, text: z.string() });
export type SaveProjectDocumentRouteBody = z.infer<typeof SaveProjectDocumentRouteBody>;

/** `PUT /agents/:id/context-docs` and `PUT /skills/:id/context-docs` body. Uniqueness (EC-17) is enforced by the service, not here. */
export const SetAttachedDocsRouteBody = z.object({ paths: z.array(DocPath) });
export type SetAttachedDocsRouteBody = z.infer<typeof SetAttachedDocsRouteBody>;

/** `?repo_id=` query for GET /agents/:id/context-preview. */
export const ContextPreviewQuery = z.object({ repo_id: z.string().uuid() });
export type ContextPreviewQuery = z.infer<typeof ContextPreviewQuery>;
