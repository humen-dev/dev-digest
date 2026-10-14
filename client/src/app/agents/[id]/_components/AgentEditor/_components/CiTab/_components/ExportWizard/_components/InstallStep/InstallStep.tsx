"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { CiExport, CiExportInputBody } from "@devdigest/shared";
import { useCiArchive, useExportCi } from "@/lib/hooks/ci";
import { ZIP_FILENAME } from "../../constants";
import { errorMessage } from "../../helpers";
import { s } from "../../styles";

type InstallMode = "pr" | "zip";

function saveBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ZIP_FILENAME;
  a.click();
  URL.revokeObjectURL(url);
}

/** Step 4 — open a PR (default, recommended) or download the files as a zip. */
export function InstallStep({
  agentId,
  input,
  fileCount,
}: {
  agentId: string;
  input: CiExportInputBody;
  fileCount: number;
}) {
  const t = useTranslations("ci.exportWizard");
  const [mode, setMode] = React.useState<InstallMode>("pr");
  const [outcome, setOutcome] = React.useState<{ data: CiExport; status: number } | null>(null);
  const exportCi = useExportCi(agentId);
  const archive = useCiArchive(agentId);

  const install = () => {
    if (mode === "pr") exportCi.mutate(input, { onSuccess: setOutcome });
    else archive.mutate(input, { onSuccess: saveBlob });
  };

  const pending = mode === "pr" ? exportCi.isPending : archive.isPending;
  const error = mode === "pr" ? exportCi.error : archive.error;

  return (
    <>
      <div role="radiogroup" aria-label={t("steps.install")} style={s.installCards}>
        <label style={s.card(mode === "pr")}>
          <input type="radio" name="install-mode" checked={mode === "pr"} onChange={() => setMode("pr")} />
          <div style={{ flex: 1 }}>
            <div style={s.cardTitle}>{t("installPr")}</div>
            <div style={s.hint}>{t("installPrBody", { repo: input.repo, count: fileCount })}</div>
          </div>
          <Badge>{t("recommended")}</Badge>
        </label>
        <label style={s.card(mode === "zip")}>
          <input type="radio" name="install-mode" checked={mode === "zip"} onChange={() => setMode("zip")} />
          <div style={{ flex: 1 }}>
            <div style={s.cardTitle}>{t("installZip")}</div>
            <div style={s.hint}>{t("installZipBody")}</div>
          </div>
        </label>
      </div>

      {error ? (
        <div role="alert" style={s.error}>
          {t("exportError", { message: errorMessage(error) })}
        </div>
      ) : null}

      {mode === "pr" && outcome && (
        <div role="status" style={s.note}>
          {outcome.data.refused_reason ? (
            <span>{outcome.data.refused_reason}</span>
          ) : (
            <>
              <strong>{t("successTitle")}</strong>
              {outcome.status !== 201 && <div>{t("successReused")}</div>}
              {outcome.data.pr_url && (
                <a href={outcome.data.pr_url} target="_blank" rel="noreferrer">
                  {t("viewPr")}
                </a>
              )}
            </>
          )}
        </div>
      )}

      <div style={s.installRow}>
        <Button kind="primary" onClick={install} disabled={pending}>
          {pending ? t("installing") : mode === "pr" ? t("install") : t("downloadZip")}
        </Button>
      </div>
    </>
  );
}
