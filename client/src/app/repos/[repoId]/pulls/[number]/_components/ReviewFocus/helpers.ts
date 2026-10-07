import type { ReviewFocusItem } from "@devdigest/shared";

/** `file:line` when a line is known, else just `file`. */
export function focusLocation(item: Pick<ReviewFocusItem, "file" | "line">): string {
  return item.line === null ? item.file : `${item.file}:${item.line}`;
}
