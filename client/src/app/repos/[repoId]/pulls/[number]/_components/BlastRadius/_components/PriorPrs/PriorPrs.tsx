/* PriorPrs — collapsible "Prior PRs touching these files" row at the bottom of
   the blast-radius card (GET /pulls/:id/history). Titles and authors are
   untrusted GitHub text and are rendered as React text only. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon } from "@devdigest/ui";
import type { PrHistoryItem } from "@devdigest/shared";
import { usePrHistory } from "@/lib/hooks/pr-history";
import { githubPrUrl } from "@/lib/github-urls";
import { OVERLAP_PREVIEW, mergedDate, overlapPreview } from "./helpers";
import { s } from "./styles";

export interface PriorPrsProps {
  prId: string;
  repoFullName: string | null;
}

function PrItem({ item, repoFullName }: { item: PrHistoryItem; repoFullName: string | null }) {
  const t = useTranslations("blast");
  const { shown, more } = overlapPreview(item.files_overlap, OVERLAP_PREVIEW);
  const label = `#${item.pr_number} ${item.title}`;
  return (
    <li style={s.item}>
      {repoFullName ? (
        <a
          href={githubPrUrl(repoFullName, item.pr_number)}
          target="_blank"
          rel="noopener noreferrer"
          style={s.prTitle}
          aria-label={t("history.openPr", { number: item.pr_number })}
        >
          {label}
        </a>
      ) : (
        <span style={s.prTitle}>{label}</span>
      )}
      <span style={s.meta}>
        {t("history.merged", { date: mergedDate(item.merged_at), author: item.author })}
      </span>
      <span className="mono" style={s.files}>
        {shown.join(", ")}
        {more > 0 && ` ${t("history.moreFiles", { count: more })}`}
      </span>
      <span style={s.meta}>{t("history.overlap", { count: item.files_overlap.length })}</span>
    </li>
  );
}

export function PriorPrs({ prId, repoFullName }: PriorPrsProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = useState(false);
  const { data, isLoading, refetch } = usePrHistory(prId);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  const badge = isLoading ? "…" : data?.available ? String(data.history.length) : "—";

  return (
    <div style={s.wrap}>
      <button type="button" style={s.toggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon.History size={14} />
        <span style={s.title}>{t("history.title")}</span>
        <Badge>{badge}</Badge>
        <Chevron size={14} />
      </button>

      {open && (
        <div style={s.body}>
          {isLoading ? (
            <p style={s.message}>{t("history.loading")}</p>
          ) : !data ? (
            <ErrorState title={t("history.error")} onRetry={() => refetch()} />
          ) : !data.available ? (
            <p style={s.message}>{t(`history.unavailable.${data.reason ?? "github_error"}`)}</p>
          ) : data.history.length === 0 ? (
            <p style={s.message}>{t("history.empty")}</p>
          ) : (
            <ul style={s.list}>
              {data.history.map((item) => (
                <PrItem key={item.pr_number} item={item} repoFullName={repoFullName} />
              ))}
            </ul>
          )}
          {data && data.files_considered < data.files_total && (
            <p style={s.footnote}>
              {t("history.capped", { considered: data.files_considered, total: data.files_total })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
