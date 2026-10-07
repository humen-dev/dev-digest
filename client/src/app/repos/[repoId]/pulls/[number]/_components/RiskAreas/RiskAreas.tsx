/* RiskAreas — the PR Brief's grounded risks: kind icon, severity colour, title,
   first file ref as a jump button, and a chevron that reveals the explanation
   and every ref. A ref on a changed file calls onNavigate; any other ref toasts. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import type { DiffTarget } from "@/lib/pr-diff-target";
import { notify } from "@/lib/toast";
import { RiskRow } from "./_components/RiskRow";
import { parseFileRef, sortRisks } from "./helpers";
import { s } from "./styles";

export interface RiskAreasProps {
  risks: readonly Risk[];
  changedPaths: ReadonlySet<string> | readonly string[];
  onNavigate: (target: DiffTarget) => void;
  variant?: "embedded" | "card";
}

export function RiskAreas({ risks, changedPaths, onNavigate, variant = "embedded" }: RiskAreasProps) {
  const t = useTranslations("brief");
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const sorted = sortRisks(risks);

  const handleRef = (ref: string) => {
    const target = parseFileRef(ref);
    const changed = Array.isArray(changedPaths)
      ? changedPaths.includes(target.file)
      : (changedPaths as ReadonlySet<string>).has(target.file);
    if (changed) onNavigate(target);
    else notify.info(t("nav.fileNotInDiff"));
  };

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const body = (
    <section>
      <h3 style={s.heading}>{t("block.risks")}</h3>
      {sorted.length === 0 ? (
        <p style={s.empty}>{t("risks.empty")}</p>
      ) : (
        <ul style={s.list}>
          {sorted.map((risk, i) => (
            <RiskRow
              key={`${risk.kind}-${risk.title}-${i}`}
              risk={risk}
              expanded={expanded.has(i)}
              onToggle={() => toggle(i)}
              onRefClick={handleRef}
            />
          ))}
        </ul>
      )}
    </section>
  );

  return variant === "card" ? <Card>{body}</Card> : body;
}
