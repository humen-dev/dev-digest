/* /multi-agent/configure — pick a PR, pick agents, start one multi-agent run. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, Icon, Skeleton, type DropdownItemDef } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { formatCost } from "@/lib/format-cost";
import { formatSeconds } from "@/lib/multi-agent-selection";
import { AgentCard } from "./_components/AgentCard";
import { StepHeader } from "./_components/StepHeader";
import { s } from "./styles";
import { useConfigureRun } from "./useConfigureRun";

export function ConfigureRun() {
  const t = useTranslations("multiAgent");
  const c = useConfigureRun();

  const prItems: DropdownItemDef[] = c.prOptions.map((p) => ({
    label: t("configure.prItem", { number: p.number, title: p.title }),
    icon: "GitPullRequest",
    onClick: () => c.setPrId(p.id),
  }));
  const duration = c.estimate.maxDurationMs == null ? "—" : formatSeconds(c.estimate.maxDurationMs);
  // AC-14: with no enabled agent the empty state replaces the agent list AND the run action.
  const noAgents = !c.agentsLoading && c.enabled.length === 0;

  return (
    <AppShell crumb={[{ label: t("title") }, { label: t("crumbConfigure") }]}>
      <div style={s.page}>
        <h1 style={s.h1}>{t("configure.heading")}</h1>
        <p style={s.subtitle}>{t("configure.subtitle")}</p>

        <StepHeader n={1} active>
          {t("configure.stepPr")}
        </StepHeader>
        <div style={s.prStep}>
          <Dropdown
            width={420}
            align="left"
            items={prItems}
            trigger={
              <Button kind="secondary" icon="GitPullRequest" iconRight="ChevronDown">
                {c.pr ? t("configure.prItem", { number: c.pr.number, title: c.pr.title }) : t("configure.selectPr")}
              </Button>
            }
          />
          {c.latest && (
            <Button kind="ghost" size="sm" onClick={() => c.openResults(c.latest?.id)}>
              {t("configure.viewLatest")}
            </Button>
          )}
        </div>

        <StepHeader
          n={2}
          active={!!c.prId}
          action={
            c.prId && c.enabled.length > 0 ? (
              <button type="button" style={s.textAction} onClick={() => c.setAll(!c.allSelected)}>
                {c.allSelected ? t("configure.clearAll") : t("configure.selectAll")}
              </button>
            ) : null
          }
        >
          {t("configure.stepAgents")}
        </StepHeader>
        <div style={s.stepBody}>
          {!noAgents && !c.prId && (
            <div style={s.placeholder}>
              <div style={s.placeholderIcon}>
                <Icon.GitPullRequest size={21} />
              </div>
              <div style={s.placeholderTitle}>{t("configure.pickPrTitle")}</div>
              <p style={s.placeholderBody}>{t("configure.pickPrBody")}</p>
            </div>
          )}
          {c.prId && c.agentsLoading && <Skeleton height={64} />}
          {noAgents && (
            <EmptyState
              icon="Cpu"
              title={t("configure.noAgentsTitle")}
              body={t("configure.noAgentsBody")}
              cta={t("configure.noAgentsCta")}
              onCta={c.goToAgents}
            />
          )}
          {c.prId && c.enabled.length > 0 && (
            <div style={s.cards}>
              {c.enabled.map((a) => (
                <AgentCard key={a.id} agent={a} on={c.selected.includes(a.id)} onToggle={() => c.toggle(a.id)} />
              ))}
            </div>
          )}
        </div>

        {!noAgents && (
          <div style={s.runBar}>
            <Button kind="primary" icon="Users" loading={c.isStarting} disabled={!c.canRun} onClick={c.run}>
              {t("picker.run", { count: c.selected.length })}
            </Button>
            {c.prId && c.selected.length > 0 && (
              <span className="mono" style={s.summary}>
                {t("picker.summary", { duration, cost: formatCost(c.estimate.costUsd) })}
              </span>
            )}
          </div>
        )}
        {c.errorMessage && (
          <div role="alert" style={s.error}>
            {c.inFlightId ? t("configure.inFlight") : c.errorMessage}
            {c.inFlightId && (
              <button type="button" style={s.errorLink} onClick={() => c.openResults(c.inFlightId ?? undefined)}>
                {t("configure.inFlightLink")}
              </button>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
