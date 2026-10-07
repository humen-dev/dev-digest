"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, ErrorState, TextInput } from "@devdigest/ui";
import { useBriefContextCandidates } from "@/lib/hooks/brief";
import { useProjectDocs } from "@/lib/hooks/project-context";
import { SEARCH_RESULT_LIMIT } from "../../constants";
import { effectiveSelection, searchProjectDocs, toggleSelection } from "../../helpers";
import { s } from "../../styles";

interface ContextPickerProps {
  prId: string;
  repoId: string;
  /** User's explicit selection; null = still the server's preselection. */
  picked: string[] | null;
  onChange: (paths: string[]) => void;
  disabled?: boolean;
}

/** "Context" popover: choose which project documents ground the brief (sent as `context_paths`). */
export function ContextPicker({ prId, repoId, picked, onChange, disabled }: ContextPickerProps) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const candidates = useBriefContextCandidates(prId, open);
  const projectDocs = useProjectDocs(open ? repoId : null);

  // Close on Escape / outside click while open (document-level listeners = external system).
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const candidateList = candidates.data?.candidates ?? [];
  const selection = effectiveSelection(candidateList, picked);
  const candidatePaths = new Set(candidateList.map((c) => c.path));
  const docTokens = new Map((projectDocs.data?.documents ?? []).map((d): [string, number] => [d.path, d.estimated_tokens]));
  // Documents added through search that the server did not propose.
  const extraPaths = selection.filter((p) => !candidatePaths.has(p));
  const results = searchProjectDocs(
    projectDocs.data?.documents ?? [],
    query,
    new Set([...candidatePaths, ...selection]),
    SEARCH_RESULT_LIMIT,
  );

  const tokensLabel = (n: number | undefined) => (n == null ? null : t("context.tokens", { count: n.toLocaleString("en-US") }));

  return (
    <div ref={rootRef} style={s.pickerWrap}>
      <Button
        kind="secondary"
        icon="FileText"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {t("actions.context")}
      </Button>

      {open && (
        <div role="dialog" aria-label={t("actions.context")} style={s.pickerPanel}>
          {candidates.isError ? (
            <ErrorState title={t("context.loadError")} onRetry={() => candidates.refetch()} />
          ) : (
            <>
              {candidateList.map((c) => {
                const checked = selection.includes(c.path);
                return (
                  <div key={c.path} style={s.pickerRow}>
                    <Checkbox
                      checked={checked}
                      onChange={() => onChange(toggleSelection(selection, c.path))}
                      label={
                        <span>
                          <span className="mono">{c.path}</span>{" "}
                          <span style={s.pickerTokens}>{tokensLabel(c.estimated_tokens)}</span>
                        </span>
                      }
                    />
                    {!checked && (
                      <span style={s.pickerReason}>
                        {t(`context.reason.${c.reason_code}`, { scope: c.scope ?? "" })}
                      </span>
                    )}
                  </div>
                );
              })}
              {extraPaths.map((p) => (
                <div key={p} style={s.pickerRow}>
                  <Checkbox
                    checked
                    onChange={() => onChange(toggleSelection(selection, p))}
                    label={
                      <span>
                        <span className="mono">{p}</span>{" "}
                        <span style={s.pickerTokens}>{tokensLabel(docTokens.get(p))}</span>
                      </span>
                    }
                  />
                </div>
              ))}
            </>
          )}

          <TextInput
            value={query}
            onChange={setQuery}
            placeholder={t("context.search")}
            aria-label={t("context.search")}
          />
          {results.map((d) => (
            <div key={d.path} style={s.searchResult}>
              <span className="mono">{d.path}</span>
              <Button
                kind="ghost"
                size="sm"
                icon="Plus"
                aria-label={d.path}
                onClick={() => {
                  onChange([...selection, d.path]);
                  setQuery("");
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
