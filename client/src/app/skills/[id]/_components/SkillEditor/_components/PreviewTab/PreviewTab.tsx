/* PreviewTab — the body rendered exactly as the reviewing agent receives it
   (`<Markdown>` from @devdigest/ui). For an imported-file skill, an extra line
   flags the untrusted origin — the body is inserted into the trusted part of
   the prompt without wrapUntrusted (see reviewer-core's prompt.ts). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("tabs.preview")}</h2>
      <p style={s.caption}>{t("previewTab.caption")}</p>
      <div style={s.card}>
        {skill.body.trim() ? <Markdown>{skill.body}</Markdown> : <div style={s.empty}>{t("previewTab.empty")}</div>}
      </div>
      {skill.source === "imported_file" && (
        <div style={s.untrustedNotice}>
          <Icon.AlertTriangle size={15} />
          <span>{t("previewTab.untrustedNotice")}</span>
        </div>
      )}
    </div>
  );
}
