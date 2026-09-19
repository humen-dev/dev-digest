# Severity findings filter — spec (client UI)

On the PR detail page (**Agent runs** tab → **Review runs**), each expanded
review-run card shows a per-run counter of its findings by severity —
`3 CRITICAL · 5 WARNING · 2 SUGGESTION` — and clicking a level filters that run's
findings to it. **No new data calls** — counts come from the already-loaded
review's `findings`.

## Taxonomy
- Severity is the fixed 3-value enum `CRITICAL | WARNING | SUGGESTION`
  (`@devdigest/shared` `Severity`). Display order is most-severe-first.
- Colours reuse `SEV_COLOR` (`FindingCard/constants.ts`):
  `var(--crit)` · `var(--warn)` · `var(--sugg)`.

## Counts — `runSeverityCounts(findings: FindingRecord[])`
- Group one run's findings by severity → `{ CRITICAL, WARNING, SUGGESTION }`.
- Pure grouping (a `for` loop) — **never** an LLM call, on page load or on filter
  toggle.
- Dismissed findings **are** counted (they still render as muted cards, so the
  pill count matches the cards shown below).

## Surface — SeverityFilterBar (inside the expanded ReviewRunAccordion)
- Rendered under the run's `VerdictBanner`, above its `FindingsPanel`, only when
  the run has ≥1 finding.
- One pill per **present** severity (`count > 0`): `{count} {LABEL}`, tinted by
  `SEV_COLOR[sev]`, joined by `·`. A severity with zero findings has no pill.
- Interaction (single-select toggle, local to this card):
  - click an inactive level → filter this run's findings to that severity;
  - click the active level → clear back to "all".
- Active pill is emphasized (filled tint + coloured border); inactive pills are
  outlined/muted.
- a11y: pills are `<button aria-pressed>`; the row is a labelled `role="group"`.
- i18n: `prReview.severityBar.{critical,warning,suggestion,aria,groupLabel}`.

## Filter behavior
- The active severity is `ReviewRunAccordion` local state, passed to that card's
  `FindingsPanel`; `visibleFindings(findings, hideLow, severityFilter)` drops
  non-matching severities and composes with the existing low-confidence filter +
  severity sort. Each run card filters independently.
- Filtered-to-empty falls back to the panel's existing "No findings match" state.

## States
- Run with no findings: no bar (findings panel shows its own empty state).
- Filter is ephemeral React state per card (resets on collapse/reload), consistent
  with the hide-low-confidence toggle — not persisted to URL/query.

## Testing (`pnpm test`, fetch mocked)
- `SeverityFilterBar`: renders `{count} {LABEL}` per present level; omits zero-count
  severities; `onSelect(sev)` on click, `onSelect(null)` on re-click of the active
  level.
- `visibleFindings`: severity filter restricts to one level and composes with
  `hideLow`.
