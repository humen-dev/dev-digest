# Severity findings filter — spec (client UI)

On the PR detail page (**Agent runs** tab), show an aggregate counter of findings
by severity — `3 CRITICAL · 5 WARNING · 2 SUGGESTION` — above the review-run list,
and let clicking a level filter the findings below to that severity only.
**No new data calls** — counts derive from the already-loaded review runs
(`usePrReviews` → `ReviewRecord[]`, each with `findings`).

## Taxonomy
- Severity is the fixed 3-value enum `CRITICAL | WARNING | SUGGESTION`
  (`@devdigest/shared` `Severity`). Display order is most-severe-first.
- Colours reuse `SEV_COLOR` (`FindingCard/constants.ts`):
  `var(--crit)` · `var(--warn)` · `var(--sugg)`.

## Counts — `severityCounts(runs: ReviewRecord[])`
- Sum findings by severity across **all** runs → `{ CRITICAL, WARNING, SUGGESTION }`.
- Dismissed findings **are** counted (they still render in the list, so the
  headline number stays stable) and counts are independent of any per-panel
  "hide low confidence" toggle.

## Surface — SeverityFilterBar (PR detail · Agent runs)
- Rendered above the **Review runs** section, only when total findings ≥ 1.
- One chip per severity: `{count} {LABEL}`, tinted by `SEV_COLOR[sev]`, joined by `·`.
- Interaction (single-select toggle):
  - click an inactive level → filter to that severity;
  - click the active level → clear back to "all".
- Active chip is emphasized (filled tint + coloured border); inactive chips are
  outlined/muted. A **zero-count** chip is dimmed and non-interactive (`disabled`).
- a11y: chips are `<button aria-pressed>`; bar is a labelled `role="group"`.
- i18n: `prReview.severityBar.{critical,warning,suggestion,aria,groupLabel}`.

## Filter behavior
- Active severity threads down `FindingsTab → ReviewRunAccordion → FindingsPanel`;
  `visibleFindings(findings, hideLow, severityFilter)` drops non-matching severities
  and composes with the existing low-confidence filter + severity sort.
- When a severity is active, review-run accordions with **no** matching finding are
  hidden (`runHasSeverity`), so only runs containing that severity remain; the first
  remaining run auto-opens (`defaultOpen`).
- A run that matches but whose findings are all hidden by its own hide-low toggle
  falls back to the panel's existing "No findings match" empty state.

## States
- No findings at all: bar not rendered (existing "No findings yet" empty state).
- Filter is ephemeral React state (resets on reload), consistent with the
  hide-low-confidence toggle — not persisted to URL/query.

## Testing (`pnpm test`, fetch mocked)
- `SeverityFilterBar`: renders `{count} {LABEL}` per level; zero-count disabled;
  `onSelect(sev)` on click, `onSelect(null)` on re-click of the active level.
- `visibleFindings`: severity filter restricts to one level and composes with
  `hideLow`.
