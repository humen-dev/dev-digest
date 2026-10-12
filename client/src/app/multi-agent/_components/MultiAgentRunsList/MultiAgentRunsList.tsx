/* /multi-agent — paged list of the workspace's multi-agent runs. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useMultiAgentRunsList } from "@/lib/hooks/multi-agent";
import { multiAgentConfigureUrl } from "@/lib/multi-agent-urls";
import { RunRow } from "./_components/RunRow";
import { s } from "./styles";

const COLUMNS = ["pr", "repo", "started", "agents", "time", "cost", "state"] as const;

export function MultiAgentRunsList() {
  const t = useTranslations("multiAgent");
  const q = useMultiAgentRunsList();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const configure = (
    <Link href={multiAgentConfigureUrl()} style={s.configureLink}>
      {t("list.configureRun")}
    </Link>
  );

  let body: React.ReactNode;
  if (q.isPending) {
    body = <Skeleton height={80} />;
  } else if (!q.data) {
    body = <ErrorState title={t("list.errorTitle")} onRetry={() => q.refetch()} />;
  } else if (items.length === 0) {
    body = (
      <>
        <EmptyState icon="Users" title={t("list.emptyTitle")} />
        <div style={s.footer}>{configure}</div>
      </>
    );
  } else {
    body = (
      <>
        <div style={s.table}>
          <div style={s.headerRow} aria-hidden="true">
            {COLUMNS.map((c) => (
              <span key={c}>{t(`list.col.${c}`)}</span>
            ))}
          </div>
          {items.map((item) => (
            <RunRow key={item.id} item={item} />
          ))}
        </div>
        {(q.hasNextPage || q.isFetchNextPageError) && (
          <div style={s.footer}>
            {q.isFetchNextPageError && (
              <div role="alert" style={s.inlineError}>
                {t("list.loadMoreError")}
              </div>
            )}
            <Button
              kind="secondary"
              loading={q.isFetchingNextPage}
              onClick={() => q.fetchNextPage()}
            >
              {q.isFetchNextPageError ? t("list.retry") : t("list.loadMore")}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <AppShell crumb={[{ label: t("crumbGlobal") }, { label: t("title") }]}>
      <div style={s.page}>
        <div style={s.head}>
          <h1 style={s.h1}>{t("title")}</h1>
          {configure}
        </div>
        {body}
      </div>
    </AppShell>
  );
}
