"use client";

import React from "react";
import { Sparkline } from "@devdigest/ui";

/**
 * Decorative mini trend line. Hidden from assistive tech: the same values are
 * always available as a table next to it (see MetricTrend / RunsTable).
 * Null points (metric not applicable) are skipped, never drawn as 0.
 */
export function TrendSparkline({
  data,
  color,
  w = 56,
  h = 20,
}: {
  data: Array<number | null>;
  color?: string;
  w?: number;
  h?: number;
}) {
  const values = data.filter((v): v is number => v != null);
  if (values.length === 0) return null;
  // Sparkline divides by (n - 1); a single point is drawn as a flat 2-point line.
  const series = values.length === 1 ? [values[0]!, values[0]!] : values;
  return (
    <span aria-hidden="true" data-testid="trend-sparkline" style={{ display: "inline-block" }}>
      <Sparkline data={series} color={color} w={w} h={h} />
    </span>
  );
}
