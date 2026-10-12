"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge, Button, Icon, Skeleton, TextInput } from "@devdigest/ui";
import { useCiTargets } from "@/lib/hooks/ci";
import { CONFIG_TAB_HREF } from "../../constants";
import { providerNotSupported } from "../../helpers";
import { s } from "../../styles";

/** Step 1 — one card per target the server offers, the repo field, and the preview error states. */
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
  const showInvalid = repo.trim() !== "" && !repoValid;
  const unsupported = providerNotSupported(previewError);

  return (
    <>
      <div style={s.fieldGroup}>
        <label htmlFor="ci-repo" style={s.label}>
          {t("repoLabel")}
        </label>
        <TextInput
          id="ci-repo"
          value={repo}
          onChange={onRepo}
          placeholder={t("repoPlaceholder")}
          aria-invalid={showInvalid}
          aria-describedby="ci-repo-hint"
        />
        <span id="ci-repo-hint" style={showInvalid ? s.error : s.hint} role={showInvalid ? "alert" : undefined}>
          {showInvalid ? t("repoInvalid") : t("repoHint")}
        </span>
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
