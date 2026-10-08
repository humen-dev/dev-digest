"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/lib/toast";

const COPIED_RESET_MS = 2000;

/**
 * Clipboard writer shared by every copy control in the tour (step copy, copy
 * all, copy-as-markdown). `controlId` identifies which control most recently
 * copied so only that one shows "Copied" (AC-21); a rejected write — denied
 * permission, insecure context — raises the shared toast instead of throwing
 * (EC-22).
 */
export function useCopyToClipboard() {
  const t = useTranslations("onboarding");
  const toast = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = useCallback(
    (text: string, controlId: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopiedId(controlId);
          if (resetTimer.current) clearTimeout(resetTimer.current);
          resetTimer.current = setTimeout(() => setCopiedId(null), COPIED_RESET_MS);
        })
        .catch(() => {
          toast.error(t("toast.copyFailed"));
        });
    },
    [t, toast],
  );

  return { copy, copiedId };
}
