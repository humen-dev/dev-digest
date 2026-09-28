/* UnanchoredFindings — footer list for review findings whose line isn't part
   of the rendered patch (or the file has no patch at all), so they can't be
   anchored to a CodeLine row. Pattern: OutdatedComments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cs } from "../comments";
import type { DiffFindingMarker } from "../findings";

export function UnanchoredFindings({ markers }: { markers: DiffFindingMarker[] }) {
  const t = useTranslations("shell");
  if (markers.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{t("diffViewer.findingsOutsideDiff")}</span>
      {markers.map((m) => (
        <React.Fragment key={m.id}>{m.card}</React.Fragment>
      ))}
    </div>
  );
}
