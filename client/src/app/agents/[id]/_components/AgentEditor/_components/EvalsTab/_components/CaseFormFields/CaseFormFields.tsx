"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TextInput, Textarea, SelectInput } from "@devdigest/ui";
import type { EvalExpectationType } from "@devdigest/shared";
import { TruncatedText } from "@/components/eval/TruncatedText";
import { EXPECTATION_TYPES, type InputTab } from "../../constants";
import type { CaseDraft } from "../../types";
import { Field } from "./Field";
import { s } from "./styles";

/** Name, notes, the Diff / Files / PR meta input tabs and the expectation editor.
 *  `files` is shown only for a stored case (a new case derives its files server-side). */
export function CaseFormFields({
  draft,
  onChange,
  files,
}: {
  draft: CaseDraft;
  onChange: (patch: Partial<CaseDraft>) => void;
  files?: string[];
}) {
  const t = useTranslations("eval");
  const [tab, setTab] = useState<InputTab>("diff");
  const tabs = [
    { key: "diff", label: t("caseEditor.tabs.diff") },
    ...(files ? [{ key: "files", label: t("caseEditor.tabs.files") }] : []),
    { key: "prMeta", label: t("caseEditor.tabs.prMeta") },
  ];

  return (
    <div style={s.wrap}>
      <Field label={t("caseEditor.nameLabel")}>
        <TextInput value={draft.name} onChange={(name) => onChange({ name })} placeholder={t("caseEditor.namePlaceholder")} />
      </Field>
      <Field label={t("caseEditor.notes")}>
        <Textarea value={draft.notes} onChange={(notes) => onChange({ notes })} rows={2} />
      </Field>

      <div>
        <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as InputTab)} pad="0" />
        <div style={s.tabBody}>
          {tab === "diff" && (
            <Field label={t("caseEditor.inputLabel")} hidden>
              <Textarea
                value={draft.diff}
                onChange={(diff) => onChange({ diff })}
                rows={12}
                mono
                placeholder={t("caseEditor.diffPlaceholder")}
              />
            </Field>
          )}
          {tab === "files" && files && (
            <ul style={s.files}>
              {files.map((f) => (
                <li key={f}>
                  <TruncatedText text={f} mono />
                </li>
              ))}
            </ul>
          )}
          {tab === "prMeta" && (
            <div style={s.meta}>
              <Field label={t("caseEditor.titleLabel")}>
                <TextInput
                  value={draft.prTitle}
                  onChange={(prTitle) => onChange({ prTitle })}
                  placeholder={t("caseEditor.titlePlaceholder")}
                />
              </Field>
              <Field label={t("caseEditor.bodyLabel")}>
                <Textarea
                  value={draft.prBody}
                  onChange={(prBody) => onChange({ prBody })}
                  rows={5}
                  placeholder={t("caseEditor.bodyPlaceholder")}
                />
              </Field>
            </div>
          )}
        </div>
      </div>

      <fieldset style={s.fieldset}>
        <legend style={s.legend}>{t("caseEditor.expectation")}</legend>
        <div style={s.row}>
          <Field label={t("caseEditor.type")}>
            <SelectInput
              mono={false}
              value={draft.type}
              onChange={(v) => onChange({ type: v as EvalExpectationType })}
              options={EXPECTATION_TYPES.map((value) => ({
                value,
                label: t(value === "must_find" ? "pill.mustFind" : "pill.mustNotFlag"),
              }))}
            />
          </Field>
          <Field label={t("caseEditor.file")}>
            <TextInput mono value={draft.file} onChange={(file) => onChange({ file })} />
          </Field>
          <Field label={t("caseEditor.startLine")}>
            <TextInput mono inputMode="numeric" value={draft.startLine} onChange={(startLine) => onChange({ startLine })} />
          </Field>
          <Field label={t("caseEditor.endLine")}>
            <TextInput mono inputMode="numeric" value={draft.endLine} onChange={(endLine) => onChange({ endLine })} />
          </Field>
        </div>
      </fieldset>
    </div>
  );
}
