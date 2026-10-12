"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useActiveRepo } from "@/lib/repo-context";
import { useAgents } from "@/lib/hooks/agents";
import { usePulls, usePullDetail } from "@/lib/hooks/core";
import { inFlightRunId, useLatestMultiAgentRunForPr, useStartMultiAgentRun } from "@/lib/hooks/multi-agent";
import { multiAgentResultsUrl } from "@/lib/multi-agent-urls";
import { preselect, readRememberedSelection, summariseEstimate } from "@/lib/multi-agent-selection";
import { parseAgentsParam } from "./helpers";

/** View logic of Configure run: the chosen PR and agents (preselected from
    `?prId` / `?agents` or the remembered selection) and starting the run. */
export function useConfigureRun() {
  const router = useRouter();
  const params = useSearchParams();
  const { repoId } = useActiveRepo();
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: pulls } = usePulls(repoId);
  const start = useStartMultiAgentRun();

  const [prId, setPrId] = React.useState<string | null>(params.get("prId"));
  const [picked, setPicked] = React.useState<string[] | null>(null);
  const [remembered] = React.useState(readRememberedSelection);

  const { data: detail } = usePullDetail(prId);
  const { data: latest } = useLatestMultiAgentRunForPr(prId);

  const prOptions = (pulls ?? []).flatMap((p) => (p.id ? [{ id: p.id, number: p.number, title: p.title }] : []));
  const pr = prOptions.find((p) => p.id === prId) ?? (detail ? { id: prId ?? "", number: detail.number, title: detail.title } : null);

  const enabled = (agents ?? []).filter((a) => a.enabled);
  const fromUrl = parseAgentsParam(params.get("agents"));
  const selected = picked ?? preselect(enabled, fromUrl.length > 0 ? fromUrl : remembered);
  const estimate = summariseEstimate(enabled, selected);
  const allSelected = enabled.length > 0 && selected.length === enabled.length;

  const toggle = (id: string) =>
    setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const setAll = (on: boolean) => setPicked(on ? enabled.map((a) => a.id) : []);

  const run = async () => {
    if (!prId || selected.length === 0) return;
    try {
      const res = await start.mutateAsync({ prId, agentIds: selected });
      router.push(multiAgentResultsUrl(prId, res.id));
    } catch {
      /* surfaced through start.error */
    }
  };

  return {
    prId,
    pr,
    prOptions,
    setPrId,
    agentsLoading,
    enabled,
    selected,
    estimate,
    allSelected,
    toggle,
    setAll,
    run,
    canRun: !!prId && selected.length > 0 && !start.isPending,
    isStarting: start.isPending,
    errorMessage: start.error ? start.error.message : null,
    inFlightId: inFlightRunId(start.error),
    latest: latest ?? null,
    openResults: (multiRunId?: string) => prId && router.push(multiAgentResultsUrl(prId, multiRunId)),
    goToAgents: () => router.push("/agents"),
  };
}
