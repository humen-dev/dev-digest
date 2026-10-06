/* ProjectContextView — the Project Context page (SPEC-01, US-1/US-7): a
   folder tree of the repository's Markdown documents, a read-only Markdown
   preview with usage links, and an Edit mode that writes back to the clone
   working tree. No file/folder create, upload, rename or delete control
   (AC-14) — browsing and editing existing project documents only. */
"use client";

import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton, Tabs } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ApiError } from "@/lib/api";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { DocTree } from "../DocTree";
import { DocPreview } from "../DocPreview";
import { DocEditor } from "../DocEditor";
import { useProjectContextPage, type ViewMode } from "./hooks";
import { s } from "./styles";

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("projectContext");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const page = useProjectContextPage(repoId);

  const repoName = activeRepo?.name ?? activeRepo?.full_name ?? t("page.repoFallback");
  const crumb = [{ label: repoName, mono: true }, { label: t("page.crumb") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const { docsQuery } = page;
  const saveError = page.save.isError
    ? page.save.error instanceof ApiError
      ? page.save.error.message
      : t("editor.saveError")
    : null;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <h1 style={s.h1}>{t("page.title")}</h1>

        {docsQuery.isLoading ? (
          <Skeleton height={420} />
        ) : !docsQuery.data ? (
          <ErrorState
            body={docsQuery.error instanceof ApiError ? docsQuery.error.message : t("page.loadError")}
            onRetry={() => docsQuery.refetch()}
          />
        ) : !docsQuery.data.cloned ? (
          <EmptyState icon="GitBranch" title={t("page.notCloned.title")} body={t("page.notCloned.body")} />
        ) : (
          <div style={s.layout}>
            <div style={s.tree}>
              <DocTree
                documents={docsQuery.data.documents}
                total={docsQuery.data.total}
                scannedAt={docsQuery.data.scanned_at}
                selectedPath={page.selectedPath}
                onSelect={page.selectPath}
                onRefresh={() => docsQuery.refetch()}
              />
            </div>
            <div style={s.detail}>
              {page.selectedPath == null ? (
                <div style={s.hint}>{t("preview.selectHint")}</div>
              ) : (
                <>
                  <Tabs
                    tabs={[
                      { key: "preview", label: t("toggle.preview"), icon: "Eye" },
                      { key: "edit", label: t("toggle.edit"), icon: "Edit" },
                    ]}
                    value={page.mode}
                    onChange={(k) => page.setMode(k as ViewMode)}
                  />
                  {page.mode === "preview" ? (
                    <DocPreview
                      doc={page.docQuery.data}
                      isLoading={page.docQuery.isLoading}
                      isError={page.docQuery.isError}
                      usage={page.usageQuery.data}
                      saved={page.savedBanner}
                    />
                  ) : (
                    <DocEditor
                      path={page.selectedPath}
                      value={page.editText}
                      onChange={page.setEditText}
                      onSave={page.handleSave}
                      saving={page.save.isPending}
                      errorMessage={saveError}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {page.pending && (
        <ConfirmDialog
          title={t("confirm.title")}
          body={t("confirm.body")}
          confirmLabel={t("confirm.confirm")}
          cancelLabel={t("confirm.cancel")}
          onConfirm={page.confirmDiscard}
          onClose={page.cancelDiscard}
        />
      )}
    </AppShell>
  );
}
