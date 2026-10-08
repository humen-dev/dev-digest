/* ArchitectureSection — the tour's prose overview plus its optional Mermaid
   diagram. Overview is model-written Markdown (AC-13): rendered through
   react-markdown + remark-gfm with NO `rehype-raw`, so raw HTML stays inert
   text and `javascript:` links lose their target by react-markdown's default
   URL sanitiser (UT-9) — same precedent as the vendored `@devdigest/ui`
   Markdown primitive (`DocPreview.tsx`). An inline code span equal to one of
   `overview_paths` becomes a PathRef chip (AC-15); everything else stays a
   plain mono pill. */
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TourArchitecture } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { PathRef } from "../PathRef";
import { isFencedBlock, codeText } from "./helpers";
import { s } from "./styles";

export interface ArchitectureSectionProps {
  architecture: TourArchitecture;
  repoFullName: string;
  tourCommit: string;
  cloned: boolean;
}

export function ArchitectureSection({ architecture, repoFullName, tourCommit, cloned }: ArchitectureSectionProps) {
  const overviewPaths = new Set(architecture.overview_paths);

  return (
    <div style={s.wrap}>
      <div style={s.overview}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code: ({ children, className }) => {
              if (isFencedBlock(className, children)) {
                return (
                  <code className="mono" style={s.codeFence}>
                    {children}
                  </code>
                );
              }
              const text = codeText(children);
              if (overviewPaths.has(text)) {
                return (
                  <PathRef
                    path={text}
                    repoFullName={repoFullName}
                    tourCommit={tourCommit}
                    cloned={cloned}
                    style={s.pathChip}
                  >
                    {text}
                  </PathRef>
                );
              }
              return (
                <code className="mono" style={s.codePill}>
                  {children}
                </code>
              );
            },
          }}
        >
          {architecture.overview}
        </ReactMarkdown>
      </div>
      {architecture.diagram != null && <MermaidDiagram chart={architecture.diagram} />}
    </div>
  );
}
