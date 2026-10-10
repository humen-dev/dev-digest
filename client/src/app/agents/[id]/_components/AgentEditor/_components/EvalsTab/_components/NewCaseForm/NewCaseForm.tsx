"use client";

import React from "react";
import { CaseModal } from "@/components/eval/CaseModal";

/** Manual creation of an eval case (AC-49, AC-110): the shared case modal in `manual` mode. */
export function NewCaseForm({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  return <CaseModal mode="manual" agentId={agentId} onSaved={onClose} onClose={onClose} />;
}
