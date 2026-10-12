/* TraceSection — collapsible titled section used throughout the trace tab. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "../../styles";

export function TraceSection({
  icon,
  title,
  right,
  children,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
}: {
  icon: "Settings" | "Gauge" | "FileText" | "Wrench" | "Code" | "AlertOctagon";
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state (e.g. a "Specs read" chip opening Prompt assembly, AC-56).
   *  Omit for the default uncontrolled click-to-toggle behaviour. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openState, setOpenState] = React.useState(defaultOpen);
  const open = openProp ?? openState;
  const toggleOpen = () => {
    const next = !open;
    onOpenChange?.(next);
    if (openProp === undefined) setOpenState(next);
  };
  const I = Icon[icon];
  return (
    <div style={s.section}>
      <div onClick={toggleOpen} style={s.sectionHead}>
        <I size={15} style={s.sectionIcon} />
        <span style={s.sectionTitle}>{title}</span>
        {right}
        <Icon.ChevronDown size={15} style={s.chevron(open)} />
      </div>
      {open && <div style={s.sectionBody}>{children}</div>}
    </div>
  );
}
