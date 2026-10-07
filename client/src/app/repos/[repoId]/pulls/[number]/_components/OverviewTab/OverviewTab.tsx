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

  // Intent still loading / failed: keep IntentCard (it owns those states) so the
  // Risk areas card only takes its slot once we know there is no intent.
  const noIntent = !intentQuery.isLoading && !intentQuery.isError && !intentQuery.data?.intent;

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
              {noIntent ? (
                <RiskAreas
                  variant="card"
                  risks={brief.risks}
                  changedPaths={changedPaths}
                  onNavigate={onOpenDiffTarget}
                />
              ) : (
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
