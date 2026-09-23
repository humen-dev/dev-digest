import type { CSSProperties } from "react";

/** Co-located styles for ConfigTab (mirrors agents' ConfigTab/styles.ts). */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  bodyHint: {
    fontSize: 12,
    color: "var(--text-muted)",
    lineHeight: 1.45,
    marginTop: -12,
    marginBottom: 20,
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 } satisfies CSSProperties,
  savedNote: { alignSelf: "center", fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
  /** Right-aligned "Saving snapshots the body as vN" next to the Save button. */
  nextVersionNote: {
    marginLeft: "auto",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  nextVersion: { fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,

  dangerZone: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginTop: 28,
    paddingTop: 22,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  dangerText: { flex: 1 } satisfies CSSProperties,
  dangerTitle: { fontSize: 14, fontWeight: 600, color: "var(--crit)" } satisfies CSSProperties,
  dangerBody: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
} as const;
