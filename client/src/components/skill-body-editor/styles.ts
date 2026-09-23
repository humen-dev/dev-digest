import type { CSSProperties } from "react";
import type { MdTokenKind } from "./helpers";

/** Co-located styles for SkillBodyEditor.
 *
 *  Three layers share one coordinate system: the line-number gutter, the
 *  highlight <pre>, and the textarea the user actually types into. Alignment is
 *  not cosmetic — one mismatched metric visibly offsets the caret from its
 *  colours — so every metric that affects glyph position is a named constant
 *  below and each layer is built from those, never from its own literal.
 *
 *  Both text layers use `white-space: pre` (scroll sideways, never soft-wrap).
 *  Soft wrapping would let one logical line occupy two visual rows, which the
 *  one-row-per-line gutter cannot represent.
 *
 *  The layer objects are annotated `CSSProperties` rather than `satisfies`-ed:
 *  spreading a typed style object makes the inferred type unnameable without a
 *  direct csstype reference (TS2742 under pnpm's isolated node_modules).
 */

const FONT_FAMILY = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';
const FONT_SIZE = 13;
const LINE_HEIGHT = "20px";
const PAD_Y = 10;
const PAD_X = 12;

/** Shared by the highlight <pre> and the textarea: identical box, identical text. */
const layer: CSSProperties = {
  position: "absolute",
  inset: 0,
  margin: 0,
  padding: `${PAD_Y}px ${PAD_X}px`,
  border: "none",
  fontFamily: FONT_FAMILY,
  fontSize: FONT_SIZE,
  lineHeight: LINE_HEIGHT,
  tabSize: 2,
  whiteSpace: "pre",
  overflowWrap: "normal",
  wordBreak: "normal",
};

/** The colours, underneath. Scrolled in code to follow the textarea. */
const highlight: CSSProperties = {
  ...layer,
  overflow: "hidden",
  color: "var(--text-primary)",
  pointerEvents: "none",
};

/** The real input, on top: invisible glyphs, visible caret and selection. */
const textarea: CSSProperties = {
  ...layer,
  width: "100%",
  height: "100%",
  resize: "none",
  outline: "none",
  overflow: "auto",
  background: "transparent",
  color: "transparent",
  caretColor: "var(--text-primary)",
};

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
    padding: `${PAD_Y}px 0`,
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border)",
    overflow: "hidden",
    textAlign: "right",
  } satisfies CSSProperties,
  gutterLine: {
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    color: "var(--text-muted)",
    padding: "0 8px",
  } satisfies CSSProperties,
  /** Positioning context for the stacked highlight + input layers. */
  editor: { position: "relative", flex: 1, minWidth: 0 } satisfies CSSProperties,
  highlight,
  textarea,
} as const;

/** Colour per token kind. Anything not listed here renders as plain body text. */
export const tokenStyle: Partial<Record<MdTokenKind, CSSProperties>> = {
  headingMarker: { color: "var(--accent)", fontWeight: 700 },
  heading: { color: "var(--accent-text)", fontWeight: 700 },
  listMarker: { color: "var(--accent)" },
  quote: { color: "var(--text-muted)" },
  fence: { color: "var(--text-muted)" },
  code: { color: "var(--ok)" },
  bold: { color: "var(--text-primary)", fontWeight: 700 },
  italic: { color: "var(--text-secondary)", fontStyle: "italic" },
  link: { color: "var(--accent-text)", textDecoration: "underline" },
};
