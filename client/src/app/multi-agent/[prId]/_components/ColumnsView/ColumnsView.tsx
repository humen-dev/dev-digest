/* Columns mode: one column per agent run — name, status text, score ring,
   duration, cost, mini findings, count and View trace. A failed column shows its
   error without affecting its siblings. Beyond 5 columns the row scrolls. */
"use client";

import { useTranslations } from "next-intl";
import { CircularScore, SEV } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { formatSeconds } from "@/lib/multi-agent-selection";
import { AgentsChip, type GroupIndex } from "../AgentsChip";
import { MAX_FIT_COLUMNS, MIN_COLUMN_WIDTH } from "./constants";
import { s } from "./styles";

export function ColumnsView({
  columns,
  groups,
  hideErrors,
  onViewTrace,
}: {
  columns: AgentColumn[];
  groups: GroupIndex;
  /** The failure is shown once above the columns (shared pre-work), not per column. */
  hideErrors: boolean;
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgent.results");
  const scrolls = columns.length > MAX_FIT_COLUMNS;

  return (
    <div
      style={s.grid(columns.length, MIN_COLUMN_WIDTH, scrolls)}
      data-scroll={scrolls ? "true" : undefined}
      role="region"
      aria-label={t("columns")}
      tabIndex={scrolls ? 0 : undefined}
    >
      {columns.map((col) => (
        <section key={col.run_id} style={s.column} aria-label={col.agent_name}>
          <div style={s.head}>
            <div style={s.headMain}>
              <div style={s.name}>{col.agent_name}</div>
              <div style={s.status(col.status)}>{t(`status.${col.status}`)}</div>
              <div style={s.meta}>
                {col.duration_ms != null ? formatSeconds(col.duration_ms) : "—"} · {formatCost(col.cost_usd)}
              </div>
            </div>
            {col.score != null && <CircularScore score={col.score} size={38} stroke={3.5} />}
          </div>

          <div style={s.body}>
            {col.status === "failed" && !hideErrors && col.error && <div style={s.error}>{col.error}</div>}
            {col.status === "done" && col.findings.length === 0 && <div style={s.empty}>{t("noFindings")}</div>}
            {col.findings.map((f) => (
              <div key={f.id} style={s.finding(f.severity)}>
                <div style={s.findingTitle}>{f.title}</div>
                <div style={s.findingMeta}>
                  <span style={s.severity}>{SEV[f.severity]?.label ?? f.severity}</span>
                  <span className="mono">
                    {f.file}:{f.start_line}
                  </span>
                  <AgentsChip members={groups.get(f.group_id) ?? []} runId={col.run_id} />
                </div>
              </div>
            ))}
          </div>

          <div style={s.foot}>
            <button type="button" style={s.trace} onClick={() => onViewTrace(col.run_id)}>
              {t("viewTrace")}
            </button>
            <span>{t("findingsCount", { count: col.findings.length })}</span>
          </div>
        </section>
      ))}
    </div>
  );
}
