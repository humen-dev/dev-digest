import type { CSSProperties } from "react";

export const s = {
  card: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 9,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    color: "inherit",
    transition: "border-color .12s, background .12s",
  } satisfies CSSProperties,
  cardOn: {
    border: "1px solid var(--accent)",
    background: "var(--accent-bg)",
  } satisfies CSSProperties,
  cardOff: {
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  box: {
    width: 18,
    height: 18,
    borderRadius: 5,
    flexShrink: 0,
    marginTop: 1,
    display: "grid",
    placeItems: "center",
  } satisfies CSSProperties,
  boxOn: { border: "1.5px solid var(--accent)", background: "var(--accent)" } satisfies CSSProperties,
  boxOff: { border: "1.5px solid var(--border-strong)", background: "transparent" } satisfies CSSProperties,
  check: { color: "#fff" } satisfies CSSProperties,
  text: { display: "flex", flexDirection: "column", minWidth: 0, flex: 1 } satisfies CSSProperties,
  name: { fontSize: 13.5, fontWeight: 600 } satisfies CSSProperties,
  description: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    marginTop: 3,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  estimate: {
    fontSize: 10.5,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
