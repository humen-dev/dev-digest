/* DiffTab — "Files changed": groups the diff by reviewer role (core → tests →
   wiring → docs → boilerplate) with a Smart/Original order toggle, and
   overlays the PR's current review findings (dot, severity line, inline
   card) on top of DiffViewer. See docs/plans/smart-diff.md for the contract
   and decisions this wires together. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Skeleton } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingOverlay } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrDetail } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { SmartDiffHeader } from "./_components/SmartDiffHeader";
import { RoleGroup } from "./_components/RoleGroup";
import { buildRoleGroups, countFlaggedFiles, currentFindings, pathsWithFindings } from "./helpers";
import { DEFAULT_ORDER, type OrderMode } from "./constants";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  pr: PrDetail;
  /** github "owner/repo" (null until the repo is loaded) — passed through to FindingCard. */
  repoFullName: string | null;
}

export function DiffTab({ prId, pr, repoFullName }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // One toggle for GitHub comments and review-finding cards: both visible by
  // default, hidden together when the reviewer wants a clean diff (the file
  // dot and the line's severity bar/label stay).
  const [showComments, setShowComments] = React.useState(true);
  const [order, setOrder] = React.useState<OrderMode>(DEFAULT_ORDER);

  const { data: reviews } = usePrReviews(prId);
  const { data: smartDiff, isLoading: smartDiffLoading, isError: smartDiffError } = useSmartDiff(prId);
  // Destructured: useMutation returns a fresh object every render, which would
  // bust the overlay memo below; `mutate` is stable.
  const { mutate: actOnFinding, isPending: findingActionPending } = useFindingAction();

  const commentCount = comments?.length ?? 0;
  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: pr.status === "open" && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("smartDiff.commentPostError"));
        throw err;
      }
    },
  };

  // "Current findings", restricted to this PR's changed files — same rule the
  // server applies for `finding_lines` (docs/plans/smart-diff.md Decisions 6-8).
  const filePaths = React.useMemo(() => new Set(pr.files.map((f) => f.path)), [pr.files]);
  const findings = React.useMemo(() => {
    const all = currentFindings(reviews ?? []);
    return all.filter((f) => filePaths.has(f.file));
  }, [reviews, filePaths]);
  const flaggedPaths = React.useMemo(() => pathsWithFindings(findings), [findings]);

  const overlay: DiffFindingOverlay = React.useMemo(
    () => ({
      markers: findings.map((f) => ({
        id: f.id,
        path: f.file,
        line: f.start_line,
        severity: f.severity,
        card: (
          <FindingCard
            key={f.id}
            f={f}
            defaultExpanded
            pending={findingActionPending}
            repoFullName={repoFullName}
            headSha={pr.head_sha}
            onAction={(action) => {
              if (prId) actOnFinding({ findingId: f.id, action, prId });
            }}
          />
        ),
      })),
      showCards: showComments,
    }),
    [findings, actOnFinding, findingActionPending, repoFullName, pr.head_sha, prId, showComments],
  );
  // Empty state instead of silent zero counters: no review has run yet.
  const noReviewYet = reviews != null && !reviews.some((r) => r.kind === "review");

  const groups = React.useMemo(
    () => (smartDiff ? buildRoleGroups(pr.files, smartDiff) : []),
    [smartDiff, pr.files],
  );
  // Without grouping data (request failed, query disabled because prId is
  // null, or a PR with no files) fall back to the flat, original-order view —
  // grouping is an enhancement, never a blocker to reading the diff, and
  // DiffViewer owns the "no changed files" empty state.
  const smartUnavailable = smartDiffError || (!smartDiffLoading && groups.length === 0);
  const effectiveOrder: OrderMode = smartUnavailable ? "original" : order;

  return (
    <section>
      <SmartDiffHeader
        pr={pr}
        order={effectiveOrder}
        onOrderChange={setOrder}
        orderDisabled={smartUnavailable}
        commentCount={commentCount + findings.length}
        showComments={showComments}
        onToggleComments={() => setShowComments((v) => !v)}
      />

      {smartDiffError && (
        <div role="alert" style={s.notice}>
          <Icon.AlertTriangle size={15} />
          <span>{t("smartDiff.loadError")}</span>
        </div>
      )}

      {noReviewYet && (
        <div role="status" style={s.info}>
          <Icon.Info size={15} />
          <span>{t("smartDiff.noReviewYet")}</span>
        </div>
      )}

      {effectiveOrder === "smart" && smartDiffLoading && (
        <div style={s.skeletonStack}>
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </div>
      )}

      {effectiveOrder === "smart" &&
        !smartDiffLoading &&
        groups.map((group) => (
          <RoleGroup
            key={group.role}
            role={group.role}
            files={group.files}
            flaggedCount={countFlaggedFiles(group.files, flaggedPaths)}
            commenting={commenting}
            findings={overlay}
          />
        ))}

      {effectiveOrder === "original" && (
        <DiffViewer files={pr.files} commenting={commenting} findings={overlay} />
      )}
    </section>
  );
}
