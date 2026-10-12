# US-106 — PMCC short-call assignment-risk alert — Tasks

## How to Use

- Check off completed tasks by changing `[ ]` to `[x]`.
- Within each area, work sequentially: Red → Green → Refactor.
- Areas in the same layer can run in parallel; dispatch separate agents with the
  file ownership listed below. Cross-area dependencies refer to upstream **Green**
  tasks. Coordinate shared checks and formatting so they do not race active edits.
- Source plan: [plan.md](./plan.md). Read [research.md](./research.md),
  [data-model.md](./data-model.md) and [quickstart.md](./quickstart.md).
- Requirements remain in [OPT-14 / US-106](https://linear.app/optionswheel/issue/OPT-14).
  S1–S9 below are test references to its scenarios, not a replacement story.
- No migration or new production IPC contract is planned. Preserve the shared
  `activeLegSubquery` and PMCC's null legacy wheel `activeLeg`.
- Red must demonstrate the missing behavior, not a fixture/import failure.
  Existing regression tests may already pass. E2E tests added after implementation
  may also pass immediately: record that result and prove relevant assertions fail
  against the pre-feature baseline in an isolated checkout; do not break working
  code or weaken assertions to manufacture a Red result.
- Run `pnpm rebuild:node` before unit/service tests after an Electron run. Only
  switch to `pnpm rebuild:electron` once parallel Node test work has finished.

---

## Layer 1 — Independent core rule and queue presentation

> Both areas can start immediately. The queue already receives `PMCC_OPEN` through
> its existing shape, so its component tests do not depend on the new rule code or
> service implementation. Core owns `src/main/core/alerts*`; UI owns
> `ManagementQueueRow.tsx` and its test.

### A. Pure PMCC assignment-risk rule

- [ ] **A-Red [Red]** Write failing examples and properties — `src/main/core/alerts.test.ts`, `src/main/core/alerts.property.test.ts`.
  - Against strike `110.0000`, cover prices 107.80, 108.35, 110.00, 112.53 and
    118.80; assert medium urgency, Review position and exact Linear summaries.
  - Exclude 107.70, 105.00 and 107.7999; the predicate must not use display rounding.
  - Missing/malformed/nonfinite prices skip with `missing_underlying_price`;
    absent/malformed strikes skip with `missing_strike` when price is valid.
  - Non-PMCC phases produce neither a PMCC match nor skip, even without quotes.
    Preserve wheel outputs and independent 4-DTE expiration co-firing.
  - Property cases in `alerts.property.test.ts`: independent threshold oracle
    `price * 100 >= strike * 98`; increasing-price monotonicity; non-PMCC phase
    guard. Use positive 4-dp money generators and constrained phase generators,
    exact Decimal comparisons, and no `fc.pre` rejection loop.
  - Run `pnpm test src/main/core/alerts.test.ts src/main/core/alerts.property.test.ts`;
    record failures demonstrating the absent PMCC rule. Guard-only properties may
    pass before implementation and supplement the positive oracle cases.
- [ ] **A-Green [Green]** Implement — `src/main/core/alerts.ts`. _(depends on: A-Red ✓)_
  - Extend `RuleCode`; add `PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW = 2` and
    `PmccAssignmentRiskInput = PriceVsStrikeInput` per Type Design.
  - Add `pmccAssignmentRiskSummary` reusing magnitude and strike formatting;
    use the exact below/at-or-above suffixes from Linear.
  - Append one medium-urgency registry entry with phase `PMCC_OPEN`,
    `priceVsStrikeMissingData('PMCC_OPEN')` and signed unrounded Decimal predicate
    `(strike - price) / strike * 100 <= 2`. Reuse Review position.
  - Run the A-Red command; all tests must pass. No core logging or I/O.
- [ ] **A-Refactor [Refactor]** `/refactor` — `src/main/core/alerts.ts` and its tests. _(depends on: A-Green ✓)_
  - **Invoke `source-command-refactor` (the migrated `/refactor` command)**;
    do not substitute manual cleanup or only the code-simplifier skill.
  - Retain shared guards/slices; update comments and avoid unrelated rule changes.
    Keep assertions scoped to rule codes when generic rules co-fire.
  - Stress properties with 500 runs across several seeds using temporary setup;
    remove seed/setup overrides afterward, as described in quickstart.
  - Run `pnpm test`, then `pnpm lint`, then `pnpm typecheck`, then `pnpm format`.

### B. PMCC management-queue badge

- [ ] **B-Red [Red]** Write failing component tests — `src/renderer/src/components/ManagementQueueRow.test.tsx`.
  - Assert XYZ, MED, `PMCC · short call`, full summary and Review position;
    the badge cell must not show the wheel phase label.
  - Assert Review position sets the existing detail hash and Dismiss passes the
    alert id to its callback. Preserve wheel badges and actions.
  - A HIGH PMCC expiration row gets the same strategy badge: branch by phase,
    not summary text or an added queue rule-code field.
  - Run `pnpm test src/renderer/src/components/ManagementQueueRow.test.tsx`;
    record the missing PMCC badge failure while existing actions remain green.
- [ ] **B-Green [Green]** Implement — `src/renderer/src/components/ManagementQueueRow.tsx`. _(depends on: B-Red ✓)_
  - Follow `QueueRow` in `mockups/us-106-pmcc-assignment-risk-alert.mdx`: existing
    ticker/urgency, 150px badge column, summary, Review position and Dismiss.
  - For `PMCC_OPEN`, render existing `Badge` with compact gold dot and
    `PMCC · short call`; retain `PhaseBadge` for wheels and `wb-*` utility classes.
  - Preserve hash navigation/dismissal. No explanatory ruler, preset controls,
    new form, overlay, success banner or detail-page alert.
  - Run the B-Red command; all tests must pass.
- [ ] **B-Refactor [Refactor]** `/refactor` — queue row and component tests. _(depends on: B-Green ✓)_
  - **Invoke `source-command-refactor` (the migrated `/refactor` command)**;
    do not substitute manual cleanup or only the code-simplifier skill.
  - Keep the inline badge branch, accessible action names and existing test hooks;
    avoid introducing a strategy component hierarchy.
  - Run `pnpm test`, then `pnpm lint`, then `pnpm typecheck`, then `pnpm format`.

---

## Layer 2 — PMCC target selection and alert lifecycle

> Start after A-Green. This area can overlap remaining independent queue work and
> upstream refactoring, provided shared verification is coordinated.

### C. Current-short selection and persistence integration

**Requires:** A-Green ✓. Owns `src/main/services/evaluate-alerts.ts`,
`evaluate-alerts-pmcc.test.ts` and the existing `evaluate-alerts.test.ts`.

- [ ] **C-Red [Red]** Write failing service tests — `src/main/services/evaluate-alerts-pmcc.test.ts`; revise the obsolete US-101 exclusion test in `src/main/services/evaluate-alerts.test.ts`. _(depends on: A-Green ✓)_
  - Use the fixed New York calendar fixtures in quickstart and injected providers
    and logger. Assert only the current short CALL OCC is fetched, never the LEAPS.
  - Verify assignment risk plus generic short-leg rules: 18-DTE management window,
    4-DTE imminent at $110, $2 premium/$0.80 mid yielding 60.0% profit target, and
    earnings within the short expiration but not events occurring afterward.
  - Roll through `rollPmccShortCallPosition` to $115/2026-11-20 at price 112.53:
    old alert resolves without refire. Include repeated short rolls and a later
    LEAPS roll to protect side selection.
  - Expired/closed/assigned shorts and inactive PMCC positions are excluded;
    prior alerts resolve. A later short opening becomes evaluable again.
  - Cover dedupe and stable open id, retreat to 106, clear/refire with a fresh id,
    dismissal suppression and rearming after the condition clears.
  - Missing/malformed quotes and rejected quote fetch retain the old summary/id;
    assert DEBUG skip reason and continued quote-independent DTE evaluation.
  - Malformed PMCC replay must not suppress healthy wheel/PMCC results. Preserve
    failed positions' open/dismissed keys and log their ids. A bulk PMCC history
    read failure preserves their keys while wheel evaluation proceeds.
  - Verify queue phase enrichment and HIGH-before-MED ordering, unchanged wheel
    summaries, no LEAPS fields in alerts and preserved null legacy wheel fields.
  - Replace the old blanket PMCC exclusion expectation with a 5-DTE short's
    EXPIRATION_IMMINENT match and no wheel-specific rule or error.
  - Run `TZ=America/New_York pnpm test src/main/services/evaluate-alerts-pmcc.test.ts src/main/services/evaluate-alerts.test.ts`;
    record failures caused by missing PMCC target selection.
- [ ] **C-Green [Green]** Implement — `src/main/services/evaluate-alerts.ts`. _(depends on: C-Red ✓)_
  - Define `PmccCandidateRow` using the Pick/intersection in data-model Type Design.
    Query ACTIVE/PMCC/PMCC_OPEN candidates without changing the wheel query.
  - Add module-private `loadPmccEvaluableRows`: bulk `readLegsByPosition`, isolated
    `currentShortCallLeg` replay, mapping to existing `EvaluableRow[]`. Record
    exceptions in the local failed-id set; distinguish failure from a null short.
  - Merge healthy PMCC rows before existing OCC and market-data prefetch. Pass
    short premium/contracts/strike/expiry through `toEvaluationInput`; preserve
    generic rules and threshold precedence.
  - Add existing open/dismissed keys for failed selections to `keepOpenKeys` via
    bound parameters and `alertKey`. Confirmed null shorts resolve normally.
    Retain existing persistence functions and single transaction.
  - Preserve generic INFO/DEBUG logs and per-item isolation; selection failures log
    `alert_evaluation_failed`. No broker gate, new provider method or IPC change.
  - Run the C-Red command; all tests must pass.
- [ ] **C-Refactor [Refactor]** `/refactor` — service and focused tests. _(depends on: C-Green ✓)_
  - **Invoke `source-command-refactor` (the migrated `/refactor` command)**;
    do not substitute manual cleanup or only the code-simplifier skill.
  - Reuse existing replay, bulk reader and persistence helpers; avoid duplicate
    SQL replay, normal-path N+1 reads and unrelated list/detail changes.
  - Keep fixtures local unless another caller needs them; review logging and
    failure preservation against research/data-model decisions.
  - Run `pnpm test`, then `pnpm lint`, then `pnpm typecheck`, then `pnpm format`.

---

## Layer 3 — E2E Tests

**Requires:** A-Green ✓, B-Green ✓, C-Green ✓. Finish ongoing Node test processes
before rebuilding the native SQLite module for Electron.

### D. E2E Tests

- [ ] **D-Red [Red]** Write acceptance tests — `e2e/pmcc-assignment-risk-alert.spec.ts`. _(depends on: A-Green ✓, B-Green ✓, C-Green ✓)_
  - Use one named test per scenario; `it.each` expands outline examples into
    separately named tests. Read expected summary literals from Linear, never
    from production helpers. The mapping below covers nine families / 15 cases.
  - S1 → `it.each(... )('Alert fires as the stock approaches or passes the short-call strike — $price', ...)`:
    prices 107.80, 108.35, 110.00, 112.53, 118.80; persisted medium open alert and
    exact summary for each example.
  - S2 → `it.each(... )('Alert does not fire while the stock is more than 2% below the strike — $price', ...)`:
    prices 107.70 and 105.00; no assignment-risk alert; generic rows allowed.
  - S3 → `it('The queue row identifies the position as a PMCC', ...)`:
    MED, PMCC badge, summary and Review position navigation to XYZ detail.
  - S4 → `it('Alert resolves when the stock retreats below the band', ...)`:
    fire then quote 106; stored resolution and removal of that queue row.
  - S5 → `it('Alert resolves when the short call is rolled further from the money', ...)`:
    real short-roll IPC to $115/later expiry at price 112.53; resolve without refire.
  - S6 → `it('A PMCC with no open short call is not evaluated', ...)`:
    open alert, record expiration through existing test leg-event seam, then
    quote 118.80; prior alert resolves, no new assignment alert or LEAPS evaluation.
  - S7 → `it('A missing quote keeps the alert open instead of resolving it', ...)`:
    remove quote after firing; same id/summary and visible row, with DEBUG skip
    carrying position id, rule code and `missing_underlying_price`.
  - S8 → `it.each(... )('Classic wheel positions do not use the PMCC rule — $ticker', ...)`:
    MSFT CC $420/price $415 has no covered-call breach; AAPL CSP $180/price $178.50
    retains its exact 0.8%-below put summary; neither produces a PMCC rule.
  - S9 → `it('The existing short-leg rules evaluate the PMCC short call, never the LEAPS', ...)`:
    4-DTE short yields HIGH imminent at $110 plus MED assignment risk; no LEAPS
    strike/expiry in XYZ summaries and HIGH sorts ahead of MED.
  - Run `pnpm rebuild:electron`, then
    `TZ=America/New_York MAIN_VITE_LOG_LEVEL=debug pnpm test:e2e e2e/pmcc-assignment-risk-alert.spec.ts`.
    Record actual results and meaningful baseline failures as described in How to Use.
- [ ] **D-Green [Green]** Make acceptance tests pass. _(depends on: D-Red ✓)_
  - Follow quickstart: temporary DB, fake market data, closed fake session,
    explicit scheduler runs, real PMCC creation/roll and existing leg-event seam.
  - Use relative Electron dates preserving 18/4 DTE; fixed dates remain covered
    by service tests. Do not use the IVR clock or update every PMCC leg's expiry.
  - Clear inherited `VITEST` in the Electron launch env and capture DEBUG stdout
    before quote removal. Change fake quote JSON in the main process between runs.
  - Follow the mockup's queue states. Identify the assignment row by alert
    id/summary, not ticker alone; other XYZ alerts can coexist. Await refreshed
    DOM/query state without sleeps. Never seed alerts to bypass evaluation.
  - Fix discovered defects with focused regression coverage in the owning area;
    do not loosen assertions or add production test-control APIs.
  - Run the D-Red E2E command until all 15 cases pass, then
    `TZ=America/New_York MAIN_VITE_LOG_LEVEL=debug pnpm test:e2e` for the full suite.
- [ ] **D-Refactor [Refactor]** `/refactor` — E2E suite. _(depends on: D-Green ✓)_
  - **Invoke `source-command-refactor` (the migrated `/refactor` command)**;
    do not substitute manual cleanup or only the code-simplifier skill.
  - Keep tests independently seeded/named; clean up Electron and temporary DBs.
    Extract only repeated setup, preserve all scenario assertions and rerun any
    affected E2E coverage after changes.
  - Restore Node ABI with `pnpm rebuild:node`, then run `pnpm test`, `pnpm lint`,
    `pnpm typecheck` and `pnpm format` in order.

---

## Completion Checklist

- [ ] All Red tasks have recorded meaningful failure evidence or documented
      already-green regression/baseline verification.
- [ ] Core properties cover threshold oracle, monotonicity and phase guards;
      seeded stress checks passed and temporary setup was removed.
- [ ] All Green tasks complete and tests passing.
- [ ] All four Refactor tasks invoked `source-command-refactor` and completed.
- [ ] All nine Linear scenario families / 15 E2E cases are covered.
- [ ] Full unit/integration and E2E suites pass; lint and typecheck are clean;
      formatting and service logging checks are complete.
- [ ] `/update-spec us-106` captures the implemented behavior after verification.

## Execution Summary

- **Layer 1:** A core rule and B queue badge — parallel, start immediately.
- **Layer 2:** C service integration — after A-Green.
- **Layer 3:** D E2E tests — after A-Green, B-Green and C-Green.
- **Tasks:** 12 implementation tasks: 4 Red, 4 Green, 4 Refactor, plus completion checks.
- **Next:** `$source-command-implement-plan plans/us-106/plan.md`.
