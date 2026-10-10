"use client";

import React from "react";
import { s } from "./styles";

/**
 * Single-line text with a CSS ellipsis. The full text stays in the DOM (so it is
 * the accessible name) and in `title` (so sighted users can hover it).
 */
export function TruncatedText({
  text,
  mono,
  maxWidth,
}: {
  text: string;
  mono?: boolean;
  maxWidth?: number | string;
}) {
  return (
    <span className={mono ? "mono" : undefined} title={text} style={s.text(maxWidth)}>
      {text}
    </span>
  );
}
