/* FileCard — one collapsible file in the diff: header (path, findings dot,
   +/- stat, comment count) and, when open, its parsed lines, any outdated
   comments, and review findings whose line isn't in the rendered patch. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import type { DiffTarget } from "@/lib/pr-diff-target";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { anchorMarkers, markersForPath, type DiffFindingOverlay } from "../findings";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { UnanchoredFindings } from "../UnanchoredFindings";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findings,
  target,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingOverlay;
  /** Deep-link target (SPEC-04); only acted on when it names this file. */
  target?: DiffTarget | null;
}) {
  const t = useTranslations("shell");
  const tBrief = useTranslations("brief");
  const isTargetFile = target?.file === file.path;
  const targetLine = isTargetFile ? (target?.line ?? null) : null;
  const [open, setOpen] = React.useState(
    isTargetFile || (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  const headerRef = React.useRef<HTMLDivElement>(null);

  // Index of the rendered new-side line the target points at (-1: not rendered).
  const targetIndex = React.useMemo(
    () =>
      targetLine == null
        ? -1
        : lines.findIndex((ln) => (ln.kind === "add" || ln.kind === "ctx") && ln.newNo === targetLine),
    [lines, targetLine],
  );
  const lineMissing = targetLine != null && targetIndex < 0;

  React.useEffect(() => {
    if (!isTargetFile) return;
    setOpen(true);
    // A rendered target line scrolls itself (CodeLine); otherwise land on the header.
    if (targetIndex < 0) headerRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [isTargetFile, targetLine, targetIndex]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  // Review findings for this file, anchored to a rendered RIGHT line or not.
  const fileFindings = React.useMemo(
    () => markersForPath(findings, file.path),
    [findings, file.path]
  );
  const { byLine: findingsByLine, unanchored: unanchoredFindings } = React.useMemo(() => {
    const rightLines = new Set<number>();
    for (const ln of lines) {
      if ((ln.kind === "add" || ln.kind === "ctx") && ln.newNo != null) rightLines.add(ln.newNo);
    }
    return anchorMarkers(fileFindings, rightLines);
  }, [fileFindings, lines]);
  const showFindingCards = findings?.showCards !== false;

  return (
    <div style={s.fileCard}>
      <div
        ref={headerRef}
        onClick={() => setOpen((o) => !o)}
        style={isTargetFile ? { ...s.fileHeader, ...s.fileCardTarget } : s.fileHeader}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {fileFindings.length > 0 && (
          <span
            role="img"
            aria-label={t("diffViewer.hasFindings")}
            title={t("diffViewer.hasFindings")}
            style={s.findingDot}
          />
        )}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {lineMissing && (
        <div role="status" style={s.targetNotice}>
          {tBrief("nav.lineNotInDiff", { line: targetLine })}
        </div>
      )}
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                markers={ln.newNo != null ? findingsByLine.get(ln.newNo) : undefined}
                showFindingCards={showFindingCards}
                isTarget={i === targetIndex}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {showFindingCards && <UnanchoredFindings markers={unanchoredFindings} />}
        </div>
      )}
    </div>
  );
}
