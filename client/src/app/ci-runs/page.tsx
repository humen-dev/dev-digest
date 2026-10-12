/* Route: /ci-runs — workspace-scoped CI Runs (SPEC-07). Thin entry: the shell
   and breadcrumb live here; filters, table, auto-refresh and the trace drawer
   are colocated under _components/CiRunsView. */
"use client";

import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { CiRunsView } from "./_components/CiRunsView";

export default function CiRunsPage() {
  const t = useTranslations("ci");
  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <CiRunsView />
    </AppShell>
  );
}
