/* ReviewFocus — full-width "read these first" list from the PR Brief. Each item
   is a button that opens Files changed at its file/line via onNavigate. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import type { DiffTarget } from "@/lib/pr-diff-target";
import { focusLocation } from "./helpers";
import { s } from "./styles";

export interface ReviewFocusProps {
  items: readonly ReviewFocusItem[];
  onNavigate: (target: DiffTarget) => void;
}

export function ReviewFocus({ items, onNavigate }: ReviewFocusProps) {
  const t = useTranslations("brief");

  return (
    <section style={s.block}>
      <div style={s.header}>
        <Icon.ListChecks size={14} style={{ color: "var(--accent)" }} aria-hidden />
        <h3 style={s.title}>{t("focus.title")}</h3>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p style={s.empty}>{t("focus.empty")}</p>
      ) : (
        <ol style={s.list}>
          {items.map((item, i) => (
            <li key={`${item.file}:${item.line ?? ""}:${i}`}>
              <button
                type="button"
                style={s.item}
                onClick={() => onNavigate({ file: item.file, line: item.line })}
              >
                <span style={s.marker} aria-hidden>
                  ▸
                </span>
                <span className="mono" style={s.location}>
                  {focusLocation(item)}
                </span>
                <span style={s.reason}>— {item.reason}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
