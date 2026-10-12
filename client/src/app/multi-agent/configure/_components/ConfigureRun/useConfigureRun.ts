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
  const { data: agents, isLoading: agentsLoading, isError: agentsError, refetch: refetchAgents } = useAgents();
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
  // An explicit pick is narrowed to agents that are still enabled after a refetch.
  const selected = picked
    ? picked.filter((id) => enabled.some((a) => a.id === id))
    : preselect(enabled, fromUrl.length > 0 ? fromUrl : remembered);
  const estimate = summariseEstimate(enabled, selected);
  const allSelected = enabled.length > 0 && selected.length === enabled.length;

  const toggle = (id: string) =>
    setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const setAll = (on: boolean) => setPicked(on ? enabled.map((a) => a.id) : []);

  // A start error (incl. a 409 in-flight link) belongs to the PR it was raised for:
  // switching PR clears it.
  const choosePr = (id: string) => {
    setPrId(id);
    // Never detach a start that is still in flight: its outcome must not be lost.
    if (!start.isPending) start.reset();
  };
  const inFlightId = inFlightRunId(start.error);
  const inFlightPrId = start.variables?.prId ?? null;

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
    setPrId: choosePr,
    agentsLoading,
    // Only a load that never succeeded is an error; cached agents stay usable on a failed refetch.
    agentsError: agentsError && !agents,
    retryAgents: () => void refetchAgents(),
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
    inFlightId,
    // The in-flight run lives on the PR the failed start was for, not the PR shown now.
    openInFlight: () => inFlightId && inFlightPrId && router.push(multiAgentResultsUrl(inFlightPrId, inFlightId)),
    latest: latest ?? null,
    openResults: (multiRunId?: string) => prId && router.push(multiAgentResultsUrl(prId, multiRunId)),
    goToAgents: () => router.push("/agents"),
  };
}
