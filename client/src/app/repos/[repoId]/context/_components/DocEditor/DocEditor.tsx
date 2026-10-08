/* DocEditor — the raw-Markdown editable view of the selected project document
   (AC-64). A controlled textarea: the draft lives in the parent (ProjectContextView)
   so it can gate navigation on unsaved changes (EC-23). Save sends path + text
   (AC-65); a failed save keeps the draft and shows an error with Retry (AC-68).
   The AC-70 warning is this component's only permanent fixture — it never
   shows in Preview. */
"use client";

import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { s } from "./styles";

export function DocEditor({
  path,
  value,
  onChange,
  onSave,
  saving,
  errorMessage,
}: {
  path: string;
  value: string;
  onChange: (text: string) => void;
  onSave: () => void;
  saving: boolean;
  errorMessage: string | null;
}) {
  const t = useTranslations("projectContext");

  return (
    <div style={s.wrap}>
      <span className="mono" style={s.path}>
        {path}
      </span>
      <div style={s.warning}>{t("editor.warning")}</div>
      <textarea
        className="mono"
        style={s.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("editor.textareaLabel")}
      />
      <div style={s.actions}>
        <Button kind="primary" icon="Check" loading={saving} onClick={onSave}>
          {t("editor.save")}
        </Button>
        {errorMessage && (
          <span style={s.error}>
            <Icon.AlertTriangle size={14} />
            {errorMessage}
            <Button kind="secondary" size="sm" icon="RefreshCw" onClick={onSave}>
              {t("editor.retry")}
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}
