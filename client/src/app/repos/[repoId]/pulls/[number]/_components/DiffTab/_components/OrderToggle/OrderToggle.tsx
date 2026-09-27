/* OrderToggle — Smart order / Original order radiogroup for the Files
   changed tab (docs/plans/smart-diff.md Decision 15). Small and colocated on
   purpose: a single consumer today, promote to @devdigest/ui on a second. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OrderMode } from "../../constants";
import { s, pillStyle } from "./styles";

export function OrderToggle({
  order,
  onChange,
  disabled,
}: {
  order: OrderMode;
  onChange: (order: OrderMode) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("prReview");
  return (
    <div role="radiogroup" aria-label={t("smartDiff.orderLabel")} style={s.group}>
      <button
        type="button"
        role="radio"
        aria-checked={order === "smart"}
        disabled={disabled}
        style={pillStyle(order === "smart")}
        onClick={() => onChange("smart")}
      >
        {t("smartDiff.smartOrder")}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={order === "original"}
        disabled={disabled}
        style={pillStyle(order === "original")}
        onClick={() => onChange("original")}
      >
        {t("smartDiff.originalOrder")}
      </button>
    </div>
  );
}
