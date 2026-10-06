/* HowToRun — one numbered row per step (command, note, source chip, copy) plus
   a "Copy all" that joins every command by newline without notes (AC-18,
   AC-19, AC-20). "Copied" shows only on the control that was just clicked
   (AC-21); a rejected clipboard write raises a toast (EC-22) via
   useCopyToClipboard. */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { TourStep } from "@devdigest/shared";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { s } from "./styles";

export interface HowToRunProps {
  steps: TourStep[];
}

const COPY_ALL_ID = "copy-all";

export function HowToRun({ steps }: HowToRunProps) {
  const t = useTranslations("onboarding");
  const { copy, copiedId } = useCopyToClipboard();

  return (
    <div style={s.wrap}>
      <ol style={s.list}>
        {steps.map((step, i) => {
          const controlId = `step-${i}`;
          const copyLabel = t("actions.copyStep", { n: i + 1 });
          return (
            <li key={controlId} style={s.row}>
              <span style={s.index}>{i + 1}</span>
              <code className="mono" style={s.command}>
                {step.command}
              </code>
              {step.note && <span style={s.note}>{step.note}</span>}
              <span style={s.source}>
                <Icon.FileText size={11} />
                {step.source}
              </span>
              <button
                type="button"
                aria-label={copyLabel}
                onClick={() => copy(step.command, controlId)}
                style={s.copyBtn}
              >
                {copiedId === controlId ? t("actions.copied") : <Icon.Copy size={13} />}
              </button>
            </li>
          );
        })}
      </ol>
      {steps.length > 0 && (
        <button
          type="button"
          onClick={() => copy(steps.map((step) => step.command).join("\n"), COPY_ALL_ID)}
          style={s.copyAllBtn}
        >
          <Icon.Copy size={13} />
          {copiedId === COPY_ALL_ID ? t("actions.copied") : t("actions.copyAll")}
        </button>
      )}
    </div>
  );
}
