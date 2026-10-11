import type { CSSProperties } from "react";

export const s = {
  text: (maxWidth: number | string | undefined): CSSProperties => ({
    display: "inline-block",
    verticalAlign: "bottom",
    minWidth: 0,
    maxWidth: maxWidth ?? "100%",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }),
};
