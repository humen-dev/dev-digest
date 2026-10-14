"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge, Button, Icon, SearchableSelect, Skeleton } from "@devdigest/ui";
import { useCiTargets } from "@/lib/hooks/ci";
import { useRepos } from "@/lib/hooks/core";
import { CONFIG_TAB_HREF } from "../../constants";
import { providerNotSupported, repoOptions } from "../../helpers";
import { s } from "../../styles";

/** Step 1 — one card per target the server offers, the repo picker, and the preview error states. */
export function TargetStep({
  repo,
  onRepo,
  repoValid,
  previewError,
  onClose,
}: {
  repo: string;
  onRepo: (value: string) => void;
  repoValid: boolean;
  previewError: unknown;
  onClose: () => void;
}) {
  const t = useTranslations("ci.exportWizard");
  const tRoot = useTranslations("ci"); // `label_key` from the server is relative to the ci namespace
  const { data: targets, isLoading, isError, refetch } = useCiTargets();
  const { data: repos, isLoading: reposLoading } = useRepos();
  const options = repoOptions(repos ?? [], repo);
  const showInvalid = repo.trim() !== "" && !repoValid;
  const unsupported = providerNotSupported(previewError);

  return (
    <>
      <div style={s.fieldGroup}>
        <span id="ci-repo-label" style={s.label}>
          {t("repoLabel")}
        </span>
        {reposLoading ? (
          <Skeleton height={42} />
        ) : (
          <div role="group" aria-labelledby="ci-repo-label" aria-describedby="ci-repo-hint">
            <SearchableSelect
              value={repo}
              onChange={onRepo}
              options={options}
              placeholder={t("repoSearchPlaceholder")}
            />
          </div>
        )}
        <span id="ci-repo-hint" style={showInvalid ? s.error : s.hint} role={showInvalid ? "alert" : undefined}>
          {showInvalid ? t("repoInvalid") : t("repoHint")}
        </span>
        {!reposLoading && options.length === 0 && (
          <span style={s.hint}>
            {t("repoEmpty")} <Link href="/onboarding">{t("repoAdd")}</Link>
          </span>
        )}
        {unsupported && (
          <div role="alert" style={s.error}>
            {t("providerNotSupported", { provider: unsupported.provider ?? "" })}{" "}
            <Link href={CONFIG_TAB_HREF} onClick={onClose}>
              {t("openConfig")}
            </Link>
          </div>
        )}
        {!unsupported && previewError ? (
          <div role="alert" style={s.error}>
            {t("exportError", { message: previewError instanceof Error ? previewError.message : "" })}
          </div>
        ) : null}
      </div>

      <div style={s.fieldGroup}>
        <span style={s.label}>{t("steps.target")}</span>
        {isLoading && <Skeleton height={48} />}
        {isError && (
          <div role="alert" style={s.row}>
            <span style={s.error}>{t("targetsError")}</span>
            <Button size="sm" onClick={() => void refetch()}>
              {t("retry")}
            </Button>
          </div>
        )}
        <div role="radiogroup" aria-label={t("steps.target")} style={s.fieldGroup}>
          {(targets ?? []).map((opt) => (
            <button key={opt.target} type="button" role="radio" aria-checked style={s.card(true)}>
              <Icon.GitBranch size={16} />
              <div style={{ flex: 1 }}>
                <div style={s.cardTitle}>{tRoot(opt.label_key)}</div>
                <div style={s.hint}>{tRoot(`${opt.label_key}Desc`)}</div>
              </div>
              <Badge>{t("recommended")}</Badge>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
