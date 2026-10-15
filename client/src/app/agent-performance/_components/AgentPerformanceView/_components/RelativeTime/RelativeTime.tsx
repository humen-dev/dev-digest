"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { relativeTime } from "@/lib/relative-time";

/** "4m ago" / "just now"; the absolute ISO timestamp is the element's accessible description (AC-56). */
export function RelativeTime({ iso }: { iso: string | null }) {
  const t = useTranslations("agentPerformance");
  if (!iso) return <>—</>;
  const rel = relativeTime(iso);
  if (rel === "—") return <>—</>;
  return (
    <time dateTime={iso} title={iso}>
      {rel === "now" ? t("table.justNow") : t("table.ago", { time: rel })}
    </time>
  );
}
