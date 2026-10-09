/* CompareDialog — two runs of one agent, old → new (SPEC-05 AC-50…AC-57, UT-10).
   Metric deltas cover the cases common to both runs; the prompt diff is plain text lines
   with −/+ markers (never HTML), or a notice when a snapshot is missing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import { TruncatedText } from "@/components/eval/TruncatedText";
import { ApiError } from "@/lib/api";
import { formatVersionLabel } from "@/lib/eval-format";
import { useEvalCompare } from "@/lib/hooks/eval";
import { buildCompareRows, DIFF_MARKER } from "./helpers";
import { s } from "./styles";

export function CompareDialog({
  olderId,
  newerId,
  onClose,
}: {
  olderId: string;
  newerId: string;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const tc = useTranslations("common");
  const { data, error, isError } = useEvalCompare(olderId, newerId);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = data
    ? `${formatVersionLabel(data.older.agent_version, data.older.skills_delta, t)} → ${formatVersionLabel(
        data.newer.agent_version,
        data.newer.skills_delta,
        t,
      )}`
    : t("compare.title");
  const errorCode = error instanceof ApiError ? error.code : undefined;

  return (
    <Modal width={720} title={t("compare.title")} subtitle={data ? title : undefined} onClose={onClose}>
      <div style={s.body}>
        {!data && !isError && <span style={s.muted}>{tc("states.loading")}</span>}
        {!data && isError && (
          <span role="alert" style={s.error}>
            {errorCode === "invalid_compare_pair" ? t("errors.invalid_compare_pair") : t("errors.generic")}
          </span>
        )}
        {data && (
          <>
            <section>
              {buildCompareRows(data.metrics, t("metrics.notApplicable")).map((row) => (
                <div key={row.key} style={s.metricRow}>
                  <span>{t(row.labelKey)}</span>
                  <span className="mono tnum">
                    {row.older} → {row.newer}
                    {row.delta != null && ` (${row.inPoints ? t("metrics.deltaPts", { points: row.delta }) : row.delta})`}
                  </span>
                </div>
              ))}
            </section>

            {data.only_in_older.length > 0 && (
              <section>
                <h3 style={s.h3}>{t("compare.onlyInOlder")}</h3>
                <ul style={s.list}>
                  {data.only_in_older.map((c) => (
                    <li key={c.case_id}>
                      <TruncatedText text={c.name} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.only_in_newer.length > 0 && (
              <section>
                <h3 style={s.h3}>{t("compare.onlyInNewer")}</h3>
                <ul style={s.list}>
                  {data.only_in_newer.map((c) => (
                    <li key={c.case_id}>
                      <TruncatedText text={c.name} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 style={s.h3}>{t("compare.promptDiff")}</h3>
              {data.prompt_diff ? (
                <pre className="mono" style={s.diff}>
                  {data.prompt_diff.map((line, i) => (
                    <div key={i} data-op={line.op} style={s.diffLine(line.op)}>
                      <span>{DIFF_MARKER[line.op]}</span>
                      <span>{line.text}</span>
                    </div>
                  ))}
                </pre>
              ) : (
                <div style={s.muted}>
                  {(data.missing_snapshot_versions.length > 0
                    ? data.missing_snapshot_versions
                    : [data.older.agent_version]
                  ).map((v) => (
                    <div key={v}>{t("compare.snapshotUnavailable", { version: v })}</div>
                  ))}
                </div>
              )}
            </section>

            {data.skills_diff.length > 0 && (
              <section>
                <h3 style={s.h3}>{t("compare.skills")}</h3>
                <ul style={s.list}>
                  {data.skills_diff.map((sk) => (
                    <li key={sk.skill_id}>
                      <strong>{sk.name}</strong> — {t(SKILL_CHANGE_KEY[sk.change])}
                      {sk.from_version != null || sk.to_version != null
                        ? ` (${sk.from_version != null ? `v${sk.from_version}` : "—"} → ${
                            sk.to_version != null ? `v${sk.to_version}` : "—"
                          })`
                        : ""}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

const SKILL_CHANGE_KEY = {
  added: "compare.skillAdded",
  removed: "compare.skillRemoved",
  changed: "compare.skillChanged",
} as const;
