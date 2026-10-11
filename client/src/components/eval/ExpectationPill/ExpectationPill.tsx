"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalExpectationType } from "@devdigest/shared";
import { s } from "./styles";

/** "MUST FIND" / "MUST NOT FLAG" label for an eval case's expectation type. */
export function ExpectationPill({ type }: { type: EvalExpectationType }) {
  const t = useTranslations("eval");
  return (
    <span style={s.pill(type === "must_find")}>
      {type === "must_find" ? t("pill.mustFind") : t("pill.mustNotFlag")}
    </span>
  );
}
