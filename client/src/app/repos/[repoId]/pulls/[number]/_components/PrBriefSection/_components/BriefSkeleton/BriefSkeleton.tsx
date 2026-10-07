"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Skeleton } from "@devdigest/ui";
import { s } from "../../styles";

/** Placeholder card while the first generation is pending. */
export function BriefSkeleton() {
  const t = useTranslations("brief");
  return (
    <Card>
      <div role="status" aria-busy="true" aria-label={t("card.title")} style={s.loadingStack}>
        <Skeleton height={16} width={120} />
        <Skeleton height={14} />
        <Skeleton height={14} width="85%" />
        <Skeleton height={14} width="60%" />
      </div>
    </Card>
  );
}
