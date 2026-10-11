"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { caseReasonKey, formatDurationMs, formatRunCost } from "@/lib/eval-format";
import { EXPECTED_COUNT } from "../../constants";
import type { WarmupRun } from "../../types";
import { s } from "./styles";

/** Plain-text Run case result: verdict, "expected … got M", duration / cost, the agent's findings (AC-102–AC-104).
 *  Every model-produced string is a text node, never HTML (UT-14). `stale` greys it out (AC-101). */
export function RunResult({ run, stale }: { run: WarmupRun; stale: boolean }) {
  const t = useTranslations("eval");
  const { result, expectation: e } = run;
  const reasonKey = result.status === "errored" ? caseReasonKey(result.error_reason ?? "error") : null;
  const reason = result.status === "errored" ? (reasonKey ? t(reasonKey) : (result.error_reason ?? "")) : null;

  return (
    <section style={s.wrap(stale)} aria-label={t("caseModal.runCase")}>
      <div style={s.head}>
        {result.status === "scored" ? (
          <>
            <span style={s.verdict}>{result.pass ? t("caseModal.resultPassed") : t("caseModal.resultFailed")}</span>
            <span>
              {t("caseModal.resultExpected", {
                expected: EXPECTED_COUNT[e.type],
                file: e.file,
                start: e.start_line,
                end: e.end_line,
                got: result.findings_matched,
              })}
            </span>
          </>
        ) : (
          <>
            <span style={s.verdict}>{t("status.errored")}</span>
            <span>{reason}</span>
          </>
        )}
      </div>
      <div style={s.muted}>
        {t("caseModal.resultMeta", { duration: formatDurationMs(result.duration_ms), cost: formatRunCost(result.cost_usd) })}
      </div>
      {stale && (
        <div role="status" style={s.stale}>
          {t("caseModal.stale")}
        </div>
      )}
      {result.actual.length > 0 && (
        <>
          <h3 style={s.h3}>{t("caseModal.findingsHeading")}</h3>
          <ul style={s.list}>
            {result.actual.map((a, i) => (
              <li key={`${a.file}:${a.start_line}:${i}`}>
                <div>
                  <strong>{a.title}</strong>
                  {a.matched && <span style={s.matched}>{t("caseModal.matched")}</span>}
                </div>
                <div className="mono" style={s.muted}>
                  {a.file}:{a.start_line}–{a.end_line} · {a.severity} · {a.category}
                </div>
                <div>{a.rationale}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
