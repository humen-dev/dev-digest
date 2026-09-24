/* hooks/skills.ts — React Query hooks for the Skills feature (L02). Mirrors
   hooks/agents.ts exactly: hooks call `api` (src/lib/api.ts) directly — there is
   no useApiQuery/useApiMutation abstraction in this client (see client/INSIGHTS.md). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Agent,
  AgentSkillLink,
  Skill,
  SkillImportPreview,
  SkillSource,
  SkillType,
  SkillVersion,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">> & {
    /** Note attached to the version this save snapshots; ignored unless `body` changed. */
    version_message?: string | null;
  };
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

/** Version history, newest first (server-ordered). */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** Unified-diff patch comparing a past version's body against the current body. */
export function useSkillVersionDiff(id: string | null | undefined, version: number | null | undefined) {
  return useQuery({
    queryKey: ["skill-version-diff", id, version],
    queryFn: () => api.get<{ patch: string }>(`/skills/${id}/versions/${version}/diff`),
    enabled: !!id && version != null,
  });
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

/** Agents that have this skill linked — for the Stats tab. */
export function useSkillAgents(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-agents", id],
    queryFn: () => api.get<Agent[]>(`/skills/${id}/agents`),
    enabled: !!id,
  });
}

/** Debounced token count for an unsaved body edit (falls back to `body_tokens` from the DTO). */
export function useSkillTokens() {
  return useMutation({
    mutationFn: (body: string) => api.post<{ tokens: number }>("/skills/tokens", { body }),
  });
}

/** URL of a remote `.md` / `.zip` → preview (server downloads it; writes nothing). */
export function useImportUrlPreview() {
  return useMutation({
    mutationFn: (input: { url: string }) => api.post<SkillImportPreview>("/skills/import/url-preview", input),
  });
}

/** `.md` / `.zip` → preview (writes nothing). Confirming is a plain `useCreateSkill` call. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content_base64: string }) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

/** Skills linked to one agent, ordered — the agent side of the link table. */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** Full set-replace: `{ skill_ids }` in the desired order. */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: { agentId: string; skillIds: string[] }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (_data, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
      // agent_count on each Skill DTO changes too.
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
