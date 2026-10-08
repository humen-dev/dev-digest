/* CriticalPaths — one row per grounded critical file: icon, path, "— note"
   and an "Open" PathRef (AC-17). Without a clone the "Open" control is hidden
   entirely rather than shown disabled (EC-3); the path itself always stays
   plain text here — only the dedicated Open control links out. */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { TourPathItem } from "@devdigest/shared";
import { PathRef } from "../PathRef";
import { s } from "./styles";

export interface CriticalPathsProps {
  items: TourPathItem[];
  repoFullName: string;
  tourCommit: string;
  cloned: boolean;
}

export function CriticalPaths({ items, repoFullName, tourCommit, cloned }: CriticalPathsProps) {
  const t = useTranslations("onboarding");
  return (
    <ul style={s.list}>
      {items.map((item) => (
        <li key={item.path} style={s.row}>
          <Icon.FileText size={14} style={s.icon} />
          <span className="mono" title={item.path} style={s.path}>
            {item.path}
          </span>
          <span style={s.note}>— {item.note}</span>
          {item.importer_count != null && item.importer_count >= 1 && (
            <span style={s.importedBy}>{t("paths.importedBy", { count: item.importer_count })}</span>
          )}
          {cloned && (
            <PathRef path={item.path} repoFullName={repoFullName} tourCommit={tourCommit} cloned style={s.open}>
              {t("actions.open")}
            </PathRef>
          )}
        </li>
      ))}
    </ul>
  );
}
