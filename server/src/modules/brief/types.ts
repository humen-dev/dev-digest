import { z } from 'zod';
import type { SmartDiffRole, BriefDroppedInputKind, PrBrief } from '@devdigest/shared';
export const BriefDraft = z.object({            // model output, looser than PrBrief; grounding produces PrBrief
  summary: z.string(),
  risks: z.array(z.object({ kind: z.string(), title: z.string(), explanation: z.string(),
    severity: z.enum(['high', 'medium', 'low']), file_refs: z.array(z.string()) })),
  review_focus: z.array(z.object({ file: z.string(), line: z.number().int().nullable(), reason: z.string() })),
});
export type BriefDraft = z.infer<typeof BriefDraft>;
export type HunkRange = readonly [start: number, end: number];
export interface BriefFileFact { path: string; additions: number; deletions: number; role: SmartDiffRole | null; hunks: HunkRange[] }
export interface BriefCallerFact { symbol: string; name: string; file: string; line: number }
export interface BriefInput {
  pr: { title: string; body: string };                       // body already capped
  totals: { files: number; additions: number; deletions: number };
  files: BriefFileFact[];
  intent: { intent: string; in_scope: string[]; out_of_scope: string[] } | null;
  blast: { summary: string; callers: BriefCallerFact[]; endpoints: string[]; crons: string[] } | null;
  issue: { number: number; title: string; body: string } | null; // body already capped
  docs: { path: string; text: string }[];                    // priority order, highest first
}
export interface BudgetResult { input: BriefInput; dropped: { kind: BriefDroppedInputKind; id: string }[]; tokens: number; fits: boolean }
export interface GroundingContext { changedPaths: ReadonlySet<string>; groundingSet: ReadonlySet<string>; hunksByPath: ReadonlyMap<string, readonly HunkRange[]> }
export interface GroundingResult { brief: PrBrief; drops: { refs: number; risks: number; focus: number } }
