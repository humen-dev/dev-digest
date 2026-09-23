# Conventions — spec (client)

The **Conventions** screen of the Skills Lab: run a scan of the active repo, triage the
candidate house rules, and turn the accepted ones into a skill. Server contract:
[`../../server/specs/conventions.md`](../../server/specs/conventions.md).

## Route & navigation
- Route `/repos/:repoId/conventions` (repo from the URL, like Pull Requests).
- Sidebar: section **SKILLS LAB** = Skills, Agents, **Conventions** (`g c`). Pull
  Requests stays under WORKSPACE.
- Breadcrumb: `Skills Lab › Conventions`.

## Data (hook → endpoint, `src/lib/hooks/conventions.ts`)
| Hook | Endpoint |
|---|---|
| `useConventions(repoId)` | `GET /repos/:id/conventions` → `ConventionBoard` |
| `useExtractConventions()` (mutation, seeds the board cache) | `POST /repos/:id/conventions/extract` |
| `useUpdateConvention()` | `PATCH /conventions/:id` |
| `useBulkUpdateConventions()` | `PATCH /repos/:id/conventions` |
| `useConventionSkillDraft(repoId, enabled)` (query, not cached after close) | `POST /repos/:id/conventions/skill-draft` |
| `useCreateSkillFromConventions()` (invalidates `['skills']`) | `POST /repos/:id/conventions/skill` |

## Board
- Header: **Conventions in `<repo>`** (repo name in accent mono). Subtitle
  "Detected from N sample files · last scan {relative}" once a scan exists; otherwise
  an intro line.
- Scan buttons — two distinct actions:
  - **Run Scan** — shown when the repo has never been scanned (header + empty-state CTA).
  - **Re-scan** — shown once a scan exists (top-right).
  - While a scan runs: button in loading state, "Scanning…" hint (20–60 s).
- Scan summary line (after a scan): proposed · dropped without evidence · duplicates ·
  single-file · kept · model · cost (`formatCost`, `—` when unpriced).
- Toolbar: **Deselect all** (bulk accepted → pending) · "{a} of {n} accepted" ·
  **Create skill** — rendered only when ≥ 1 candidate is accepted.
- Card list = pending + accepted candidates. Rejected candidates live in a collapsed
  **Rejected (n)** section (with Undo); they never reach the skill.
- States: skeleton while loading, error state with retry, empty state (never scanned),
  empty-after-scan ("no grounded conventions found").

## Candidate card
- Left accent border when accepted; rejected cards appear only in the Rejected section.
- Rule as italic bold title; category chip; rationale (muted); "found in N files" when
  `occurrences` is known.
- Evidence block: header `path:start-end` (links to the exact lines on GitHub, pinned
  to the scan's `head_sha`) + copy button; snippet in mono.
- Confidence label + bar + %; bar colour: ≥ 85 ok, ≥ 65 warn, otherwise muted.
- Actions: **Accept** (shows "Accepted" when on), **Reject**, **Edit**.
- **Edit is inline**: the card turns into a form (rule, rationale, category) with
  Save / Cancel; no navigation, no modal.

## Create skill modal
- Title "Create skill from conventions", subtitle = the skill name.
- Banner: "Merged from **N accepted conventions** in `<repo>`. Everything below is
  editable before you save."
- Fields (prefilled from the server draft, all editable): **Name*** (`<repo>-conventions`),
  **Description** ("N house conventions extracted from `<repo>`"), **Type** (default
  `convention`), **Enabled** toggle ("Whether this block is added to agents' prompts."),
  **Skill body*** in the shared `SkillBodyEditor` (file header, `unsaved` badge, token
  count, line numbers, markdown highlighting). Body scrolls; footer stays pinned.
- Footer: "Saved as v1 · added to Skills Lab" · Cancel · **Create skill** (disabled
  while Name or Body is empty or while saving).
- On success: close, navigate to `/skills/:id`. The new skill appears in the Skills
  list. **No agent picker** — the skill is linked on `/agents/:id` → Skills tab.

## Invariants
- No fetch outside a `src/lib/hooks/*` hook; mutation errors are toasted once (global
  `MutationCache`).
- Accept / Reject / Edit persist immediately; a reload shows the same state.

## Testing
- `helpers.test.ts` — counts, active vs rejected split, evidence range, confidence tone.
- `ConventionCard.test.tsx` — accept / reject / inline edit save & cancel, copy.
- `ConventionsView.test.tsx` — Run Scan vs Re-scan, Create skill hidden at 0 accepted,
  rejected collapsed, summary line.
- `CreateSkillFromConventionsModal.test.tsx` — prefilled draft, required fields, submit.
- e2e `e2e/specs/11-conventions.flow.json` — sidebar → Conventions → seeded rules →
  Create skill modal → Cancel.
