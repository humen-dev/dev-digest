import type { CiRunStatus } from "@devdigest/shared";

export const STATUS_STYLE: Record<CiRunStatus, { color: string; bg: string }> = {
  succeeded: { color: "var(--ok)", bg: "var(--ok-bg)" },
  no_findings: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
};
