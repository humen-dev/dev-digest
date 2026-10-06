/* DocPreview — read-only Markdown render of the selected project document
   (AC-8), its estimated tokens (AC-34, "≈" prefix) and the agents/skills that
   attach it, each linking to its editor's Context tab (AC-9, AC-10). Markdown
   goes through the shared, already-hardened `<Markdown>` (UT-4: react-markdown
   neutralises raw HTML and dangerous URL schemes by default) — never render
   document text with `dangerouslySetInnerHTML`. */
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Markdown, Skeleton } from "@devdigest/ui";
import type { ProjectDocumentContent, ProjectDocumentUsage } from "@devdigest/shared";
import { s } from "./styles";

export function DocPreview({
  doc,
  isLoading,
  isError,
  usage,
  saved,
}: {
  doc: ProjectDocumentContent | undefined;
  isLoading: boolean;
  isError: boolean;
  usage: ProjectDocumentUsage | undefined;
  saved?: boolean;
}) {
  const t = useTranslations("projectContext");

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={20} width={240} style={{ marginBottom: 14 }} />
        <Skeleton height={14} style={{ marginBottom: 8 }} />
        <Skeleton height={14} style={{ marginBottom: 8 }} />
        <Skeleton height={14} width="70%" />
      </div>
    );
  }

  if (isError || !doc) {
    return <div style={s.wrap}>{t("preview.notFound")}</div>;
  }

  const usageItems = [
    ...(usage?.agents.map((a) => ({ ...a, href: `/agents/${a.id}?tab=context` })) ?? []),
    ...(usage?.skills.map((skillRef) => ({ ...skillRef, href: `/skills/${skillRef.id}?tab=context` })) ?? []),
  ];

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span className="mono" style={s.path}>
          {doc.path}
        </span>
        <span style={s.tokens}>{t("preview.tokens", { count: doc.estimated_tokens })}</span>
        {saved && <span style={s.saved}>{t("preview.saved")}</span>}
      </div>
      {usageItems.length > 0 && (
        <div style={s.usage}>
          <span style={s.usageLabel}>{t("preview.usedBy")}</span>
          {usageItems.map((item, i) => (
            <span key={item.href}>
              <Link href={item.href}>{item.name}</Link>
              {i < usageItems.length - 1 ? "," : ""}
            </span>
          ))}
        </div>
      )}
      <div style={s.body}>
        <Markdown>{doc.text}</Markdown>
      </div>
    </div>
  );
}
