import type { CSSProperties } from "react";

/** Co-located styles for SkillBodyEditor. Gutter + textarea share font-size/
    line-height/vertical padding so line numbers line up with their text row
    (same technique as diff-viewer's CodeLine gutter, applied to a live textarea
    instead of static diff lines). */
export const s = {
  wrap: { marginTop: 4, marginBottom: 20 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } satisfies CSSProperties,
  fileName: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  bodyWrap: {
    display: "flex",
    border: "1px solid var(--border-strong)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-elevated)",
    height: 320,
  } satisfies CSSProperties,
  gutter: {
    flexShrink: 0,
    width: 44,
    padding: "10px 0",
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border)",
    overflow: "hidden",
    textAlign: "right",
  } satisfies CSSProperties,
  gutterLine: {
    fontSize: 13,
    lineHeight: "20px",
    color: "var(--text-muted)",
    padding: "0 8px",
  } satisfies CSSProperties,
  textarea: {
    flex: 1,
    resize: "none",
    border: "none",
    outline: "none",
    padding: "10px 12px",
    fontSize: 13,
    lineHeight: "20px",
    color: "var(--text-primary)",
    background: "transparent",
  } satisfies CSSProperties,
} as const;
