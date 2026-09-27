/* SmartDiffHeader — "Files changed" section label: eyebrow + PR-wide summary
   + the Smart/Original order toggle + the (optional) show/hide comments
   button (docs/plans/smart-diff.md Decision 16). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import type { PrDetail } from "@devdigest/shared";
import type { OrderMode } from "../../constants";
import { OrderToggle } from "../OrderToggle";
import { s } from "./styles";

export function SmartDiffHeader({
  pr,
  order,
  onOrderChange,
  orderDisabled,
  commentCount,
  showComments,
  onToggleComments,
}: {
  pr: PrDetail;
  order: OrderMode;
  onOrderChange: (order: OrderMode) => void;
  orderDisabled?: boolean;
  commentCount: number;
  showComments: boolean;
  onToggleComments: () => void;
}) {
  const t = useTranslations("prReview");
  return (
    <SectionLabel
      icon="Code"
      right={
        <div style={s.right}>
          <span style={s.summary}>
            {t("smartDiff.summary", {
              files: pr.files_count,
              additions: pr.additions,
              deletions: pr.deletions,
            })}
          </span>
          <OrderToggle order={order} onChange={onOrderChange} disabled={orderDisabled} />
          {commentCount > 0 && (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={onToggleComments}
            >
              {showComments
                ? t("smartDiff.hideComments", { count: commentCount })
                : t("smartDiff.showComments", { count: commentCount })}
            </Button>
          )}
        </div>
      }
    >
      {t("smartDiff.eyebrow")}
    </SectionLabel>
  );
}
