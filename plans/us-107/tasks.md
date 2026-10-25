# US-107 — Fire alert when LEAPS DTE drops below 60 days — Tasks

Story: [OPT-15 / US-107](https://linear.app/optionswheel/issue/OPT-15/us-107-fire-alert-when-leaps-dte-drops-below-60-days)
(Linear is the authority for acceptance criteria). Plan: `plans/us-107/plan.md`.

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Vitest areas (1–5) need the Node ABI (`pnpm rebuild:node`); the e2e area needs the
  Electron ABI (`pnpm rebuild:electron`). Never run both kinds of agent at the same time
- Run Vitest with `TZ=America/New_York` (service fixtures are calendar-pinned)
- Expected summaries are literal strings from Linear, never built with the production helper

---

## Layer 1 — Pure rule (no dependencies)

> One area; starts immediately. Areas 1 and 2 both edit `src/main/core/alerts.ts`, so
> Area 2 waits for Area 1 Green rather than running alongside it.

### Area 1 — Pure LEAPS roll-window rule

- [x] **[Red]** Write failing tests — `src/main/core/alerts.test.ts`, `src/main/core/alerts.property.test.ts`
  - `makeInput` (example file) and the local `input()` builder (property file) gain
    `leapsDte: null, leapsStrike: null`
  - Test cases (`PMCC_LEAPS_ROLL_WINDOW` describe block, `phase: 'PMCC_OPEN'`, `leapsStrike: '80.0000'`):
    - table-test `leapsDte` 60, 59, 30, 2, 1, 0 → one MED match, exact summaries
      `LEAPS expires in 60 days at $80.00 strike — review for roll or close`, `…in 1 day…`,
      `…today…`, `quickAction: 'Review position'`
    - `leapsDte` 61, 70, 185, -1 → no match and no skip for the rule
    - `leapsDte: null` → skipped `{ ruleCode: 'PMCC_LEAPS_ROLL_WINDOW', reason: 'missing_leaps_dte' }`, no match
    - `leapsStrike: null` with a valid DTE → skip `missing_strike`, no `$0.00` summary
    - `CSP_OPEN` and `CC_OPEN` with `leapsDte` 59 **and** with `leapsDte: null` → neither match nor skip (S8 guard)
    - leg independence: short `dte: 2`, `strike: '112.0000'`, `leapsDte: 30`, `leapsStrike: '80.0000'` →
      EXPIRATION_IMMINENT summary `Expires in 2 days at $112.00 strike` plus LEAPS summary with
      `$80.00`; no EXPIRATION_IMMINENT / MANAGEMENT_WINDOW summary contains `$80.00`
    - existing EARNINGS_PROXIMITY summaries (`today`, `in 1 day`, `in N days`) still pass once `inDays` is shared
  - Property cases — `src/main/core/alerts.property.test.ts` (DTE from `fc.integer({ min: -400, max: 800 })`,
    strike from `positiveMoney`, reuse the file's `nonPmccPhase`):
    - **Oracle:** for every PMCC input, match ⇔ `0 <= leapsDte && leapsDte <= 60` (the literal inequality, not the predicate)
    - **Guard:** for every non-PMCC phase and any `leapsDte` / `leapsStrike` (incl. null), no match or skip with this code
    - **Leg independence:** for any PMCC input, arbitrary LEAPS fields leave the set of non-LEAPS-rule
      matches and skips identical to the same input with the LEAPS fields nulled
  - Run `TZ=America/New_York pnpm exec vitest run src/main/core/alerts.test.ts src/main/core/alerts.property.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/alerts.ts` _(depends on: Area 1 Red ✓)_
  - `AlertEvaluationInput` + `leapsDte: number | null`, `leapsStrike: string | null`
  - `RuleCode` + `'PMCC_LEAPS_ROLL_WINDOW'`; `PMCC_LEAPS_ROLL_WINDOW_MAX_DTE = 60`; `MISSING_LEAPS_DTE = 'missing_leaps_dte'`
  - `PmccLeapsRollWindowInput = Pick<AlertEvaluationInput, 'leapsDte' | 'leapsStrike'>`
  - Extract `inDays(days: number): string`; `earningsProximitySummary` uses it;
    `pmccLeapsRollWindowSummary(input)` → `LEAPS expires ${inDays} at ${formatStrike} strike — review for roll or close`
  - Append `RULES` entry: `urgency: 'medium'`, `missingData` → `MISSING_LEAPS_DTE` for null DTE,
    `MISSING_STRIKE` for non-numeric strike (`isNumeric`); `test` checks `0 <= leapsDte <= 60`
  - **Temporary:** gate `missingData` / `test` inline on `input.phase === 'PMCC_OPEN'` so this
    area is green alone; Area 2 removes that gate
  - Stress the new properties: scratch setup with `fc.configureGlobal({ numRuns: 500, seed, endOnFailure: true })`
    across ~5 seeds, then delete the setup file
  - Run the two core files — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/alerts.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Registry header comment names the new rule and that it reads the LEAPS only;
    `formatStrike` reused, not re-implemented; no logging in core
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Leg declaration + queue-item field (depends on Layer 1)

> Both areas need the `'PMCC_LEAPS_ROLL_WINDOW'` `RuleCode` member from Area 1 Green. They
> touch different files and run in parallel with each other.

### Area 2 — Rules declare their leg; an absent leg makes the rule inapplicable

**Requires:** Area 1 Green ✓

- [x] **[Red]** Write failing tests — `src/main/core/alerts.test.ts`, `src/main/core/alerts.property.test.ts` _(depends on: Area 1 Green ✓)_
  - Test cases:
    - LEAPS-only PMCC input (`phase: 'PMCC_OPEN'`, `instrumentType: null`, `strike: null`, `dte: null`,
      `expiration: null`, premium / contracts / mid null, `currentUnderlyingPrice: '118.80'`,
      `daysToEarnings: 3`, `leapsDte: 2`, `leapsStrike: '80.0000'`) → `skipped` is `[]` and `matches`
      is exactly one PMCC_LEAPS_ROLL_WINDOW; no `missing_dte` / `missing_option_mark` /
      `missing_strike` / `missing_underlying_price` skip from any short-leg rule
    - US-106 hazard: the same input records **no** `PMCC_ASSIGNMENT_RISK` match and **no** skip
      (shipped `priceVsStrikeMissingData('PMCC_OPEN')` would return `missing_strike` if it still ran)
    - wheel regression: CSP_OPEN with `dte: null` still skips EXPIRATION_IMMINENT and MANAGEMENT_WINDOW
      with `missing_dte`
    - Area 1's wheel-guard tests (CSP_OPEN / CC_OPEN never see the LEAPS rule) stay green
  - Property case — **Guard:** for any PMCC input with `instrumentType: null` and arbitrary
    short-leg fields, no rule other than PMCC_LEAPS_ROLL_WINDOW appears in `matches` or `skipped`
  - Run the two core files — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/alerts.ts` _(depends on: Area 2 Red ✓)_
  - `type RuleLeg = 'short' | 'leaps'`; `RuleDefinition` gains required `leg: RuleLeg`
  - `const LEG_PRESENT: Record<RuleLeg, (input: AlertEvaluationInput) => boolean> =
{ short: (i) => i.instrumentType !== null, leaps: (i) => i.phase === 'PMCC_OPEN' }`
  - Tag EXPIRATION_IMMINENT, MANAGEMENT_WINDOW, PROFIT_TARGET, STRIKE_PROXIMITY, EARNINGS_PROXIMITY,
    COVERED_CALL_BREACH, PMCC_ASSIGNMENT_RISK `leg: 'short'`; PMCC_LEAPS_ROLL_WINDOW `leg: 'leaps'`
  - `evaluatePosition`: `const applicable = RULES.filter((rule) => LEG_PRESENT[rule.leg](input))`
    once, then the existing skip/match pipeline over `applicable`
  - Remove Area 1's inline `PMCC_OPEN` gate from the LEAPS rule
  - Run the two core files — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/alerts.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Registry comment: "each rule declares the leg it reads; a rule whose leg is absent
    produces neither a match nor a skip, so its stale alert resolves"
  - Delete a `missingData` null-short check only if this change made it redundant
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 4 — Carry the rule code on the management-queue item

**Requires:** Area 1 Green ✓ (the `RuleCode` union member)

- [x] **[Red]** Write failing tests — `src/main/services/alerts.test.ts`, `src/main/ipc/alerts.test.ts` _(depends on: Area 1 Green ✓)_
  - Test cases:
    - `listManagementQueue`: seed one EXPIRATION_IMMINENT and one PMCC_LEAPS_ROLL_WINDOW alert on
      the same position; assert each item's `ruleCode` literal; ordering (HIGH before MED, then
      `triggered_at`) unchanged
    - `alerts:list` envelope passes `ruleCode` through
  - Run `pnpm exec vitest run src/main/services/alerts.test.ts src/main/ipc/alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts`, `src/main/services/alerts.ts` _(depends on: Area 4 Red ✓)_
  - Per `contracts/alerts-list.md`: `ManagementQueueItem.ruleCode: RuleCode` (type import from
    `./core/alerts`); `QueueRow.rule_code`; select `a.rule_code AS rule_code`; map in `mapQueueRow`
  - Handler `src/main/ipc/alerts.ts` and preload alias unchanged
  - Update renderer fixtures that build `ManagementQueueItem` literals so typecheck passes:
    `ManagementQueueRow.test.tsx`, `ManagementQueue.test.tsx`, `api/alerts.test.ts`,
    `PositionsListPage.test.tsx`, any literal in `hooks/useManagementQueue.ts`
  - Run the two test files — all tests must pass; `pnpm typecheck` clean
- [x] **[Refactor]** `/refactor` — `src/main/services/alerts.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Service evaluation + renderer badge (depends on Layer 2)

> Area 3 needs the leg filter (Area 2) for its LEAPS-only cases; Area 5 needs `ruleCode` on
> the queue item (Area 4). Different files; run in parallel.

### Area 3 — Evaluate every PMCC whose LEAPS is open

**Requires:** Area 1 Green ✓, Area 2 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/evaluate-alerts-pmcc.test.ts` (new LEAPS-window describe block; own $112 / 2027-08-20 short fixtures, do not edit US-106's constants); `src/main/services/evaluate-alerts.test.ts` only if wheel fixtures need the new fields _(depends on: Area 2 Green ✓)_
  - Issue calendar: LEAPS `$80.0000` exp `2027-09-17` bought `25.0000`; short `$112.0000` exp
    `2027-08-20` sold `2.1000`; 1 contract; `now` at 16:00Z; `TZ=America/New_York`. Reuse US-106's
    `seedPmccPosition` / `openingLegs` / `seedBackground` / `rollLegs` / `run` / `rowsFor` / `openRule`
    on `makePmccLeg` + `insertLegs`, `stubProvider`, `inertEarnings`, `occFor`, `makeSpyLogger`
  - Test cases:
    - window boundary: 2027-07-19 / -07-20 / -08-18 → open MED PMCC_LEAPS_ROLL_WINDOW for XYZ with
      the exact S1 summary; 2027-07-18 and 2027-07-09 → none
    - refresh in place: 07-19 then 07-20 → same alert id and `triggered_at`, summary `…in 59 days…`;
      with `dismissAlert` between runs it stays `dismissed`, no new open row
    - LEAPS-only (S4): evaluate 2027-08-19 (EXPIRATION_IMMINENT open, short at 1 DTE), insert a
      `SHORT_CALL_EXPIRED` leg, evaluate 2027-09-15 → EXPIRATION_IMMINENT `resolved`, LEAPS row open
      `…in 2 days at $80.00…`, no other open XYZ alert; `fetchOptionSnapshots` spy called with no XYZ
      symbol and never the LEAPS OCC
    - US-106 regression: LEAPS-only PMCC with quote 118.80 → no PMCC_ASSIGNMENT_RISK match, no skip
      for it, a previously open assignment alert resolves
    - co-fire (S6) 2027-08-18: HIGH `Expires in 2 days at $112.00 strike` + MED LEAPS row; no
      EXPIRATION_IMMINENT / MANAGEMENT_WINDOW summary contains `$80.00` or `2027-09-17`
    - roll (S5): open on 07-20, real `rollPmccLeapsPosition` (`./roll-pmcc-leaps-position`) to $85 /
      2028-01-21, re-evaluate same day → `resolved`, no new row (185 DTE)
    - unreadable (S7): open on 07-20, `UPDATE legs SET expiration = 'unreadable'` on the LEAPS leg id
      only, re-evaluate → row stays `open` with the previous summary; spy logger has `alert_rule_skipped`
      with `ruleCode: 'PMCC_LEAPS_ROLL_WINDOW'`, `reason: 'missing_leaps_dte'`; `skippedRuleCount` ≥ 1.
      If `pmccOpenLegs` throws on the non-date expiration instead, stop and revisit research ADR 6
    - no LEAPS: a PMCC candidate with no LEAPS leg yields no evaluation and no `alert_evaluation_failed`
    - wheel (S8): mixed batch MSFT CC_OPEN 59 DTE + AAPL CSP_OPEN 20 DTE → MSFT no alert; AAPL exactly
      `20 DTE remaining — review for roll or close`; neither has a LEAPS-rule row or skip
  - Run `TZ=America/New_York pnpm exec vitest run src/main/services/evaluate-alerts-pmcc.test.ts src/main/services/evaluate-alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/evaluate-alerts.ts` _(depends on: Area 3 Red ✓)_
  - `EvaluableRow` + `leapsStrike: string | null`, `leapsExpiration: string | null`; `instrumentType`
    widens to `'PUT' | 'CALL' | null`; `EVALUABLE_QUERY` adds `NULL AS leapsStrike, NULL AS leapsExpiration`
  - `occSymbolForRow` returns `null` when `row.instrumentType === null`, ahead of the strike/expiration check
  - `loadPmccEvaluableRows({ db, heldIds, logger })`: `currentShortCallLeg(legs)` → `pmccOpenLegs(legs)`;
    `null` → no row; else spread candidate, map `short` fields (or nulls, `instrumentType: short ? 'CALL' : null`),
    `leapsStrike: long.strike`, `leapsExpiration: long.expiration`; keep the per-candidate catch and `heldIds.add`
  - `toEvaluationInput` + `leapsDte: computeDte(row.leapsExpiration, now)`, `leapsStrike: row.leapsStrike`
  - Module header and the `[US-106] PMCC selection` comment → "wheel positions with an active short leg,
    and PMCCs with an open LEAPS; the short-leg rules read the short, the LEAPS rule reads the LEAPS"
  - Run the two service files — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/evaluate-alerts.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Drop the `currentShortCallLeg` import if unused here (keep the export); fixtures stay in the
    focused test file; no new log events
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 5 — Leg-aware PMCC badge in the queue row

**Requires:** Area 4 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/ManagementQueueRow.test.tsx` _(depends on: Area 4 Green ✓)_
  - Test cases:
    - PMCC_LEAPS_ROLL_WINDOW item (`phase: 'PMCC_OPEN'`, `urgency: 'medium'`, `ruleCode: 'PMCC_LEAPS_ROLL_WINDOW'`)
      renders `XYZ`, the MED pill, badge text `PMCC · LEAPS` and the full summary; `PMCC · short call`
      and the wheel label `LEAPS + short call open` absent
    - EXPIRATION_IMMINENT PMCC item renders `PMCC · short call`; rename US-106's test
      "a HIGH expiration row on a PMCC gets the same badge — the branch follows phase, not rule or summary"
      to "a HIGH expiration row on a PMCC reads `PMCC · short call` — short-leg rules name the short leg"
      (assertions unchanged)
    - US-106 tint test (`PHASE_COLOR.PMCC_OPEN` on badge and dot) passes for both labels
    - Review position sets `window.location.hash` to `/positions/<id>`; Dismiss calls back with the alert id
    - CSP / CC rows still render `PhaseBadge` with the phase label
  - Query by role and visible text, not test IDs
  - Run `pnpm exec vitest run src/renderer/src/components/ManagementQueueRow.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/ManagementQueueRow.tsx` _(depends on: Area 5 Red ✓)_
  - Layout per the `QueueRow` screen in `mockups/us-107-pmcc-leaps-dte-alert.mdx` (what US-106 ships).
    Only change: `label={item.phase === 'PMCC_OPEN' ? pmccBadgeLabel(item.ruleCode) : undefined}` with
    `PMCC_LEG_LABEL = { short: 'PMCC · short call', leaps: 'PMCC · LEAPS' } as const` and
    `pmccBadgeLabel(ruleCode)` from data-model § Type Design; tint, dot and 150px column untouched
  - Do not ship mockup prototype pieces (gold row highlight, `StatGrid`, `DteRuler`, `AlertBox`es,
    preset controls); no sheet, overlay, navigation or unreadable-expiration treatment
  - Run the component test file — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/ManagementQueueRow.tsx` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Branch stays inline, no strategy-badge component; `wb-*` Tailwind tokens only, no inline style
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — E2E Tests

**Requires:** All Green tasks from Areas 1–5 ✓. Switch to the Electron ABI first (`pnpm rebuild:electron`); run with `TZ=America/New_York MAIN_VITE_LOG_LEVEL=debug`.

### Area 6 — E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/pmcc-leaps-roll-window-alert.spec.ts` _(depends on: all Green tasks ✓)_
  - Helper: add `setLegExpiration(dbPath, legId, expiration)` to `e2e/alert-helpers.ts` (single leg,
    bound by id; `sqlite(dbPath, sql)` from `e2e/pmcc-helpers.ts` + the file's `escapeSqlString`).
    Never `setActiveLegExpiration`
  - Reuse `runAlertEvaluation`, `listManagementQueueItems`, `readAlertRows`, `QUEUE_ROW`, `recordEvent`,
    `rollLeaps`, `localDate` / `localToday`, `tmpDb` / `buildLaunchEnv` / `launchElectron` / `getPage` /
    `cleanupDb` / `seedCsp` / `CLOSED_SESSION`. Copy US-106's spec-local `launch` and `createXyzPmcc`
    (parameterised: $112 short at a per-scenario DTE); extract to `e2e/pmcc-alert-helpers.ts` only if
    lifted verbatim. `delete env.VITEST` and capture `app.process().stdout` for the S7 log check
  - Dates are run-day relative: LEAPS at the scenario DTE, short 28 days earlier (e.g. `localDate(59)` / `localDate(31)`)
  - One `it()` per Linear scenario case — names mirror the Linear wording; 8 families, 12 cases:
    - S1 `it.each` (60, 59, 30): `Alert fires once the LEAPS has 60 days or fewer to expiration — <n> days` →
      open `medium` PMCC_LEAPS_ROLL_WINDOW row for XYZ, summary exactly
      `LEAPS expires in <n> days at $80.00 strike — review for roll or close`
    - S2 `it.each` (61, 70): `Alert does not fire while the LEAPS has more than 60 days left — <n> days` →
      no PMCC_LEAPS_ROLL_WINDOW row of any status; positive control: sibling CSP at 20 DTE gets a
      MANAGEMENT_WINDOW row in the same run
    - S3: `The queue row identifies the position as a PMCC and the LEAPS as the leg` → LEAPS at 59 DTE;
      the row with the exact summary shows `MED`, `PMCC · LEAPS`, the summary; `Review position` navigates
      to `#/positions/<xyzId>` and the XYZ detail header renders
    - S4: `A PMCC with only the LEAPS open is still evaluated for this rule` → LEAPS `localDate(2)`, short
      `localDate(1)`; EXPIRATION_IMMINENT open; `recordEvent` `SHORT_CALL_EXPIRED`; re-evaluate →
      EXPIRATION_IMMINENT `resolved`, LEAPS row open `LEAPS expires in 2 days at $80.00 strike — review for roll or close`,
      only open XYZ alert
    - S5: `Alert resolves when the LEAPS is rolled out past the window` → 59 DTE, evaluate, `rollLeaps` to
      $85 at `localDate(185)`, evaluate → row `resolved`, no XYZ queue row with `LEAPS expires`, no new open row
    - S6: `The short-call rules and the LEAPS rule co-fire without reading each other's leg` → short
      `localDate(2)`, LEAPS `localDate(30)`; HIGH `Expires in 2 days at $112.00 strike` + MED `…in 30 days at $80.00…`;
      no short-leg summary contains `$80.00` or the LEAPS date; HIGH sorts above MED in the queue
    - S7: `A LEAPS with no readable expiration keeps the alert open instead of resolving it` → 59 DTE,
      evaluate, capture id + summary, `setLegExpiration(dbPath, leapsLegId, 'unreadable')`, evaluate →
      same id `open` with identical summary; DEBUG stdout has `alert_rule_skipped` with XYZ's position id,
      `PMCC_LEAPS_ROLL_WINDOW`, `missing_leaps_dte`
    - S8 `it.each`: `Classic wheel positions do not use the PMCC rule — <ticker> <phase>` → MSFT CC_OPEN
      59 DTE: no alert rows, no LEAPS-rule skip in the log; AAPL CSP_OPEN 20 DTE: exactly one open
      MANAGEMENT_WINDOW `20 DTE remaining — review for roll or close`, no LEAPS-rule row or skip
  - Run `pnpm test:e2e e2e/pmcc-leaps-roll-window-alert.spec.ts` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Fixture orchestration and assertions only; no hand-inserted alert rows, no clock or quote IPC;
    fake market session stays closed; wait on locators, never sleep
  - Run `pnpm test:e2e e2e/pmcc-leaps-roll-window-alert.spec.ts` — all tests must pass
  - Regressions: `pnpm test:e2e e2e/pmcc-assignment-risk-alert.spec.ts e2e/expiration-imminent-alert.spec.ts e2e/dismiss-alert.spec.ts e2e/management-queue.spec.ts`
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Each case seeds independently and disposes Electron and the temp DB; recheck the audit table
    (8 families, 12 cases); switch back with `pnpm rebuild:node`

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for right reason)
- [ ] Core-engine areas have property tests (Area 1 oracle / guard / leg independence; Area 2 inapplicability guard)
- [ ] New properties stressed at 500 runs across ~5 seeds; scratch setup file removed
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] E2E tests cover every AC (S1–S8, 12 named cases)
- [ ] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
- [ ] Logging review: no new log calls; `alert_rule_skipped` carries `PMCC_LEAPS_ROLL_WINDOW` / `missing_leaps_dte`; nothing logged from `src/main/core/`
- [ ] `/update-spec us-107`
