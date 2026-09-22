/* VersionDiffModal — v{version} → current, rendered with diff-viewer's own
   parsePatch + CodeLine over `GET /skills/:id/versions/:version/diff` (the
   server computes the unified-diff text; we just render it — same split as
   the PR diff viewer). CodeLine's comment affordances are unused here (no
   `commenting` prop passed), so only the gutter/+-/text rendering applies. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import { useSkillVersionDiff } from "../../../../../../../../../lib/hooks/skills";
import { parsePatch } from "../../../../../../../../../components/diff-viewer/helpers";
import { CodeLine } from "../../../../../../../../../components/diff-viewer/CodeLine";
import { s } from "./styles";

export function VersionDiffModal({
  skillId,
  version,
  onClose,
}: {
  skillId: string;
  version: number;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const { data, isLoading } = useSkillVersionDiff(skillId, version);
  const lines = React.useMemo(() => parsePatch(data?.patch), [data?.patch]);

  return (
    <Modal width={880} title={t("versionsTab.diffModalTitle", { version })} onClose={onClose}>
      <div style={s.body}>
        {isLoading && <div style={s.empty}>…</div>}
        {!isLoading && lines.length === 0 && <div style={s.empty}>{t("versionsTab.diffEmpty")}</div>}
        {lines.map((ln, i) => (
          <CodeLine key={i} ln={ln} path="" threads={[]} />
        ))}
      </div>
    </Modal>
  );
}
