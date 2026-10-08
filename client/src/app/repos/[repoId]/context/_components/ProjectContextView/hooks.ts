/* ProjectContextView/hooks.ts — orchestration for the Project Context page:
   which document is selected, Preview/Edit mode, the Edit draft, the save
   mutation and the EC-23 unsaved-changes guard (confirm dialog + native
   beforeunload). Kept out of the component so the JSX stays render-only. */
"use client";

import React from "react";
import {
  useProjectDoc,
  useProjectDocUsage,
  useProjectDocs,
  useSaveProjectDoc,
} from "@/lib/hooks/project-context";

export type ViewMode = "preview" | "edit";

type PendingAction = { type: "select"; path: string } | { type: "toggle-preview" };

export function useProjectContextPage(repoId: string | null | undefined) {
  const docsQuery = useProjectDocs(repoId);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [mode, rawSetMode] = React.useState<ViewMode>("preview");
  const [editText, setEditTextState] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<PendingAction | null>(null);
  const [savedBanner, setSavedBanner] = React.useState(false);

  const docQuery = useProjectDoc(repoId, selectedPath);
  const usageQuery = useProjectDocUsage(repoId, selectedPath);
  const save = useSaveProjectDoc(repoId);

  const dirty = mode === "edit" && editText != null && editText !== docQuery.data?.text;

  // Native "leave site?" prompt while a draft is unsaved — the beforeunload
  // third of EC-23 (document switch and the Preview toggle are the other two,
  // both handled below without the browser). No sidebar-link guard (EC-23
  // decision, 2026-10-06) — see the unit's report.
  React.useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function setEditText(text: string) {
    setEditTextState(text);
  }

  function selectPath(path: string) {
    if (dirty) {
      setPending({ type: "select", path });
      return;
    }
    setSelectedPath(path);
    rawSetMode("preview");
    setEditTextState(null);
    setSavedBanner(false);
  }

  function setMode(next: ViewMode) {
    if (mode === "edit" && next === "preview" && dirty) {
      setPending({ type: "toggle-preview" });
      return;
    }
    if (next === "edit" && !docQuery.data) return; // nothing to edit yet
    rawSetMode(next);
    setSavedBanner(false);
    setEditTextState(next === "edit" ? docQuery.data?.text ?? "" : null);
  }

  function confirmDiscard() {
    if (!pending) return;
    if (pending.type === "select") setSelectedPath(pending.path);
    rawSetMode("preview");
    setEditTextState(null);
    setSavedBanner(false);
    setPending(null);
  }

  function cancelDiscard() {
    setPending(null);
  }

  function handleSave() {
    if (selectedPath == null || editText == null) return;
    save.mutate(
      { path: selectedPath, text: editText },
      {
        onSuccess: () => {
          rawSetMode("preview");
          setEditTextState(null);
          setSavedBanner(true);
        },
      },
    );
  }

  return {
    docsQuery,
    selectedPath,
    selectPath,
    mode,
    setMode,
    docQuery,
    usageQuery,
    editText: editText ?? "",
    setEditText,
    dirty,
    save,
    handleSave,
    savedBanner,
    pending,
    confirmDiscard,
    cancelDiscard,
  };
}
