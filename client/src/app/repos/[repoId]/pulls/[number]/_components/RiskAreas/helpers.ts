import type { Risk } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import type { DiffTarget } from "@/lib/pr-diff-target";
import {
  FALLBACK_RISK_KIND,
  RISK_KIND_ICON,
  RISK_KINDS,
  RISK_SEVERITY_ORDER,
  type RiskKind,
} from "./constants";

/** High → medium → low; stable within a severity. Returns a new array. */
export function sortRisks(risks: readonly Risk[]): Risk[] {
  return risks
    .map((risk, index) => ({ risk, index }))
    .sort(
      (a, b) =>
        RISK_SEVERITY_ORDER[a.risk.severity] - RISK_SEVERITY_ORDER[b.risk.severity] ||
        a.index - b.index,
    )
    .map((x) => x.risk);
}

/** "path:12-20" → { file: "path", line: 12 }; "path:12" → line 12; "path" → line null. */
export function parseFileRef(ref: string): DiffTarget {
  const m = /^(.*):(\d+)(?:-\d+)?$/.exec(ref);
  const file = m?.[1];
  if (!m || !file) return { file: ref, line: null };
  const line = Number(m[2]);
  return { file, line: line > 0 ? line : null };
}

export function isRiskKind(kind: string): kind is RiskKind {
  return (RISK_KINDS as readonly string[]).includes(kind);
}

export function riskKindIcon(kind: string): IconName {
  return RISK_KIND_ICON[isRiskKind(kind) ? kind : FALLBACK_RISK_KIND];
}
