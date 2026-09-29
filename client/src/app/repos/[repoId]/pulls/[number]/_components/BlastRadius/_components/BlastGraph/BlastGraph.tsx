/* BlastGraph — direct blast radius as a three-column SVG: changed symbols →
   callers → endpoints/crons. Layout is pure (helpers.ts); this only draws. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { NODE_H } from "./constants";
import { layoutBlastGraph } from "./helpers";
import { nodeStyles, s } from "./styles";

export function BlastGraph({ data }: { data: BlastRadiusResponse }) {
  const t = useTranslations("blast");
  const layout = layoutBlastGraph(data);

  if (data.downstream.length === 0) return <p style={s.empty}>{t("graph.empty")}</p>;

  const hasCrons = layout.nodes.some((n) => n.kind === "cron");

  return (
    <div style={s.wrap}>
      <svg
        role="img"
        aria-label={t("graph.ariaLabel")}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={s.svg}
      >
        {layout.edges.map((e) => (
          <path key={e.id} d={e.d} style={s.edge} />
        ))}
        {layout.nodes.map((n) => {
          const text = n.kind === "more" ? t("graph.more", { count: Number(n.full) }) : n.label;
          return (
            <g key={n.id}>
              <title>{n.kind === "more" ? text : n.full}</title>
              <rect x={n.x} y={n.y} width={n.width} height={NODE_H} rx={6} style={nodeStyles[n.kind]} />
              <text
                x={n.x + 10}
                y={n.y + NODE_H / 2}
                dominantBaseline="central"
                className="mono"
                style={s.text}
              >
                {text}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={s.legend}>
        <span style={s.legendItem}>
          <span style={s.swatchSymbol} />
          {t("graph.legend.changed")}
        </span>
        <span style={s.legendItem}>
          <span style={s.swatchCaller} />
          {t("graph.legend.callers")}
        </span>
        <span style={s.legendItem}>
          <span style={s.swatchSymbol} />
          {t("graph.legend.endpoints")}
        </span>
        {hasCrons && (
          <span style={s.legendItem}>
            <span style={s.swatchCron} />
            {t("graph.legend.crons")}
          </span>
        )}
      </div>

      {layout.unattributed > 0 && (
        <p style={s.note}>{t("graph.unattributed", { count: layout.unattributed })}</p>
      )}
    </div>
  );
}
