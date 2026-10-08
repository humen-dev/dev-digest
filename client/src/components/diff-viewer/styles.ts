import type { CSSProperties } from "react";
import type { Line } from "./helpers";

/** Co-located styles for the DiffViewer (extracted from inline styles). */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  empty: { padding: "24px", fontSize: 14, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
  fileCard: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  fileHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filePath: {
    fontSize: 13,
    fontWeight: 500,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  /** Keeps a scrolled-to file header clear of the sticky PR header. */
  fileCardTarget: { scrollMarginTop: "var(--pr-detail-header-h)" } satisfies CSSProperties,
  /** Notice at the file header when the deep-linked line is not in the diff. */
  targetNotice: {
    padding: "6px 12px",
    fontSize: 12,
    color: "var(--warn)",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  /** Pulse on the deep-linked line; `scroll-margin` clears the sticky header. */
  lineTarget: {
    scrollMarginTop: "calc(var(--pr-detail-header-h) + 40px)",
  } satisfies CSSProperties,
  lineTargetHighlight: {
    outline: "2px solid var(--accent)",
    outlineOffset: -2,
    background: "var(--accent-bg)",
  } satisfies CSSProperties,
  fileStat: { fontSize: 12 } satisfies CSSProperties,
  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,
  fileBody: {
    borderTop: "1px solid var(--border)",
    padding: "8px 0",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  noDiff: {
    padding: "14px 18px",
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
  hunk: {
    fontSize: 12,
    lineHeight: "20px",
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    padding: "0 14px",
  } satisfies CSSProperties,
  lineNo: {
    width: 44,
    textAlign: "right",
    padding: "0 10px 0 0",
    color: "var(--text-muted)",
    userSelect: "none",
    flexShrink: 0,
  } satisfies CSSProperties,
  lineText: {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-primary)",
    paddingRight: 12,
  } satisfies CSSProperties,
  /** Small dot after a file's path when it has review findings — no number. */
  findingDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "var(--crit)",
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the file card is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}

/** Row background per line kind (add/del tinted, others transparent). */
export function lineRowFor(kind: Line["kind"]): CSSProperties {
  const background = kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent";
  return { display: "flex", alignItems: "stretch", fontSize: 13, lineHeight: "20px", background };
}

/** Gutter sign colour per line kind. */
export function lineSignFor(kind: Line["kind"]): CSSProperties {
  return {
    width: 14,
    textAlign: "center",
    color: kind === "add" ? "var(--code-add-text)" : kind === "del" ? "var(--code-del-text)" : "var(--text-muted)",
    flexShrink: 0,
  };
}

/** Same row as `lineRowFor`, plus a severity-coloured left bar for a flagged
    line (drawn with an inset box-shadow so it never shifts the row's width). */
export function findingRowFor(kind: Line["kind"], color: string): CSSProperties {
  const background = kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent";
  return {
    display: "flex",
    alignItems: "stretch",
    fontSize: 13,
    lineHeight: "20px",
    background,
    boxShadow: `inset 3px 0 0 0 ${color}`,
  };
}

/** Right-aligned severity pill on a flagged line (icon + "blocker"/"warning"/"suggestion"). */
export function findingPillStyle(color: string, background: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    margin: "2px 12px",
    borderRadius: 999,
    color,
    background,
    flexShrink: 0,
    whiteSpace: "nowrap",
  };
}

/** Left border in the finding's severity colour for its card, in the rail below the line. */
export function findingCardRailStyle(color: string): CSSProperties {
  return { borderLeft: `3px solid ${color}`, paddingLeft: 10 };
}
