"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Donut, Skeleton } from "@devdigest/ui";
import type { AgentPerf } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { UNKNOWN_AGENT_KEY, UNKNOWN_MODEL_KEY } from "../../constants";
import { colorForKey } from "../AgentIdentity";
import { s } from "./styles";

const DONUT_SIZE = 120;

/**
 * Cost by agent and by model. No reported cost at all (EC-7) replaces both
 * donuts with one message. Labels are React text children (UT-3, UT-4).
 */
export function CostBreakdown({ data }: { data: AgentPerf | undefined }) {
  const t = useTranslations("agentPerformance");

  let body: React.ReactNode;
  if (!data) {
    body = (
      <div style={s.grid} aria-busy="true">
        <Skeleton height={DONUT_SIZE + 40} />
        <Skeleton height={DONUT_SIZE + 40} />
      </div>
    );
  } else if (data.summary.total_cost_usd == null || (data.cost_by_agent.length === 0 && data.cost_by_model.length === 0)) {
    body = <p style={s.none}>{t("breakdown.noCost")}</p>;
  } else {
    const byAgent = data.cost_by_agent.map((seg) => ({
      label: seg.key === UNKNOWN_AGENT_KEY ? t("table.unknownAgent") : seg.label,
      value: seg.value,
      color: colorForKey(seg.key === UNKNOWN_AGENT_KEY ? null : seg.key),
    }));
    const byModel = data.cost_by_model.map((seg) => ({
      label: seg.label,
      value: seg.value,
      color: colorForKey(seg.key === UNKNOWN_MODEL_KEY ? null : seg.key),
    }));
    body = (
      <div style={s.grid}>
        <Card>
          <div style={s.cardTitle}>{t("breakdown.byAgent")}</div>
          <Donut segments={byAgent} size={DONUT_SIZE} formatValue={formatCost} />
        </Card>
        <Card>
          <div style={s.cardTitle}>{t("breakdown.byModel")}</div>
          <Donut segments={byModel} size={DONUT_SIZE} formatValue={formatCost} />
        </Card>
      </div>
    );
  }

  return (
    <section aria-labelledby="cost-breakdown-heading">
      <h2 id="cost-breakdown-heading" style={s.heading}>
        {t("breakdown.heading")}
      </h2>
      <p style={s.note}>{t("cost.label")}</p>
      {body}
    </section>
  );
}
