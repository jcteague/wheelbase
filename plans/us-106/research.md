# US-106 — Research and decisions

Planning only; checked against source on 2026-10-12. Requirements remain in
[OPT-14](https://linear.app/optionswheel/issue/OPT-14/us-106-fire-alert-when-short-call-is-within-2percent-of-strike).
No unresolved research questions remain.

## Extend the existing rule registry

- **Decision:** Add `PMCC_ASSIGNMENT_RISK` to `RuleCode` and `RULES` in
  `src/main/core/alerts.ts`, with medium urgency and fixed
  `PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW = 2`. Match only `PMCC_OPEN` and compare
  the unrounded Decimal signed distance `(strike - price) / strike * 100 <= 2`.
  Reuse `priceVsStrikeMissingData('PMCC_OPEN')`, `proximityPercent`, `formatStrike`
  and the existing Review position action; add `pmccAssignmentRiskSummary`.
- **Rationale:** The existing engine already returns matches and per-rule skips;
  storage and queue consumers accept additional rule codes. Absolute distance is
  appropriate for the displayed magnitude, but would incorrectly clear a deep-ITM
  call if used as the predicate. Direction uses `price >= strike`, including ATM.
- **Alternatives considered:** A new engine, configurable threshold, absolute band,
  DTE-dependent urgency, and modifications to the wheel predicates are unnecessary
  or excluded by the issue. No new dependency is needed.

## Reuse PMCC replay without broadening wheel active-leg SQL

- **Decision:** Keep wheel `EVALUABLE_QUERY` and `activeLegSubquery()` unchanged.
  In `evaluate-alerts.ts`, additionally select ACTIVE PMCC positions in
  `PMCC_OPEN`, bulk-load their legs with `readLegsByPosition`, and resolve each
  short with `currentShortCallLeg`. Map a non-null short to the existing
  `EvaluableRow` shape before the existing market-data prefetch. Exclude a null
  short. Wrap each replay in its own error boundary.
- **Rationale:** Source has already implemented short-leg replay in
  `src/main/services/pmcc-ledger.ts`: it handles paired rolls, ignores LEAPS rolls,
  and clears expired, closed or assigned shorts. `PMCC_OPEN` alone does not prove
  a short exists. `activeLegSubquery` also serves `get-position.ts` and
  `list-positions.ts`; broadening it would populate PMCC's deliberately null
  legacy `activeLeg`. Reuse the existing bulk reader instead of adding N+1 reads.
- **Alternatives considered:** The issue suggests extending the shared SQL
  selector. This plan deliberately refines that technical note based on current
  source. Selecting the newest CALL or ROLL_TO can select the LEAPS or resurrect a
  closed short. Reimplementing replay in SQL duplicates established behavior.

## Generic short-leg rules and failure isolation

- **Decision:** Feed the selected short's strike, expiration, premium, contracts
  and CALL OCC symbol into the existing engine. EXPIRATION_IMMINENT,
  MANAGEMENT_WINDOW, PROFIT_TARGET and EARNINGS_PROXIMITY intentionally ride along,
  as OPT-14 explicitly requires. Keep both wheel-specific rules phase-gated.
  Preserve the prefetch degradation, per-item catches, matches/skips keep-open
  set, single persistence transaction and generic service logging.
- **Rationale:** The generic rules already have the right predicates; no extra
  dispatch layer is needed. `groupRollChains`, called by replay, parses Decimal
  data and may throw, so selection must not add an unguarded failure before the
  existing per-position loop. A successful replay returning null is distinct
  from a replay failure.
- **Alternatives considered:** Duplicating the generic rules for PMCC or suppressing
  them contradicts the story. For a replay exception, log
  `alert_evaluation_failed` with position id and preserve that position's existing
  open/dismissed rule keys for this run; it is unknown, not confirmed closed.
  Resolve normally after a successful replay returns null. Leave unrelated
  existing engine-error behavior outside this change.

## Persistence and interfaces

- **Decision:** Reuse `upsertOpenAlert`, `resolveAlertsNotIn`, `clearStaleDismissals`,
  and `listManagementQueue` in `src/main/services/alerts.ts`. Add no schema,
  migration, production IPC channel, preload payload, or settings field.
- **Rationale:** `rule_code` is stored as TEXT. Queue results already contain
  `phase`; the shared phase enum already contains `PMCC_OPEN`. Missing/malformed
  quotes produce `missing_underlying_price` and preserve previous summaries.
  Dismissal, dedupe and clear/refire behavior are rule-neutral.
- **Alternatives considered:** New alert storage or a queue `strategyType` field
  would add contracts without information this story needs.

## Mockup interpretation and renderer scope

- **Decision:** Implement the queue row in
  `mockups/us-106-pmcc-assignment-risk-alert.mdx`: XYZ ticker, MED pill, compact
  gold-dot `PMCC · short call` badge, summary, Review position and existing Dismiss
  action. Use the existing `Badge` primitive as `PmccPositionRow` does. Expand
  the phase column to the mockup's 150px so the label fits. Apply this badge to
  every `PMCC_OPEN` queue row, including the HIGH expiration row.
- **Rationale:** Production already has `ManagementQueueRow`, `UrgencyPill`,
  hash navigation and dismissal. `PhaseBadge` currently renders a valid but long
  PMCC phase label, rather than the requested strategy badge. No standalone
  PMCC badge component exists to import.
- **Alternatives considered:** Do not ship the mockup's explanatory panel,
  `StrikeRuler`, gold row highlighting or preset controls: they explain the
  prototype states and are not requested production UI. There is no new sheet,
  form, success banner or detail-page alert. The prototype explanation uses
  amber for approach/missing quote, red for ITM and green for resolution; the
  production row stays MED and retains its summary during missing quotes.

## Deterministic verification

- **Decision:** Core/service tests pin the issue's dates and exact money strings;
  run service cases with `TZ=America/New_York` and explicit noon-UTC `now` values.
  Electron tests use the existing run-day-relative convention, preserving 18 DTE
  initially and 4 DTE in the imminent case, and preserve all prices and strikes.
  Use `buildLaunchEnv`, `launchElectron`, fake market data, scheduler run-now,
  PMCC creation, real short-roll IPC, and the existing test PMCC leg-event seam.
- **Rationale:** The alert scheduler uses real `new Date()`; the IVR fake clock
  does not control this job. Relative Electron dates avoid a new clock API and
  expired-fixture failures. Fixed-date service cases verify the exact calendar
  examples. `setActiveLegExpiration` updates every leg and must not be used for
  PMCC: select only the current short id when arranging the 4-DTE case.
- **Alternatives considered:** Do not add production clock or quote controls.
  Change fake quote environment values through Electron's main-process evaluate
  between runs (the fake provider reads them per request). Capture DEBUG pino
  output for the missing-quote skip assertion; clear inherited `VITEST` in the
  Electron launch environment and build with `MAIN_VITE_LOG_LEVEL=debug` because
  the build-time log setting wins over runtime `LOG_LEVEL`.

## Sources checked

- Spec orientation: `docs/spec/domain/alerts.md`,
  `docs/spec/features/us-104-roll-pmcc-short-call.md`, and
  `docs/spec/architecture/02-adrs/alert-evaluation-failure-isolation.md`.
- Source verification: `src/main/core/alerts.ts`, `src/main/core/dte.ts`,
  `src/main/services/{evaluate-alerts,alerts,active-leg-sql,pmcc-ledger,leg-rows}.ts`,
  `src/main/schemas.ts`, `src/preload/index.d.ts`, `src/main/index.ts`,
  `src/main/logger.ts`, and `src/main/integrations/fake-market-data.ts`.
- Existing test patterns: `src/main/services/evaluate-alerts-test-utils.ts`,
  `src/main/services/test-fixtures/pmcc-legs.ts`, `e2e/alert-helpers.ts`,
  `e2e/assignment-helpers.ts`, `e2e/pmcc-ledger-helpers.ts` and
  `e2e/expiration-imminent-alert.spec.ts`.
- Research agent checked the shared selector's callers and replay behavior.
  No external API or library research was needed; this uses existing facilities.
