/* Results header: configure link, PR identity, honest totals, view toggle,
   Cancel all (only while running), score legend and the polite live region. */
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { MultiAgentRun } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { formatSeconds } from "@/lib/multi-agent-selection";
import { s } from "./styles";

export type ViewMode = "columns" | "tabs";

const VIEW_MODES: ViewMode[] = ["columns", "tabs"];

export function ResultsHeader({
  run,
  view,
  onViewChange,
  canCancel,
  onCancelAll,
  onConfigure,
  announcement,
}: {
  run: MultiAgentRun;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  canCancel: boolean;
  onCancelAll: () => void;
  onConfigure: () => void;
  announcement: string;
}) {
  const t = useTranslations("multiAgent");

  const sum = formatCost(run.total_cost_usd);
  const cost =
    run.unpriced_count > 0 && run.total_cost_usd != null
      ? t("results.unpriced", { cost: sum, count: run.unpriced_count })
      : sum;

  return (
    <header style={s.wrap}>
      <div style={s.titleRow}>
        <Button kind="secondary" size="sm" icon="Settings" onClick={onConfigure}>
          {t("results.configureRun")}
        </Button>
        <h1 style={s.h1}>{t("title")}</h1>
        <span style={s.selected}>{t("results.selected", { count: run.agent_count })}</span>
        <div style={s.right}>
          {canCancel && (
            <Button kind="danger" size="sm" icon="X" onClick={onCancelAll}>
              {t("results.cancelAll")}
            </Button>
          )}
          <div role="group" aria-label={t("results.columns") + " / " + t("results.tabs")} style={s.toggle}>
            {VIEW_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                style={s.segment(view === mode)}
                onClick={() => onViewChange(mode)}
              >
                {t(`results.${mode}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={s.metaRow}>
        <span style={s.pr}>
          {run.pr_number != null && <span className="mono">#{run.pr_number}</span>}
          <span style={s.prTitle}>{run.pr_title}</span>
        </span>
        <span style={s.meta}>
          {t("results.meta", {
            count: run.agent_count,
            duration: formatSeconds(run.total_duration_ms),
            cost,
          })}
        </span>
      </div>

      <div style={s.legend}>{t("results.scoreLegend")}</div>
      <div role="status" aria-live="polite" style={s.srOnly}>
        {announcement}
      </div>
    </header>
  );
}
