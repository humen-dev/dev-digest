"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentColumn } from "@devdigest/shared";
import { statusFlips, statusSnapshot } from "./helpers";

/** Text for a polite live region: names the agents whose status changed since the
    previous poll. Empty on the first load (nothing changed yet). */
export function useStatusAnnouncement(columns: AgentColumn[] | undefined): string {
  const t = useTranslations("multiAgent.results");
  const previous = React.useRef<Record<string, AgentColumn["status"]> | null>(null);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    if (!columns) return;
    const flips = statusFlips(previous.current, columns);
    previous.current = statusSnapshot(columns);
    if (flips.length > 0) {
      setMessage(
        flips.map((f) => t("statusAnnounce", { agent: f.agent, status: t(`status.${f.status}`) })).join(". "),
      );
    }
  }, [columns, t]);

  return message;
}
