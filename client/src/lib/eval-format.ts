/**
 * Pure formatting helpers for the eval UI. Ratios are 0..1; `null` means "not
 * applicable" (no data), which is never rendered as 0.
 */
import { formatCost } from "./format-cost";

/** 0..1 → "83%"; null → the caller's localized "n/a". */
export function formatPercent(ratio: number | null | undefined, notApplicable: string): string {
  if (ratio == null || Number.isNaN(ratio)) return notApplicable;
  return `${Math.round(ratio * 100)}%`;
}

/** A ratio delta (0..1 scale) → signed points with ≤ 1 decimal ("+3.5", "−2", "0"); null → null. */
export function formatDeltaPoints(delta: number | null | undefined): string | null {
  if (delta == null || Number.isNaN(delta)) return null;
  const pts = Math.round(delta * 1000) / 10;
  if (pts === 0) return "0";
  const body = Number.isInteger(pts) ? String(Math.abs(pts)) : Math.abs(pts).toFixed(1);
  return `${pts > 0 ? "+" : "−"}${body}`;
}

/** Direction of a delta, used to pick a colour (the text always carries the sign too). */
export function deltaTone(delta: number | null | undefined): "up" | "down" | "flat" {
  if (delta == null || delta === 0 || Number.isNaN(delta)) return "flat";
  return delta > 0 ? "up" : "down";
}

/** Run cost; null → "—" (never "$0.00"). */
export function formatRunCost(costUsd: number | null | undefined): string {
  return formatCost(costUsd);
}

type VersionTranslator = (
  key: "versionLabel" | "versionSkillsDelta",
  values: { version: number },
) => string;

/** "v3" or "v3 · skills Δ" (localized by the caller's translator). */
export function formatVersionLabel(version: number, skillsDelta: boolean, t: VersionTranslator): string {
  return t(skillsDelta ? "versionSkillsDelta" : "versionLabel", { version });
}

/** Deterministic UTC "YYYY-MM-DD HH:mm" (no locale/timezone drift between server and client render); invalid → "—". */
export function formatRunTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}
