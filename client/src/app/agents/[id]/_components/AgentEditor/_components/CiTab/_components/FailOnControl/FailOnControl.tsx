"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { CiFailOn } from "@devdigest/shared";
import { FAIL_ON_OPTIONS } from "../../constants";
import { nextRadioIndex } from "../../helpers";
import { s } from "./styles";

/** "Fail CI on" radiogroup. Arrow keys move focus and select (native radio behaviour). */
export function FailOnControl({
  value,
  disabled,
  onSelect,
}: {
  value: CiFailOn;
  disabled?: boolean;
  onSelect: (value: CiFailOn) => void;
}) {
  const t = useTranslations("ci.ciTab");
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = FAIL_ON_OPTIONS.findIndex((o) => o.value === value);
  // `any` (set on the Config tab) matches no option: keep the group tabbable via the first one.
  const tabbableIndex = checkedIndex === -1 ? 0 : checkedIndex;

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const next = nextRadioIndex(e.key, index, FAIL_ON_OPTIONS.length);
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
    const option = FAIL_ON_OPTIONS[next];
    if (option && !disabled) onSelect(option.value);
  };

  return (
    <div style={s.card}>
      <div style={s.text}>
        <div id="ci-fail-on-label" style={s.title}>
          {t("failOnLabel")}
        </div>
        <div style={s.hint}>{t("failOnHint")}</div>
        {value === "any" && <div style={s.anyHint}>{t("failOnAnyHint")}</div>}
      </div>
      <div role="radiogroup" aria-labelledby="ci-fail-on-label" style={s.group}>
        {FAIL_ON_OPTIONS.map((opt, i) => {
          const checked = opt.value === value;
          return (
            <button
              key={opt.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={i === tabbableIndex ? 0 : -1}
              disabled={disabled}
              style={checked ? s.optionChecked : s.option}
              onClick={() => onSelect(opt.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {t(opt.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
