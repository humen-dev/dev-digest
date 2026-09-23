/* SkillBodyEditor — file-icon header ("<name>.md"), `unsaved` badge (local body
   != saved body), a debounced live token count (POST /skills/tokens; falls back
   to the DTO's body_tokens before the first edit), and a markdown-highlighted
   textarea with a synced line-number gutter.

   Highlighting is the classic transparent-textarea-over-<pre> overlay rather
   than a CodeMirror dependency for one field: the <pre> paints the colours and
   the textarea on top keeps native editing, with transparent glyphs and a
   visible caret. It holds together because both layers share every metric that
   affects glyph position (see styles.ts) and neither soft-wraps, and because the
   tokenizer is lossless (see helpers.ts). jsdom does not lay out text, so scroll
   sync and alignment are only verifiable in a real browser — the unit tests
   cover the tokenizer, not the overlay. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import { useSkillTokens } from "../../../../../../../../../lib/hooks/skills";
import { tokenizeMarkdown } from "./helpers";
import { s, tokenStyle } from "./styles";

const TOKEN_DEBOUNCE_MS = 400;

export function SkillBodyEditor({
  name,
  body,
  savedBody,
  initialTokens,
  onChange,
}: {
  name: string;
  body: string;
  savedBody: string;
  initialTokens: number;
  onChange: (body: string) => void;
}) {
  const t = useTranslations("skills");
  const tokensMutation = useSkillTokens();
  const [tokens, setTokens] = React.useState(initialTokens);
  const unsaved = body !== savedBody;
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const highlightRef = React.useRef<HTMLPreElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!unsaved) {
      setTokens(initialTokens);
      return;
    }
    const handle = setTimeout(() => {
      tokensMutation.mutate(body, { onSuccess: (d) => setTokens(d.tokens) });
    }, TOKEN_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // Re-run on every body edit; tokensMutation is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, unsaved, initialTokens]);

  const lines = React.useMemo(() => tokenizeMarkdown(body), [body]);

  /* The textarea owns the scroll position; the gutter follows it vertically and
     the highlight layer follows it on both axes. */
  const syncScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.FileText size={14} style={{ color: "var(--text-muted)" }} />
        <span className="mono" style={s.fileName}>
          {(name || "skill").trim()}.md
        </span>
        {unsaved && (
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("bodyEditor.unsaved")}
          </Badge>
        )}
        <span style={s.tokens}>
          {tokensMutation.isPending ? t("bodyEditor.countingTokens") : t("bodyEditor.tokens", { count: tokens })}
        </span>
      </div>
      <div style={s.bodyWrap}>
        <div ref={gutterRef} style={s.gutter} aria-hidden="true">
          {lines.map((_, i) => (
            <div key={i} className="mono tnum" style={s.gutterLine}>
              {i + 1}
            </div>
          ))}
        </div>
        <div style={s.editor}>
          <pre ref={highlightRef} className="mono" style={s.highlight} aria-hidden="true">
            {lines.map((lineTokens, i) => (
              <React.Fragment key={i}>
                {i > 0 && "\n"}
                {lineTokens.map((tk, j) => (
                  <span key={j} style={tokenStyle[tk.kind]}>
                    {tk.text}
                  </span>
                ))}
              </React.Fragment>
            ))}
          </pre>
          <textarea
            ref={textareaRef}
            className="mono"
            value={body}
            onChange={(e) => {
              onChange(e.target.value);
              syncScroll();
            }}
            onScroll={syncScroll}
            spellCheck={false}
            style={s.textarea}
          />
        </div>
      </div>
    </div>
  );
}
