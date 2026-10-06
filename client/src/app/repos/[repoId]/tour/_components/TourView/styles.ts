import type { CSSProperties } from "react";

export const s = {
  page: {
    padding: "24px 32px 60px",
  } satisfies CSSProperties,
  heading: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    marginBottom: 16,
  } satisfies CSSProperties,
  loadingStack: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  layout: {
    display: "grid",
    gridTemplateColumns: "220px minmax(0, 1fr)",
    gap: 32,
    alignItems: "start",
  } satisfies CSSProperties,
  main: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  } satisfies CSSProperties,
  footer: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,
} as const;
