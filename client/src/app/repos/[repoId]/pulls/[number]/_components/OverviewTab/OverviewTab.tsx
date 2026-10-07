"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { usePrBrief } from "@/lib/hooks/brief";
import { usePrIntent } from "@/lib/hooks/intent";
import type { DiffTarget } from "@/lib/pr-diff-target";
import { IntentCard } from "../IntentCard";
import { BlastRadius } from "../BlastRadius";
import { PrBriefSection } from "../PrBriefSection";
import { RiskAreas } from "../RiskAreas";
import { ReviewFocus } from "../ReviewFocus";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
  /** Paths of the files this PR changes — risk refs outside it toast instead of navigating. */
  changedPaths: readonly string[];
  /** Open Files changed at a brief file/line. */
  onOpenDiffTarget: (target: DiffTarget) => void;
}

export function OverviewTab({
  prId,
  prBody,
  repoId,
  repoFullName,
  headSha,
  changedPaths,
  onOpenDiffTarget,
}: OverviewTabProps) {
  const { data: briefPage } = usePrBrief(prId);
  const intentQuery = usePrIntent(prId);
  const brief = briefPage?.brief ?? null;

  // IntentCard renders `riskSlot` only once an intent is loaded, so the risks are
  // embedded only then. While intent is loading or failed, IntentCard keeps its
  // own state and the Risk areas card sits below it; with no intent it takes the slot.
  const hasIntent = !!intentQuery.data?.intent;
  const intentPending = intentQuery.isLoading || intentQuery.isError;

  return (
    <>
      {prId && (
        <section>
          <PrBriefSection prId={prId} repoId={repoId} />
        </section>
      )}

      {brief ? (
        <>
          <div style={s.twoColumn}>
            <section>
              {hasIntent ? (
                <IntentCard
                  prId={prId}
                  variant="full"
                  riskSlot={
                    <RiskAreas
                      variant="embedded"
                      risks={brief.risks}
                      changedPaths={changedPaths}
                      onNavigate={onOpenDiffTarget}
                    />
                  }
                />
              ) : (
                <>
                  {intentPending && <IntentCard prId={prId} variant="full" />}
                  <RiskAreas
                    variant="card"
                    risks={brief.risks}
                    changedPaths={changedPaths}
                    onNavigate={onOpenDiffTarget}
                  />
                </>
              )}
            </section>
            <section>
              <BlastRadius prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
            </section>
          </div>

          <ReviewFocus items={brief.review_focus} onNavigate={onOpenDiffTarget} />
        </>
      ) : (
        <>
          <section>
            <IntentCard prId={prId} variant="full" />
          </section>

          <section>
            <BlastRadius prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
          </section>
        </>
      )}

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
