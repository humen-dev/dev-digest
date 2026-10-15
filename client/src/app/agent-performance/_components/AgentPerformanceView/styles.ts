import type { CSSProperties } from "react";

export const s = {
  page: { maxWidth: 1000, margin: "0 auto", padding: "20px 28px 40px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 18 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } satisfies CSSProperties,
  picker: { marginLeft: "auto" } satisfies CSSProperties,
  tablePlaceholder: { marginBottom: 24 } satisfies CSSProperties,
  error: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    padding: "40px 24px",
    textAlign: "center",
    fontSize: 14,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  emptyLink: { color: "var(--accent-text)", fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
};
