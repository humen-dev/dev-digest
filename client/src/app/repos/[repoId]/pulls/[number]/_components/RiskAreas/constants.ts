import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

/** Client copy of the server's risk-kind vocabulary (server RISK_KINDS). */
export const RISK_KINDS = [
  "auth_surface",
  "dependency",
  "performance",
  "data_migration",
  "api_contract",
  "config_secrets",
  "test_coverage",
  "other",
] as const;
export type RiskKind = (typeof RISK_KINDS)[number];

/** Exhaustive: adding a kind to RISK_KINDS without an icon is a type error. */
export const RISK_KIND_ICON: Record<RiskKind, IconName> = {
  auth_surface: "Shield",
  dependency: "Boxes",
  performance: "Zap",
  data_migration: "Database",
  api_contract: "AlertOctagon",
  config_secrets: "Lock",
  test_coverage: "FlaskConical",
  other: "AlertTriangle",
};

export const FALLBACK_RISK_KIND: RiskKind = "other";

export const RISK_SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--info)",
};

export const RISK_SEVERITY_ORDER: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };
