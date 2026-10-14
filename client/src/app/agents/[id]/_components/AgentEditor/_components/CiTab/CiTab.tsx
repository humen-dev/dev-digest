/* CiTab — the agent's CI deployment: where it runs, the "Fail CI on" gate, the required-check
   name, installations with drift, recent runs, and the Export to CI wizard entry points (SPEC-08). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, CiFailOn, CiInstallation } from "@devdigest/shared";
import { useCiInstallations, useCiRuns } from "@/lib/hooks/ci";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { ExportWizard, type ExportWizardProps } from "./_components/ExportWizard";
import { FailOnControl } from "./_components/FailOnControl";
import { InstallationPicker } from "./_components/InstallationPicker";
import { InstallationRow } from "./_components/InstallationRow";
import { RecentRuns } from "./_components/RecentRuns";
import { ALL_TIME_FROM, COPIED_RESET_MS, RECENT_RUNS_LIMIT, REQUIRED_CHECK_NAME } from "./constants";
import { countActive, updateInitial } from "./helpers";
import { s } from "./styles";

type WizardInitial = NonNullable<ExportWizardProps["initial"]>;

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci.ciTab");
  const toast = useToast();
  const installationsQuery = useCiInstallations(agent.id);
  const runsQuery = useCiRuns({ agent_id: agent.id, from: ALL_TIME_FROM, limit: RECENT_RUNS_LIMIT });
  const updateAgent = useUpdateAgent();
  const [wizard, setWizard] = React.useState<WizardInitial | null>(null);
  const [picking, setPicking] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const installations = installationsQuery.data;
  const runs = runsQuery.data?.runs ?? [];

  const selectFailOn = (value: CiFailOn) => {
    if (updateAgent.isPending || value === agent.ci_fail_on) return;
    updateAgent.mutate({ id: agent.id, patch: { ci_fail_on: value } }, { onError: () => toast.error(t("failOnError")) });
  };

  const copyCheckName = async () => {
    try {
      await navigator.clipboard.writeText(REQUIRED_CHECK_NAME);
      setCopied(true);
    } catch {
      /* clipboard unavailable or denied — the name stays visible to copy by hand */
    }
  };

  const startUpdate = (installation: CiInstallation) => {
    setPicking(false);
    setWizard(updateInitial(installation));
  };

  const onHeaderUpdate = () => {
    const [only, ...rest] = installations ?? [];
    if (!only) return;
    if (rest.length === 0) startUpdate(only);
    else setPicking(true);
  };

  const hasInstallations = !!installations && installations.length > 0;

  return (
    <div style={s.wrap}>
      <ExportWizard
        agentId={agent.id}
        agentName={agent.name}
        open={wizard !== null}
        initial={wizard ?? undefined}
        onClose={() => setWizard(null)}
      />
      {picking && installations && (
        <InstallationPicker installations={installations} onPick={startUpdate} onClose={() => setPicking(false)} />
      )}

      <div>
        <div style={s.header}>
          <h2 style={s.h2}>{t("heading")}</h2>
          {installations && countActive(installations) > 0 && (
            <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
              {t("activeIn", { count: countActive(installations) })}
            </Badge>
          )}
          {hasInstallations && (
            <div style={s.headerActions}>
              <Button kind="secondary" size="sm" icon="RefreshCw" onClick={onHeaderUpdate}>
                {t("updateCiConfig")}
              </Button>
              <Button kind="primary" size="sm" icon="Plus" onClick={() => setWizard({ step: "target" })}>
                {t("addToCi")}
              </Button>
            </div>
          )}
        </div>
        <p style={s.subtitle}>{t("subtitle")}</p>
      </div>

      <FailOnControl value={agent.ci_fail_on} disabled={updateAgent.isPending} onSelect={selectFailOn} />

      <div style={s.requiredCheck}>
        <span style={s.requiredLabel}>{t("requiredCheckLabel")}</span>
        <code className="mono" style={s.requiredName}>
          {REQUIRED_CHECK_NAME}
        </code>
        <Button size="sm" icon={copied ? "Check" : "Copy"} onClick={copyCheckName}>
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>

      {installationsQuery.isLoading ? (
        <Skeleton height={64} />
      ) : !installations ? (
        <div role="alert" style={s.error}>
          {t("loadError")}
        </div>
      ) : installations.length === 0 ? (
        <EmptyState
          icon="Workflow"
          title={t("emptyTitle")}
          body={t("emptyBody")}
          cta={t("addToCi")}
          onCta={() => setWizard({ step: "target" })}
        />
      ) : (
        <div style={s.list}>
          {installations.map((inst) => (
            <InstallationRow
              key={inst.id}
              installation={inst}
              currentFailOn={agent.ci_fail_on}
              onUpdate={() => startUpdate(inst)}
            />
          ))}
          <button type="button" style={s.addRepo} onClick={() => setWizard({ step: "target", repo: "" })}>
            <Icon.Plus size={15} />
            {t("addRepository")}
          </button>
        </div>
      )}

      {runs.length > 0 && <RecentRuns agentId={agent.id} runs={runs} />}
    </div>
  );
}
