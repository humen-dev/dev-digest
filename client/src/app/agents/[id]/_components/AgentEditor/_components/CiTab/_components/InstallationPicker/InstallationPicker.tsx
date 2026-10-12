"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import type { CiInstallation } from "@devdigest/shared";
import { s } from "./styles";

/** EC-12 — with several installations, "Update CI config" first asks which one to update. */
export function InstallationPicker({
  installations,
  onPick,
  onClose,
}: {
  installations: readonly CiInstallation[];
  onPick: (installation: CiInstallation) => void;
  onClose: () => void;
}) {
  const t = useTranslations("ci");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button[data-pick]")?.focus();
  }, []);

  return (
    <div style={s.overlay}>
      <div style={s.backdrop} onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ci-picker-title"
        style={s.dialog}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div style={s.header}>
          <div id="ci-picker-title" style={s.title}>
            {t("ciTab.chooseInstallation")}
          </div>
          <IconBtn icon="X" label={t("exportWizard.close")} onClick={onClose} />
        </div>
        <ul style={s.list}>
          {installations.map((inst) => (
            <li key={inst.id}>
              <button type="button" data-pick style={s.option} onClick={() => onPick(inst)}>
                <span className="mono">{inst.repo}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
