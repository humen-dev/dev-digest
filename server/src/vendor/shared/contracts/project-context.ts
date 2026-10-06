import { z } from 'zod';

/**
 * Project Context (SPEC-01) — repository Markdown docs attached to agents and
 * skills and injected into every run as an untrusted `## Project context` block.
 */

export const ProjectDocStatus = z.enum(['included','skipped_missing','skipped_unreadable','skipped_secret','skipped_unsafe_path','skipped_not_cloned']);
export type ProjectDocStatus = z.infer<typeof ProjectDocStatus>;
export const ProjectDocument = z.object({ path: z.string(), bucket: z.string(), estimated_tokens: z.number().int(), used_by_agents: z.number().int() });
export type ProjectDocument = z.infer<typeof ProjectDocument>;
export const ProjectDocumentList = z.object({ cloned: z.boolean(), documents: z.array(ProjectDocument), total: z.number().int(), scanned_at: z.string() });
export type ProjectDocumentList = z.infer<typeof ProjectDocumentList>;
export const ProjectDocumentContent = z.object({ path: z.string(), bucket: z.string(), estimated_tokens: z.number().int(), text: z.string() });
export type ProjectDocumentContent = z.infer<typeof ProjectDocumentContent>;
export const ProjectDocUsageRef = z.object({ id: z.string().uuid(), name: z.string() });
export type ProjectDocUsageRef = z.infer<typeof ProjectDocUsageRef>;
export const ProjectDocumentUsage = z.object({ path: z.string(), agents: z.array(ProjectDocUsageRef), skills: z.array(ProjectDocUsageRef) });
export type ProjectDocumentUsage = z.infer<typeof ProjectDocumentUsage>;
export const SaveProjectDocumentBody = z.object({ path: z.string(), text: z.string() });
export type SaveProjectDocumentBody = z.infer<typeof SaveProjectDocumentBody>;
export const AttachedDocs = z.object({ paths: z.array(z.string()) });           // GET + PUT response
export type AttachedDocs = z.infer<typeof AttachedDocs>;
export const SetAttachedDocsBody = z.object({ paths: z.array(z.string()) });    // PUT body
export type SetAttachedDocsBody = z.infer<typeof SetAttachedDocsBody>;
export const ProjectContextEntry = z.object({ path: z.string(), source: z.string() /* 'agent' | `skill:${name}` */, tokens: z.number().int().nullable(), status: ProjectDocStatus });
export type ProjectContextEntry = z.infer<typeof ProjectContextEntry>;
export const EffectiveContextDoc = ProjectContextEntry.extend({ bucket: z.string() });
export type EffectiveContextDoc = z.infer<typeof EffectiveContextDoc>;
export const EffectiveContextPreview = z.object({ cloned: z.boolean(), documents: z.array(EffectiveContextDoc) /* grouped order */, total_tokens: z.number().int() /* sum of included tokens */ });
export type EffectiveContextPreview = z.infer<typeof EffectiveContextPreview>;
