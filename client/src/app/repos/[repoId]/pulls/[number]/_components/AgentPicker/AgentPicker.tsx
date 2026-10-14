/* AgentPicker — "Run Review" on the PR page: choose which enabled agents to run
   and start ONE multi-agent run. The popover is hand-rolled in a PORTAL with
   `position: fixed` (the sticky PR header would clip an absolute child; see
   client INSIGHTS 2026-09-19). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { multiAgentConfigureUrl, multiAgentResultsUrl } from "@/lib/multi-agent-urls";
import { PickerPanel } from "./_components/PickerPanel";
import { PANEL_GAP, PANEL_MARGIN, PANEL_WIDTH } from "./constants";
import { s } from "./styles";
import { useAgentPicker } from "./useAgentPicker";

interface AgentPickerProps {
  prId: string;
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off. */
  onRunStart?: () => void;
  /** Fired once the server accepted the run. */
  onRunsStarted?: () => void;
}

interface PanelPos {
  top: number;
  left: number;
  maxHeight: number;
}

export function AgentPicker({ prId, warnMerged = false, onRunStart, onRunsStarted }: AgentPickerProps) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const picker = useAgentPicker({ prId, onRunStart, onRunsStarted });
  const [pos, setPos] = React.useState<PanelPos | null>(null);
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const open = pos !== null;

  const close = () => setPos(null);
  const toggleOpen = () => {
    if (open) return close();
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = r.bottom + PANEL_GAP;
    setPos({
      top,
      left: Math.max(PANEL_MARGIN, Math.min(r.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - PANEL_MARGIN)),
      maxHeight: Math.max(200, window.innerHeight - top - PANEL_MARGIN),
    });
    picker.onOpen();
  };

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setPos(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPos(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        title={warnMerged ? t("runReview.mergedTooltip") : undefined}
        style={warnMerged ? { ...s.trigger, opacity: 0.6 } : s.trigger}
      >
        <Button
          kind="primary"
          size="sm"
          icon="Sparkles"
          iconRight="ChevronDown"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={toggleOpen}
        >
          {t("runReview.runReview")}
        </Button>
      </span>
      {pos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={t("runReview.runReview")}
            style={{ ...s.panel, top: pos.top, left: pos.left, width: PANEL_WIDTH, maxHeight: pos.maxHeight }}
          >
            <PickerPanel
              agents={picker.enabled}
              selected={picker.selected}
              estimate={picker.estimate}
              warnMerged={warnMerged}
              isStarting={picker.isStarting}
              errorMessage={picker.errorMessage}
              inFlightId={picker.inFlightId}
              onToggle={picker.toggle}
              onClear={picker.clear}
              onRun={picker.run}
              onConfigure={() => router.push(multiAgentConfigureUrl({ prId, agentIds: picker.selected }))}
              onOpenInFlight={(id) => router.push(multiAgentResultsUrl(prId, id))}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
