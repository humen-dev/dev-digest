"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { formatAgentEstimate, formatSeconds } from "@/lib/multi-agent-selection";
import { s } from "./styles";

interface PickerPanelProps {
  agents: Agent[];
  selected: string[];
  estimate: { maxDurationMs: number | null; costUsd: number | null };
  warnMerged: boolean;
  isStarting: boolean;
  errorMessage: string | null;
  /** Set when the start failed because a run is already in flight. */
  inFlightId: string | null;
  onToggle: (id: string) => void;
  onClear: () => void;
  onRun: () => void;
  onConfigure: () => void;
  onOpenInFlight: (multiRunId: string) => void;
}

/** Presentational body of the PR-page agent picker popover. */
export function PickerPanel({
  agents,
  selected,
  estimate,
  warnMerged,
  isStarting,
  errorMessage,
  inFlightId,
  onToggle,
  onClear,
  onRun,
  onConfigure,
  onOpenInFlight,
}: PickerPanelProps) {
  const t = useTranslations("multiAgent");
  const tCfg = useTranslations("multiAgent.configure");
  const duration = estimate.maxDurationMs == null ? "—" : formatSeconds(estimate.maxDurationMs);

  return (
    <>
      {warnMerged && (
        <div style={s.warning}>
          <Icon.AlertTriangle size={13} style={{ flexShrink: 0 }} />
          {t("picker.mergedWarning")}
        </div>
      )}
      <div style={s.header}>
        <span style={s.heading}>{t("picker.heading")}</span>
        <button type="button" style={s.clear} onClick={onClear}>
          {t("picker.clear")}
        </button>
      </div>
      <div style={s.list}>
        {agents.length === 0 && <div style={s.empty}>{t("picker.noAgents")}</div>}
        {agents.map((a) => (
          <div key={a.id} style={s.row}>
            <Checkbox checked={selected.includes(a.id)} onChange={() => onToggle(a.id)} label={a.name} />
            <span className="mono tnum" style={s.rowEstimate}>
              {formatAgentEstimate(a) ?? t("picker.noHistory")}
            </span>
          </div>
        ))}
      </div>
      <div style={s.runBar}>
        {selected.length > 0 && (
          <div className="mono" style={s.summary}>
            {t("picker.summary", { duration, cost: formatCost(estimate.costUsd) })}
          </div>
        )}
        <Button
          kind="primary"
          icon="Users"
          full
          loading={isStarting}
          disabled={selected.length === 0 || isStarting}
          onClick={onRun}
        >
          {t("picker.run", { count: selected.length })}
        </Button>
        {errorMessage && (
          <div role="alert" style={s.error}>
            {inFlightId ? tCfg("inFlight") : errorMessage}
            {inFlightId && (
              <button type="button" style={s.errorLink} onClick={() => onOpenInFlight(inFlightId)}>
                {tCfg("inFlightLink")}
              </button>
            )}
          </div>
        )}
      </div>
      <div style={s.footer}>
        <button type="button" style={s.configure} onClick={onConfigure}>
          <Icon.Settings size={13} />
          {t("picker.configure")}
        </button>
      </div>
    </>
  );
}
