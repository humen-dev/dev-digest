"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { relativeTime } from "@/lib/relative-time";
import { RECENT_RUNS_LIMIT } from "../../constants";
import { agentRunsHref, runStatusKey } from "../../helpers";
import { s } from "./styles";

/** The agent's most recent CI runs (at most RECENT_RUNS_LIMIT) plus a link to the filtered CI Runs page. */
export function RecentRuns({ agentId, runs }: { agentId: string; runs: readonly CiRun[] }) {
  const t = useTranslations("ci.ciTab");
  const tr = useTranslations("ci.runs");
  const rows = runs.slice(0, RECENT_RUNS_LIMIT);

  return (
    <section>
      <SectionLabel icon="Activity">{t("recentRuns")}</SectionLabel>
      <ul style={s.list} aria-label={t("recentRuns")}>
        {rows.map((run) => (
          <li key={run.id} style={s.row}>
            <span className="mono" style={s.repo}>
              {run.repo}
            </span>
            {run.pr_number !== null && <span style={s.muted}>#{run.pr_number}</span>}
            <span>{run.verdict ? tr(`verdict.${run.verdict}`) : tr(`status.${runStatusKey(run.status)}`)}</span>
            <span style={s.muted}>{relativeTime(run.ran_at)}</span>
          </li>
        ))}
      </ul>
      <Link href={agentRunsHref(agentId)} style={s.link}>
        {t("viewAllRuns")}
      </Link>
    </section>
  );
}
