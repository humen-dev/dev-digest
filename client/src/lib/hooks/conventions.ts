/* hooks/conventions.ts — React Query hooks for the Conventions extractor (L02).
   Hooks call `api` directly (no useApiQuery layer — see client/INSIGHTS.md).
   Mutation errors are toasted once by the global MutationCache. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionBoard,
  ConventionCandidate,
  ConventionCategory,
  ConventionSkillDraft,
  ConventionStatus,
  Skill,
  SkillType,
} from "@devdigest/shared";

const boardKey = (repoId: string) => ["conventions", repoId] as const;

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: boardKey(repoId ?? ""),
    queryFn: () => api.get<ConventionBoard>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** A scan costs a model call, so it is a mutation; its response replaces the cached board. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionBoard>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (board) => qc.setQueryData(boardKey(repoId), board),
  });
}

export interface ConventionPatch {
  status?: ConventionStatus;
  rule?: string;
  rationale?: string | null;
  category?: ConventionCategory;
}

/** Accept / Reject / inline Edit — patches the one card in the cached board. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionPatch }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (updated) =>
      qc.setQueryData<ConventionBoard>(boardKey(repoId), (board) =>
        board
          ? { ...board, candidates: board.candidates.map((c) => (c.id === updated.id ? updated : c)) }
          : board,
      ),
  });
}

export function useBulkUpdateConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: string[]; status: ConventionStatus }) =>
      api.patch<ConventionBoard>(`/repos/${repoId}/conventions`, input),
    onSuccess: (board) => qc.setQueryData(boardKey(repoId), board),
  });
}

/** Server-assembled draft from the accepted conventions; writes nothing, never cached after close. */
export function useConventionSkillDraft(repoId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["conventions", repoId, "skill-draft"],
    queryFn: () => api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`, {}),
    enabled,
    gcTime: 0,
    staleTime: 0,
  });
}

export interface CreateSkillFromConventionsInput {
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
  convention_ids: string[];
}

export function useCreateSkillFromConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillFromConventionsInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}
