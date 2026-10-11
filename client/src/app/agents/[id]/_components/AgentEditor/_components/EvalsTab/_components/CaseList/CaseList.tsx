"use client";

import React from "react";
import type { EvalCaseListItem } from "@devdigest/shared";
import { CaseRow } from "../CaseRow";
import { s } from "./styles";

export function CaseList({ cases, onOpen }: { cases: EvalCaseListItem[]; onOpen: (id: string) => void }) {
  return (
    <div style={s.list}>
      {cases.map((c) => (
        <CaseRow key={c.id} item={c} onOpen={onOpen} />
      ))}
    </div>
  );
}
