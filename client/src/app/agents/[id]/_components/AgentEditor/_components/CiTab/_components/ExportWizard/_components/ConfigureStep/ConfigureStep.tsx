"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { CiPostAs, CiSecretStatus, CiTrigger } from "@devdigest/shared";
import { useCiSecrets } from "@/lib/hooks/ci";
import { ALL_TRIGGERS, GITHUB_TOKEN_NAME, OPENROUTER_SECRET_NAME, POST_AS_OPTIONS } from "../../constants";
import { errorMessage, toggleTrigger } from "../../helpers";
import { s } from "../../styles";

const SECRET_STATUS_KEY = { set: "set", not_set: "notSet", unknown: "unknown" } as const satisfies Record<
  CiSecretStatus["status"],
  string
>;

/** Step 3 — triggers, post-as, expected secrets and the required-check note. */
export function ConfigureStep({
  agentId,
  repo,
  triggers,
  onTriggers,
  postAs,
  onPostAs,
}: {
  agentId: string;
  repo: string;
  triggers: CiTrigger[];
  onTriggers: (next: CiTrigger[]) => void;
  postAs: CiPostAs;
  onPostAs: (next: CiPostAs) => void;
}) {
  const t = useTranslations("ci.exportWizard");
  const secrets = useCiSecrets(agentId, repo.trim());

  return (
    <>
      <div style={s.fieldGroup} role="group" aria-labelledby="ci-trigger-label">
        <span id="ci-trigger-label" style={s.label}>
          {t("triggerLabel")}
        </span>
        <div style={s.row}>
          {ALL_TRIGGERS.map((trigger) => {
            const active = triggers.includes(trigger);
            return (
              <button
                key={trigger}
                type="button"
                aria-pressed={active}
                style={s.chip(active)}
                onClick={() => onTriggers(toggleTrigger(triggers, trigger))}
              >
                {active && <Icon.Check size={13} />}
                {`pull_request:${trigger}`}
              </button>
            );
          })}
        </div>
        {triggers.length === 0 && (
          <span role="alert" style={s.error}>
            {t("triggerRequired")}
          </span>
        )}
      </div>

      <div style={s.fieldGroup} role="radiogroup" aria-labelledby="ci-postas-label">
        <span id="ci-postas-label" style={s.label}>
          {t("postResultsLabel")}
        </span>
        {POST_AS_OPTIONS.map((opt) => (
          <label key={opt.value} style={s.radioRow}>
            <input type="radio" name="post-as" checked={postAs === opt.value} onChange={() => onPostAs(opt.value)} />
            {t(`postAs.${opt.labelKey}`)}
            {opt.value === "github_review" && <Badge>{t("recommended")}</Badge>}
          </label>
        ))}
      </div>

      <div style={s.fieldGroup}>
        <span style={s.label}>{t("secretsHeading")}</span>
        {secrets.isError && (
          <span role="alert" style={s.error}>
            {errorMessage(secrets.error)}
          </span>
        )}
        {(secrets.data ?? []).map((secret) => (
          <div key={secret.name} style={s.secretRow}>
            <span className="mono">{secret.name}</span>
            <span style={s.secretDesc}>{secret.name === OPENROUTER_SECRET_NAME ? t("secretOpenRouterDesc") : ""}</span>
            <Badge>{t(`secret.${SECRET_STATUS_KEY[secret.status]}`)}</Badge>
          </div>
        ))}
        <div style={s.secretRow}>
          <span className="mono">{GITHUB_TOKEN_NAME}</span>
          <span style={s.secretDesc}>{t("secretGithubTokenDesc")}</span>
          <Badge icon="Check" color="var(--ok)">
            {t("secret.ready")}
          </Badge>
        </div>
        <span style={s.hint}>{t("secretsNote")}</span>
      </div>

      <div style={s.note}>{t("requiredCheckNote")}</div>
    </>
  );
}
