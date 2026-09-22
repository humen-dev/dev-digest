/* SkillBodyEditor — file-icon header ("<name>.md"), `unsaved` badge (local body
   != saved body), a debounced live token count (POST /skills/tokens; falls back
   to the DTO's body_tokens before the first edit), and a textarea with a synced
   line-number gutter.

   No syntax-highlighting overlay: the plan allows falling back to a plain
   monospace textarea if a transparent-textarea-over-<pre> overlay proves
   fragile, rather than pulling in CodeMirror for one field. We took that
   fallback up front — see client/INSIGHTS.md for why. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import { useSkillTokens } from "../../../../../../../../../lib/hooks/skills";
import { s } from "./styles";

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

  const lineCount = body.length === 0 ? 1 : body.split("\n").length;

  const syncScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
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
          {Array.from({ length: lineCount }, (_, i) => i + 1).map((n) => (
            <div key={n} className="mono tnum" style={s.gutterLine}>
              {n}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="mono"
          value={body}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          spellCheck={false}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
