import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** A fenced block is `<pre><code>`; react-markdown routes both through `code`,
    so only a real inline span may take the pill styling. Fenced code is detected
    by remark's `language-*` class, falling back to "the text spans lines" for a
    fence opened without a language. */
function isFencedBlock(className: string | undefined, children: React.ReactNode): boolean {
  if (className?.includes("language-")) return true;
  return typeof children === "string" && children.includes("\n");
}

/** Markdown renderer (replaces prototype mdLite). Inline + GFM.
    Block typography (headings, lists, tables, fences) lives in `.dd-md` in
    styles.css — it needs `::marker` and `:first-child`, which inline styles
    cannot express. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children, className }) =>
            isFencedBlock(className, children) ? (
              <code className="mono" style={{ fontSize: "0.92em" }}>
                {children}
              </code>
            ) : (
              <code
                className="mono"
                style={{
                  fontSize: "0.92em",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--bg-hover)",
                  color: "var(--accent-text)",
                }}
              >
                {children}
              </code>
            ),
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
