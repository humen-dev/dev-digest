/* EvalCaseAction — "Turn into eval case" on a triaged finding (SPEC-06 AC-1..3, AC-12, AC-88, AC-89).
   Disabled with a hint while the finding is untriaged. A click fetches an unsaved draft and opens it in the
   shared case modal (or jumps to the finding's existing case); after Save it becomes an "Eval case ✓" link
   to the case in the owner agent's Evals tab. */
"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalCase, EvalCaseDraft } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { CaseModal } from "@/components/eval/CaseModal";
import { useEvalCaseDraft } from "@/lib/hooks/eval";
import { evalCaseHref, findingErrorKey, findingErrorValues } from "./helpers";
import { s } from "./styles";

export function EvalCaseAction({ findingId, triaged }: { findingId: string; triaged: boolean }) {
  const t = useTranslations("eval");
  const hintId = useId();
  const router = useRouter();
  const loadDraft = useEvalCaseDraft();
  const [draft, setDraft] = useState<EvalCaseDraft | null>(null);
  const [saved, setSaved] = useState<EvalCase | null>(null);

  if (saved) {
    return (
      <Link href={evalCaseHref(saved.owner_id, saved.id)} style={s.done}>
        {t("finding.done")}
      </Link>
    );
  }

  function open() {
    loadDraft.mutate(findingId, {
      onSuccess: (res) => {
        if (res.kind === "existing_case") router.push(evalCaseHref(res.owner_id, res.case_id));
        else setDraft(res.draft);
      },
    });
  }

  const err = loadDraft.error;
  const code = err instanceof ApiError ? err.code : undefined;
  const details = err instanceof ApiError ? err.details : undefined;

  return (
    <span style={s.wrap}>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={!triaged || loadDraft.isPending}
        aria-describedby={triaged ? undefined : hintId}
        onClick={open}
      >
        {t("finding.turnInto")}
      </Button>
      {!triaged && (
        <span id={hintId} style={s.hint}>
          {t("finding.eligibleHint")}
        </span>
      )}
      {err && (
        <span role="alert" style={s.error}>
          {t(`errors.${findingErrorKey(code)}`, findingErrorValues(details))}
        </span>
      )}
      {draft && (
        <CaseModal
          mode="finding"
          agentId={draft.agent_id}
          findingId={findingId}
          draft={draft}
          onSaved={(c) => {
            setSaved(c);
            setDraft(null);
          }}
          onClose={() => setDraft(null)}
        />
      )}
    </span>
  );
}
