/* Route: /agent-performance — per-agent runs, honest cost, duration and accept rate (SPEC-09).
   Thin entry: shell + breadcrumb; the view reads the period from the URL, so it sits in Suspense. */
"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { AgentPerformanceView } from "./_components/AgentPerformanceView";

export default function AgentPerformancePage() {
  const t = useTranslations("agentPerformance");
  return (
    <AppShell crumb={[{ label: t("title") }]}>
      <Suspense>
        <AgentPerformanceView />
      </Suspense>
    </AppShell>
  );
}
