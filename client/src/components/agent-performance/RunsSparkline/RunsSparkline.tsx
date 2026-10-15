"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import type { PerfRunBuckets } from "@devdigest/shared";

/** Runs-per-bucket trend; the accessible name carries the bucket size and first/last counts. */
export function RunsSparkline({ buckets }: { buckets: PerfRunBuckets }) {
  const t = useTranslations("agentPerformance");
  const counts = buckets.buckets.map((b) => b.runs);
  if (counts.length === 0) return null;
  const label = t("trend.sparkline", {
    size: buckets.size,
    first: counts[0]!,
    last: counts[counts.length - 1]!,
  });
  // Sparkline divides by (n − 1); a single bucket is drawn as a flat two-point line.
  const data = counts.length === 1 ? [counts[0]!, counts[0]!] : counts;
  return (
    <span role="img" aria-label={label} style={{ display: "inline-block" }}>
      <Sparkline data={data} w={120} h={32} />
    </span>
  );
}
