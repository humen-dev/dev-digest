import type { CiFailOn, CiInstallation, CiRunStatus } from "@devdigest/shared";
import type { ExportWizardProps } from "./_components/ExportWizard";

/** AC-59 — how many installations are live (`active`); `pr_open` / `pr_closed` / unknown do not count. */
export function countActive(installations: readonly CiInstallation[]): number {
  return installations.filter((i) => i.state === "active").length;
}

/** AC-54 — the exported gate differs from the agent's current one. Unknown (null) is not drift. */
export function hasDrift(installation: CiInstallation, current: CiFailOn): boolean {
  return installation.exported_ci_fail_on !== null && installation.exported_ci_fail_on !== current;
}

/** ci.json key (under `ciTab.`) for a `CiFailOn`; `any` has none, the caller shows the raw value. */
export function failOnLabelKey(value: CiFailOn): string | null {
  return value === "any" ? null : `failOn.${value}`;
}

/** ci.json key (under `runs.status.`) for a run status. */
export function runStatusKey(status: CiRunStatus): string {
  return status === "no_findings" ? "noFindings" : status;
}

/** Wizard pre-fill for "Update CI config": opens at Preview with the installation's saved settings. */
export function updateInitial(installation: CiInstallation): NonNullable<ExportWizardProps["initial"]> {
  return {
    step: "preview",
    repo: installation.repo,
    triggers: installation.triggers.length > 0 ? installation.triggers : undefined,
    post_as: installation.post_as ?? undefined,
  };
}

/** Roving-radio navigation: index reached from `current` by an arrow key, or null for other keys. */
export function nextRadioIndex(key: string, current: number, count: number): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + count) % count;
  return null;
}

/** Link to the CI Runs page filtered to one agent (the page reads the `agent` search param). */
export function agentRunsHref(agentId: string): string {
  return `/ci-runs?agent=${encodeURIComponent(agentId)}`;
}
