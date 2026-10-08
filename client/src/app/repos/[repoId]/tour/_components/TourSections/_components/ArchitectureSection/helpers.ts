import type { ReactNode } from "react";

/**
 * react-markdown routes both a fenced code block (`<pre><code>`) and an inline
 * code span through the same `code` component — only a real inline span may
 * become a {@link PathRef} chip. A fence is detected by remark-gfm's
 * `language-*` class, falling back to "the text spans lines" for a fence
 * opened without a language (same heuristic as the vendored
 * `@devdigest/ui` Markdown primitive).
 */
export function isFencedBlock(className: string | undefined, children: ReactNode): boolean {
  if (className?.includes("language-")) return true;
  return typeof children === "string" && children.includes("\n");
}

/** react-markdown always gives inline code a single string child. */
export function codeText(children: ReactNode): string {
  return typeof children === "string" ? children : "";
}
