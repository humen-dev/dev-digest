"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { CiFailOn, CiInstallation } from "@devdigest/shared";
import { relativeTime } from "@/lib/relative-time";
import { failOnLabelKey, hasDrift, runStatusKey } from "../../helpers";
import { STATE_COLORS } from "./constants";
import { s } from "./styles";

/** One CI installation: repo, system, PR/workflow state, last run, and drift of the exported gate. */
export function InstallationRow({
  installation,
  currentFailOn,
  onUpdate,
}: {
  installation: CiInstallation;
  currentFailOn: CiFailOn;
  onUpdate: () => void;
}) {
  const t = useTranslations("ci.ciTab");
  const tr = useTranslations("ci.runs");
  const state = installation.state ?? "unknown";
  const colors = STATE_COLORS[state];
  const lastRun = installation.last_run;
  const failOnText = (v: CiFailOn) => {
    const key = failOnLabelKey(v);
    return key ? t(key) : v;
  };
  const drift = installation.exported_ci_fail_on !== null && hasDrift(installation, currentFailOn);

  return (
    <div style={s.row}>
      <div style={s.main}>
        <Icon.GitBranch size={16} style={s.icon} />
        <span className="mono" style={s.repo}>
          {installation.repo}
        </span>
        <Badge color="var(--text-secondary)" icon="Workflow">
          {t("githubActions")}
        </Badge>
        <Badge color={colors.color} bg={colors.bg} dot>
          {t(`state.${state}`)}
        </Badge>
      </div>
      <div style={s.meta}>
        <span className="mono">
          {installation.workflow_version
            ? t("version", { version: installation.workflow_version })
            : t("versionUnknown")}
        </span>
        {installation.outdated && (
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("outdated")}
          </Badge>
        )}
        <span>
          {lastRun
            ? `${lastRun.verdict ? tr(`verdict.${lastRun.verdict}`) : tr(`status.${runStatusKey(lastRun.status)}`)} · ${relativeTime(lastRun.ran_at)}`
            : t("noRuns")}
        </span>
      </div>
      {drift && installation.exported_ci_fail_on && (
        <div style={s.drift}>
          <span style={s.driftText}>
            {t("drift", {
              installed: failOnText(installation.exported_ci_fail_on),
              current: failOnText(currentFailOn),
            })}
          </span>
          <Button kind="secondary" size="sm" icon="RefreshCw" onClick={onUpdate}>
            {t("updateCiConfig")}
          </Button>
        </div>
      )}
    </div>
  );
}
