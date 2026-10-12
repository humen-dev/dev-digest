"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { Agent } from "@devdigest/shared";
import { useAgents } from "@/lib/hooks/agents";
import { inFlightRunId, useStartMultiAgentRun } from "@/lib/hooks/multi-agent";
import { multiAgentResultsUrl } from "@/lib/multi-agent-urls";
import { preselect, readRememberedSelection, summariseEstimate } from "@/lib/multi-agent-selection";

/** View logic of the PR-page agent picker: which enabled agents are checked and
    starting the run. The remembered selection is read when the panel opens (never
    during render) and a manual toggle overrides the derived default. */
export function useAgentPicker({
  prId,
  onRunStart,
  onRunsStarted,
}: {
  prId: string;
  onRunStart?: () => void;
  onRunsStarted?: () => void;
}) {
  const router = useRouter();
  const { data: agents } = useAgents();
  const start = useStartMultiAgentRun();
  const [remembered, setRemembered] = React.useState<string[]>([]);
  const [picked, setPicked] = React.useState<string[] | null>(null);

  const enabled: Agent[] = (agents ?? []).filter((a) => a.enabled);
  const selected = picked ?? preselect(enabled, remembered);
  const estimate = summariseEstimate(enabled, selected);

  const onOpen = () => {
    setRemembered(readRememberedSelection());
    setPicked(null);
    start.reset();
  };
  const toggle = (id: string) =>
    setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const clear = () => setPicked([]);

  const run = async () => {
    if (selected.length === 0) return;
    onRunStart?.();
    try {
      const res = await start.mutateAsync({ prId, agentIds: selected });
      onRunsStarted?.();
      router.push(multiAgentResultsUrl(prId, res.id));
    } catch {
      /* surfaced through start.error */
    }
  };

  return {
    enabled,
    selected,
    estimate,
    onOpen,
    toggle,
    clear,
    run,
    isStarting: start.isPending,
    errorMessage: start.error ? start.error.message : null,
    inFlightId: inFlightRunId(start.error),
  };
}
