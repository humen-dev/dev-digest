/* "Where agents disagree": one block per match group with one take per agent run
   — its highest severity, "did not flag" + reason, or the run's status when it
   did not take part. "Show only conflicts" filters locally (no request). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV, Toggle } from "@devdigest/ui";
import type { Conflict, ConflictTake } from "@devdigest/shared";
import { MIN_PARTICIPATING } from "./constants";
import { s } from "./styles";

function Take({ take }: { take: ConflictTake }) {
  const t = useTranslations("multiAgent");

  let verdict: React.ReactNode;
  if (take.run_status !== "done") {
    verdict = <span style={s.status}>{t(`results.status.${take.run_status}`)}</span>;
  } else if (take.verdict === "ignored") {
    verdict = <span style={s.muted}>{t("conflicts.didNotFlag")}</span>;
  } else {
    verdict = <span style={s.severity(take.verdict)}>{SEV[take.verdict]?.label ?? take.verdict}</span>;
  }

  return (
    <div style={s.take}>
      <div style={s.persona}>{take.persona}</div>
      {verdict}
      {take.note && <div style={s.note}>{take.note}</div>}
    </div>
  );
}

export function ConflictsSection({
  conflicts,
  participating,
}: {
  conflicts: Conflict[];
  /** Agent runs that finished successfully. */
  participating: number;
}) {
  const t = useTranslations("multiAgent.conflicts");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);

  const shown = onlyConflicts ? conflicts.filter((c) => c.is_conflict) : conflicts;

  let content: React.ReactNode;
  if (participating < MIN_PARTICIPATING) {
    content = <p style={s.message}>{t("needTwo")}</p>;
  } else if (shown.length === 0) {
    content = <p style={s.message}>{t("noConflicts")}</p>;
  } else {
    content = shown.map((c) => (
      <article key={c.id} style={s.group} aria-label={c.title}>
        <div style={s.groupHead}>
          <span className="mono" style={s.location}>
            {c.file}:{c.line}
          </span>
          <span style={s.groupTitle}>{c.title}</span>
        </div>
        <div style={s.takes}>
          {c.takes.map((take) => (
            <Take key={take.run_id} take={take} />
          ))}
        </div>
      </article>
    ));
  }

  return (
    <section style={s.wrap} aria-label={t("heading")}>
      <div style={s.head}>
        <h2 style={s.heading}>{t("heading")}</h2>
        <label style={s.toggle}>
          {t("onlyConflicts")}
          <Toggle on={onlyConflicts} onChange={setOnlyConflicts} size={16} label={t("onlyConflicts")} />
        </label>
      </div>
      {content}
    </section>
  );
}
