/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, an inline composer, and
   (optional) a review-findings overlay: a severity bar + label pill on the
   row, and each finding's card slot rendered indented beneath it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { worstSeverity, type DiffFindingMarker } from "../findings";
import { LINE_LABEL_KEY } from "../constants";
import { s, lineRowFor, findingRowFor, lineSignFor, findingPillStyle, findingCardRailStyle } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  markers,
  showFindingCards = true,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  markers?: DiffFindingMarker[];
  /** false keeps the severity bar/label but hides the finding cards. */
  showFindingCards?: boolean;
}) {
  const t = useTranslations("shell");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const worst = markers && markers.length > 0 ? worstSeverity(markers) : null;
  const WorstIcon = worst ? Icon[SEV[worst].icon] : null;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={worst ? findingRowFor(ln.kind, SEV[worst].c) : lineRowFor(ln.kind)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {worst && WorstIcon && (
          <span style={findingPillStyle(SEV[worst].c, SEV[worst].bg)}>
            <WorstIcon size={11} />
            {t(`diffViewer.lineLabel.${LINE_LABEL_KEY[worst]}`)}
          </span>
        )}
      </div>

      {showFindingCards && markers && markers.length > 0 && (
        <div style={cs.thread}>
          {markers.map((m) => (
            <div key={m.id} style={findingCardRailStyle(SEV[m.severity].c)}>
              {m.card}
            </div>
          ))}
        </div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
