import type { CiInstallationState } from "@devdigest/shared";

/** State chip colours; `unknown` covers a null state (AC-39). */
export const STATE_COLORS: Record<CiInstallationState | "unknown", { color: string; bg: string }> = {
  active: { color: "var(--ok)", bg: "var(--ok-bg)" },
  pr_open: { color: "var(--warn)", bg: "var(--warn-bg)" },
  pr_closed: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
  unknown: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};
