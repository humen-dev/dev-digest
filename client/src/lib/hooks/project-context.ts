/* hooks/project-context.ts — React Query hooks for SPEC-01 Project Context:
   the repo's Markdown document list, per-document content/usage, the ordered
   attachment lists an agent/skill owns, and the agent's effective-context
   preview. Mirrors hooks/agents.ts: hooks call `api` (src/lib/api.ts) directly
   — there is no useApiQuery/useApiMutation abstraction in this client (see
   client/INSIGHTS.md). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AttachedDocs,
  EffectiveContextPreview,
  ProjectDocumentContent,
  ProjectDocumentList,
  ProjectDocumentUsage,
} from "@devdigest/shared";

export const agentContextDocsKey = (agentId: string | null | undefined) =>
  ["agent-context-docs", agentId] as const;
export const skillContextDocsKey = (skillId: string | null | undefined) =>
  ["skill-context-docs", skillId] as const;
/** Partial key (no `repoId`) so a setter can invalidate every repo's preview for one agent. */
export const agentContextPreviewKey = (agentId: string | null | undefined, repoId?: string | null) =>
  repoId != null ? (["agent-context-preview", agentId, repoId] as const) : (["agent-context-preview", agentId] as const);

/** Repo-relative Markdown docs found in the clone working tree (≤ 500, path
 *  order). Rescanned on every mount — the list is never cached stale across a
 *  resync (AC-12). */
export function useProjectDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["project-docs", repoId],
    queryFn: () => api.get<ProjectDocumentList>(`/repos/${repoId}/project-docs`),
    enabled: !!repoId,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

/** One document's current working-tree text (Project Context page editor). */
export function useProjectDoc(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["project-doc", repoId, path],
    queryFn: () =>
      api.get<ProjectDocumentContent>(
        `/repos/${repoId}/project-docs/content?path=${encodeURIComponent(path ?? "")}`,
      ),
    enabled: !!repoId && !!path,
  });
}

/** Agents/skills that currently attach this document (Project Context page usage panel). */
export function useProjectDocUsage(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["project-doc-usage", repoId, path],
    queryFn: () =>
      api.get<ProjectDocumentUsage>(
        `/repos/${repoId}/project-docs/usage?path=${encodeURIComponent(path ?? "")}`,
      ),
    enabled: !!repoId && !!path,
  });
}

/** Overwrite an existing project document's text (AC-65 / AC-66). */
export function useSaveProjectDoc(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, text }: { path: string; text: string }) =>
      api.put<ProjectDocumentContent>(`/repos/${repoId}/project-docs/content`, { path, text }),
    onSuccess: (data) => {
      qc.setQueryData(["project-doc", repoId, data.path], data);
      qc.invalidateQueries({ queryKey: ["project-docs", repoId] });
    },
  });
}

/** An agent's ordered attachment list (its side of the Context tab). */
export function useAgentContextDocs(agentId: string | null | undefined) {
  return useQuery({
    queryKey: agentContextDocsKey(agentId),
    queryFn: () => api.get<AttachedDocs>(`/agents/${agentId}/context-docs`),
    enabled: !!agentId,
  });
}

/** Full set-replace of an agent's attachment list. Optimistic: the checkbox/order
 *  change is applied to the cache immediately (onMutate), rolled back on a
 *  failed save (onError, EC-11), and reconciled with the server afterwards
 *  (onSettled) — which also invalidates this agent's effective-context preview,
 *  at every repo it has been previewed against. */
export function useSetAgentContextDocs(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const key = agentContextDocsKey(agentId);
  return useMutation({
    mutationFn: (paths: string[]) => api.put<AttachedDocs>(`/agents/${agentId}/context-docs`, { paths }),
    onMutate: async (paths) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AttachedDocs>(key);
      qc.setQueryData<AttachedDocs>(key, { paths });
      return { previous };
    },
    onError: (_err, _paths, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: agentContextPreviewKey(agentId) });
    },
  });
}

/** A skill's ordered attachment list (its side of the Context tab). */
export function useSkillContextDocs(skillId: string | null | undefined) {
  return useQuery({
    queryKey: skillContextDocsKey(skillId),
    queryFn: () => api.get<AttachedDocs>(`/skills/${skillId}/context-docs`),
    enabled: !!skillId,
  });
}

/** Full set-replace of a skill's attachment list — same optimistic/rollback
 *  shape as `useSetAgentContextDocs`. Which agents link this skill is not known
 *  client-side, so every agent's effective-context preview is invalidated. */
export function useSetSkillContextDocs(skillId: string | null | undefined) {
  const qc = useQueryClient();
  const key = skillContextDocsKey(skillId);
  return useMutation({
    mutationFn: (paths: string[]) => api.put<AttachedDocs>(`/skills/${skillId}/context-docs`, { paths }),
    onMutate: async (paths) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AttachedDocs>(key);
      qc.setQueryData<AttachedDocs>(key, { paths });
      return { previous };
    },
    onError: (_err, _paths, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["agent-context-preview"] });
    },
  });
}

/** The agent's effective document list in one repo — grouped order, source,
 *  counted tokens and the status a run started now would assign. Invalidated
 *  by both `useSetAgentContextDocs` and `useSetSkillContextDocs`. */
export function useAgentContextPreview(agentId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: agentContextPreviewKey(agentId, repoId),
    queryFn: () => api.get<EffectiveContextPreview>(`/agents/${agentId}/context-preview?repo_id=${repoId}`),
    enabled: !!agentId && !!repoId,
  });
}
