/* GuidedReading — the stored reading order as a numbered list; unlike
   critical-paths, the path itself is the link (AC-22, AC-26) via PathRef. */
"use client";

import type { TourReadingItem } from "@devdigest/shared";
import { PathRef } from "../PathRef";
import { s } from "./styles";

export interface GuidedReadingProps {
  items: TourReadingItem[];
  repoFullName: string;
  tourCommit: string;
  cloned: boolean;
}

export function GuidedReading({ items, repoFullName, tourCommit, cloned }: GuidedReadingProps) {
  return (
    <ol style={s.list}>
      {items.map((item, i) => (
        <li key={item.path} style={s.row}>
          <span style={s.badge}>{i + 1}</span>
          <div style={s.content}>
            <PathRef
              path={item.path}
              repoFullName={repoFullName}
              tourCommit={tourCommit}
              cloned={cloned}
              importerCount={item.importer_count}
              style={s.path}
            >
              {item.path}
            </PathRef>
            <span style={s.reason}>{item.reason}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
