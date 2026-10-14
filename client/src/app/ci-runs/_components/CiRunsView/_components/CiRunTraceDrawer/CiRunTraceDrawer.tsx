"use client";

import { useTranslations } from "next-intl";
import { Drawer, Skeleton } from "@devdigest/ui";
import { formatCost } from "@/lib/format-cost";
import { formatDurationMs } from "@/lib/eval-format";
import { useRunTrace } from "@/lib/hooks/trace";
import { s } from "../../styles";

/**
 * Trace drawer for a CI run, keyed by the studio `agent_runs.id`. Everything is
 * rendered as plain text (the model's raw output is untrusted).
 */
export function CiRunTraceDrawer({ runId, onClose }: { runId: string; onClose: () => void }) {
  const t = useTranslations("ci");
  const { data: trace, isLoading } = useRunTrace(runId);

  const meta = trace
    ? [trace.config.agent, trace.config.model, formatCost(trace.stats.cost_usd), formatDurationMs(trace.stats.duration_ms)]
        .join(" · ")
    : null;

  return (
    <Drawer title={t("runs.traceTitle")} subtitle={meta} onClose={onClose}>
      {isLoading && !trace ? (
        <Skeleton height={120} />
      ) : trace ? (
        <pre style={s.drawerRaw}>{trace.raw_output}</pre>
      ) : (
        <p style={s.drawerMeta}>{t("runs.traceUnavailable")}</p>
      )}
    </Drawer>
  );
}
