import type { CSSProperties } from "react";

/** Co-located styles for the installation picker dialog. */
export const s = {
  overlay: { position: "fixed", inset: 0, display: "grid", placeItems: "center", zIndex: 50, padding: 28 } satisfies CSSProperties,
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" } satisfies CSSProperties,
  dialog: {
    position: "relative",
    width: 420,
    maxWidth: "100%",
    maxHeight: "92%",
    overflow: "auto",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 14,
    boxShadow: "var(--shadow-modal)",
    padding: "16px 20px",
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  option: {
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  } satisfies CSSProperties,
} as const;
