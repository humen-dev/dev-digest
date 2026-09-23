/** Markdown tokenizer for the editor's highlight layer.
 *
 *  Deliberately not a real parser: it only needs enough structure to colour a
 *  skill body (headings, list markers, fences, emphasis, inline code, links).
 *  The one hard requirement is that it is LOSSLESS — concatenating a line's
 *  token texts must reproduce that line character for character, because the
 *  highlight layer sits underneath a transparent textarea and any dropped or
 *  added character shifts every glyph after it out of alignment.
 */

export type MdTokenKind =
  | "text"
  | "headingMarker"
  | "heading"
  | "listMarker"
  | "quote"
  | "fence"
  | "code"
  | "bold"
  | "italic"
  | "link";

export type MdToken = { kind: MdTokenKind; text: string };

const HEADING = /^(\s*)(#{1,6})(\s+)(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const QUOTE = /^(\s*)(>\s?)(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/;

/* Alternation order is the precedence: `**b**` must win over `*i*`, and inline
   code wins over everything so that a backtick span is never re-parsed. */
const INLINE =
  /`[^`\n]*`|\*\*[^\n]+?\*\*|__[^\n]+?__|\*[^\s*][^\n]*?\*|_[^\s_][^\n]*?_|\[[^\]\n]*\]\([^)\n]*\)/g;

function push(tokens: MdToken[], kind: MdTokenKind, text: string): void {
  if (text) tokens.push({ kind, text });
}

function inlineKind(match: string): MdTokenKind {
  if (match.startsWith("`")) return "code";
  if (match.startsWith("**") || match.startsWith("__")) return "bold";
  if (match.startsWith("[")) return "link";
  return "italic";
}

/** Split one line's prose into text + emphasis/code/link spans. */
function tokenizeInline(line: string): MdToken[] {
  const tokens: MdToken[] = [];
  let last = 0;
  // A fresh lastIndex per call — INLINE is module-level and stateful.
  INLINE.lastIndex = 0;
  for (let m = INLINE.exec(line); m !== null; m = INLINE.exec(line)) {
    push(tokens, "text", line.slice(last, m.index));
    push(tokens, inlineKind(m[0]), m[0]);
    last = m.index + m[0].length;
  }
  push(tokens, "text", line.slice(last));
  return tokens;
}

function tokenizeLine(line: string, inFence: boolean): MdToken[] {
  if (inFence) return [{ kind: "code", text: line }];

  const heading = HEADING.exec(line);
  if (heading) {
    const [, indent, hashes, gap, rest] = heading as unknown as [string, string, string, string, string];
    const tokens: MdToken[] = [];
    push(tokens, "text", indent);
    push(tokens, "headingMarker", hashes);
    push(tokens, "heading", gap + rest);
    return tokens;
  }

  const quote = QUOTE.exec(line);
  if (quote) {
    const [, indent, marker, rest] = quote as unknown as [string, string, string, string];
    const tokens: MdToken[] = [];
    push(tokens, "text", indent);
    push(tokens, "quote", marker);
    return [...tokens, ...tokenizeInline(rest)];
  }

  const item = LIST_ITEM.exec(line);
  if (item) {
    const [, indent, marker, gap, rest] = item as unknown as [string, string, string, string, string];
    const tokens: MdToken[] = [];
    push(tokens, "text", indent);
    push(tokens, "listMarker", marker);
    push(tokens, "text", gap);
    return [...tokens, ...tokenizeInline(rest)];
  }

  return tokenizeInline(line);
}

/** Tokenize a whole body into one token list per line (always >= 1 line). */
export function tokenizeMarkdown(body: string): MdToken[][] {
  let inFence = false;
  return body.split("\n").map((line) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      return [{ kind: "fence" as const, text: line }];
    }
    return tokenizeLine(line, inFence);
  });
}
