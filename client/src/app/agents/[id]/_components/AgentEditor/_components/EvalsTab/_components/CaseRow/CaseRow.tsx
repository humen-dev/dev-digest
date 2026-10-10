"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCaseListItem } from "@devdigest/shared";
import { ExpectationPill } from "@/components/eval/ExpectationPill";
import { TruncatedText } from "@/components/eval/TruncatedText";
import { NAME_MAX_WIDTH } from "../../constants";
import { s } from "./styles";

/** One eval case: name, type pill, severity · category, "expected N, got M" and the latest status.
 *  A native button, so Enter / Space open the case (NFR-9). */
export function CaseRow({ item, onOpen }: { item: EvalCaseListItem; onOpen: (id: string) => void }) {
  const t = useTranslations("eval");
  const e = item.expectation;
  const range = { file: e.file, start: e.start_line, end: e.end_line };
  const expected = t(e.type === "must_find" ? "expected.mustFind" : "expected.mustNotFlag", range);
  const matched = item.last && item.last.status !== "errored" ? item.last.findings_matched : null;
  const tags = [item.severity, item.category].filter(Boolean).join(" · ") || "—";
  const status = item.last?.status ?? null;

  return (
    <button type="button" style={s.row} onClick={() => onOpen(item.id)}>
      <TruncatedText text={item.name} maxWidth={NAME_MAX_WIDTH} />
      <span>
        <ExpectationPill type={e.type} />
      </span>
      <span style={s.tags}>{tags}</span>
      <span style={s.expected}>
        <TruncatedText text={matched == null ? expected : `${expected}, ${t("expected.got", { count: matched })}`} mono />
      </span>
      <span style={s.status(status)}>{status ? t(`status.${status}`) : t("status.neverRun")}</span>
    </button>
  );
}
