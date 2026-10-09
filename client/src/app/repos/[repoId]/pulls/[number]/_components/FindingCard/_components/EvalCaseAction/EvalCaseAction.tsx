/* EvalCaseAction — "Turn into eval case" on a triaged finding (SPEC-05 AC-1..3, AC-12).
   Disabled with a hint while the finding is untriaged; on success becomes an
   "Eval case ✓" link to the case in the owner agent's Evals tab. */
"use client";

import { useId } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useCreateEvalCaseFromFinding } from "@/lib/hooks/eval";
import { evalCaseHref, findingErrorKey, findingErrorValues } from "./helpers";
import { s } from "./styles";

export function EvalCaseAction({ findingId, triaged }: { findingId: string; triaged: boolean }) {
  const t = useTranslations("eval");
  const hintId = useId();
  const create = useCreateEvalCaseFromFinding();

  if (create.data) {
    return (
      <Link href={evalCaseHref(create.data.owner_id, create.data.id)} style={s.done}>
        {t("finding.done")}
      </Link>
    );
  }

  const err = create.error;
  const code = err instanceof ApiError ? err.code : undefined;
  const details = err instanceof ApiError ? err.details : undefined;

  return (
    <span style={s.wrap}>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={!triaged || create.isPending}
        aria-describedby={triaged ? undefined : hintId}
        onClick={() => create.mutate(findingId)}
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
    </span>
  );
}
