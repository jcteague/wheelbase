# US-15 — Display Linked Roll Pairs in the Leg Timeline — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (no dependencies)

> Both areas can be started immediately and run in parallel.

### Area 1: Backend — Expose `rollChainId` in `getPosition` Legs

- [x] **[Red]** Write failing tests — `src/main/services/get-position.test.ts`
  - Test cases:
    - After rolling a CSP (set up state via `rollCspPosition`), call `getPosition`; assert both ROLL_FROM and ROLL_TO legs in `result.legs` have a non-null `rollChainId` and share the **same** value
    - A non-roll leg (e.g. `CSP_OPEN`) returned by `getPosition` has `rollChainId: null`
  - Run `pnpm test src/main/services/get-position` — all new tests must fail

- [x] **[Green]** Implement — `src/main/schemas.ts` + `src/main/services/get-position.ts` _(depends on: Area 1 Red ✓)_
  - In `src/main/schemas.ts`: add `rollChainId: string | null` to `LegRecord` interface (after `fillDate`)
  - In `src/main/services/get-position.ts`:
    - Add `roll_chain_id: string | null` to the `LegRow` interface
    - Add `roll_chain_id` to the `GET_LEGS_QUERY` SELECT column list
    - In `mapLegRow`, add `rollChainId: r.roll_chain_id ?? null`
  - Run `pnpm test src/main/services/get-position` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/services/get-position.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check naming consistency with other `LegRecord` usages across `src/main/schemas.ts`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 2: Renderer Types — Add `rollChainId` to `LegDetail` and `LegHistoryEntry`

- [x] **[Red]** Write failing tests — `src/renderer/src/components/LegHistoryTable.test.tsx`
  - Test cases:
    - Render `LegHistoryTable` with a leg that has `rollChainId: null` explicitly set; assert a role badge renders and no roll group header appears (verifies the type accepts the field without breaking normal-leg rendering)
  - Run `pnpm test src/renderer/src/components/LegHistoryTable` — new test must fail (type error or missing field)

- [x] **[Green]** Implement — `src/renderer/src/api/positions.ts` + `src/renderer/src/components/LegHistoryTable.tsx` _(depends on: Area 2 Red ✓)_
  - In `src/renderer/src/api/positions.ts`: add `rollChainId: string | null` to the `LegDetail` type
  - In `src/renderer/src/components/LegHistoryTable.tsx`: add `rollChainId: string | null` to the `LegHistoryEntry` type
  - Run `pnpm test src/renderer/src/components/LegHistoryTable` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/api/positions.ts` + `src/renderer/src/components/LegHistoryTable.tsx` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Pure Utility (depends on Area 2 Green)

> Start after Area 2 Green ✓. (Area 1 can still be in progress — unit tests use mock data.)

### Area 3: Pure Utility — `buildRollTimeline` and `computeCumulativeRollSummary`

**Requires:** Area 2 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/rollGroups.test.ts` _(depends on: Area 2 Green ✓)_
  - Test cases (all in new `src/renderer/src/lib/rollGroups.test.ts`):
    - `buildRollTimeline([CSP_OPEN])` → `[{ type: 'leg', leg: CSP_OPEN }]` (no roll groups, no cumulative item)
    - `buildRollTimeline([CSP_OPEN, ROLL_FROM(chainId:'abc'), ROLL_TO(chainId:'abc')])` → 3 items: `leg`, `roll(rollNumber:1)`, `cumulative`
    - Two roll pairs ('abc' fill date before 'def') → roll groups numbered `rollNumber: 1` and `rollNumber: 2` in chronological order
    - `[CSP_OPEN, ROLL_FROM, ROLL_TO, ASSIGN, CC_OPEN]` → order: `leg(CSP_OPEN)`, `roll#1`, `cumulative`, `leg(ASSIGN)`, `leg(CC_OPEN)`
    - ROLL_FROM premium '1.20', ROLL_TO premium '2.80', 1 contract → `net.isCredit: true`, `net.perContract: 1.60`, `net.total: 160`
    - ROLL_FROM premium '3.00', ROLL_TO premium '2.50' → `net.isCredit: false`, `net.perContract: 0.50`
    - Same strike, different expiration → `rollType: 'Roll Out'`
    - ROLL_TO.strike < ROLL_FROM.strike, different expiration → `rollType: 'Roll Down & Out'`
    - `computeCumulativeRollSummary` with two credit groups (1.60, 0.80) → `{ totalCredits: 2.40, totalDebits: 0, net: 2.40, rollCount: 2 }`
    - `computeCumulativeRollSummary` with one credit (1.60) + one debit (0.50) → `{ totalCredits: 1.60, totalDebits: 0.50, net: 1.10, rollCount: 2 }`
  - Run `pnpm test src/renderer/src/lib/rollGroups` — all new tests must fail

- [x] **[Green]** Implement — `src/renderer/src/lib/rollGroups.ts` _(depends on: Area 3 Red ✓)_
  - Create `src/renderer/src/lib/rollGroups.ts` exporting:
    - Types: `RollGroup`, `NormalLeg`, `CumulativeItem`, `TimelineItem`, `CumulativeRollSummary` (as defined in `plans/us-15/data-model.md`)
    - `export function buildRollTimeline(legs: LegHistoryEntry[]): TimelineItem[]`
      1. Partition legs: roll legs (`legRole === 'ROLL_FROM' || 'ROLL_TO'`) vs normal legs
      2. Group roll legs by `rollChainId` → `{ rollFromLeg, rollToLeg }` pairs
      3. Sort groups by `rollFromLeg.fillDate` ASC; assign `rollNumber` 1, 2, 3...
      4. For each group: compute `rollType`/`rollDetail` via `getCcRollTypeLabel`/`getCcRollTypeDetail`, compute `net` via `computeNetCreditDebit` (imported from `rolls.ts`)
      5. Interleave normal legs and roll groups chronologically; append `{ type: 'cumulative' }` item immediately after the last roll group
    - `export function computeCumulativeRollSummary(rollGroups: RollGroup[]): CumulativeRollSummary`
      - Sum `net.perContract` by `net.isCredit` into `totalCredits` / `totalDebits`
  - Import from `../lib/rolls`: `getCcRollTypeLabel`, `getCcRollTypeDetail`, `computeNetCreditDebit`
  - Run `pnpm test src/renderer/src/lib/rollGroups` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/lib/rollGroups.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Ensure no mutation of input `legs` array (pure functions throughout)
  - Check naming consistency with `rolls.ts` conventions
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Component Render Extension (depends on Area 3 Green)

> Start after Area 3 Green ✓.

### Area 4: `LegHistoryTable` Render Extension

**Requires:** Area 3 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/LegHistoryTable.test.tsx` _(depends on: Area 3 Green ✓)_
  - Test cases (add to existing `LegHistoryTable.test.tsx`):
    - One ROLL_FROM (chainId:'abc', premium:'1.20', strike:'180', exp:'2026-04-18') + one ROLL_TO (chainId:'abc', premium:'2.80', strike:'180', exp:'2026-05-16') → renders text "Roll #1" and "Roll Out" in the table
    - Net credit roll (FROM $1.20, TO $2.80) → renders "+$1.60/contract" in the header row
    - Net debit roll (FROM $3.00, TO $2.50) → renders "−$0.50/contract" or "0.50/contract" in the header row
    - Three roll pairs → renders "Roll #1", "Roll #2", "Roll #3" headers
    - Single credit roll → cumulative summary row contains "Credits" and "1.60" and "Net"
    - `[CSP_OPEN, ROLL_FROM, ROLL_TO, ASSIGN]` → "CSP Open" badge and "Assign" badge both appear; table order: CSP Open before roll group, Assign after cumulative summary
    - ROLL_FROM leg in group has empty basis cell; ROLL_TO leg has a non-null `runningCostBasis` displayed
  - Run `pnpm test src/renderer/src/components/LegHistoryTable` — all new tests must fail

- [x] **[Green]** Implement — `src/renderer/src/components/LegHistoryTable.tsx` _(depends on: Area 4 Red ✓)_
  - Import `buildRollTimeline`, `computeCumulativeRollSummary`, `RollGroup`, `CumulativeRollSummary` from `../lib/rollGroups`
  - Import `rollCreditDebitColors` from `../lib/rolls`
  - Add new internal components (all render as `<tr>` rows to stay inside the `<table>` structure):
    - `RollGroupHeaderRow({ group: RollGroup })` — `<tr><td colspan={8}>` containing:
      - Left: bold "Roll #N" in credit/debit color, `<Badge>` with rollType, rollDetail string, fill date in muted text
      - Right: "+$N.NN/contract" or "−$N.NN/contract" in credit/debit color
      - Styled per mockup: 2px solid colored top border, subtle bg tint (green: `rgba(63,185,80,0.04)`, amber: `rgba(230,168,23,0.04)`) via `rollCreditDebitColors`
    - `RollLegRow({ leg: LegHistoryEntry })` — same columns as normal leg row but:
      - Row bg: `rgba(88,166,255,0.02)` (blue tint)
      - First `<TableCell>` gets additional `pl-7` left padding (indentation)
      - Reuses existing `PremiumCell` and `BasisCell` unchanged
    - `CumulativeSummaryRow({ summary: CumulativeRollSummary })` — `<tr><td colspan={8}>` containing:
      - "Roll Summary (N roll/rolls)" label in muted text
      - "Credits: +$X.XX" in green, "Debits: −$Y.YY" in amber (if > 0), "Net: +/-$Z.ZZ" in green or red
      - Blue-tinted bg: `rgba(88,166,255,0.03)`, blue `border-t`
  - Replace `<tbody>` `legs.map(...)` with `buildRollTimeline(legs).map((item) => ...)`:
    - `type: 'leg'` → existing normal `<tr>` (unchanged)
    - `type: 'roll'` → `<RollGroupHeaderRow>` + `<RollLegRow rollFromLeg>` + `<RollLegRow rollToLeg>`
    - `type: 'cumulative'` → `<CumulativeSummaryRow>`
  - Run `pnpm test src/renderer/src/components/LegHistoryTable` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/LegHistoryTable.tsx` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm all existing non-roll tests (normal legs, ASSIGN, CC_CLOSE, CALLED_AWAY, tfoot P&L) still pass
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — E2E Tests (depends on all Green tasks)

**Requires:** Area 1 Green ✓, Area 2 Green ✓, Area 3 Green ✓, Area 4 Green ✓

### E2E Tests

- [ ] **[Red]** Write failing e2e tests — `e2e/us15-roll-pair-timeline.spec.ts` _(depends on: all Green tasks ✓)_
  - One `it()` per AC. Use same `launchFreshApp` / `openPosition` / `openDetailFor` / `selectDate` helpers from `e2e/helpers.ts`. Roll the CSP via the Roll CSP sheet UI.
  - AC coverage:
    - AC-1: roll pair is grouped with a visual header in the leg timeline → `it('roll pair is grouped with a visual header showing Roll #1 and the roll type')`
    - AC-2: roll pair shows net credit summary in green → `it('roll pair with net credit shows the net credit per contract in the group header')`
    - AC-3: roll pair shows net debit in amber → `it('roll pair with net debit shows the net debit per contract in amber')`
    - AC-4: multiple sequential rolls are numbered in order with cumulative summary → `it('multiple sequential rolls are labeled Roll #1 Roll #2 in order with a cumulative roll summary')`
    - AC-5: roll type label reflects strike and expiration changes → `it('roll down and out shows Roll Down and Out label in the group header')`
    - AC-6: non-roll legs display normally between roll pairs → `it('non-roll legs display as normal rows before and after roll groups in chronological order')`
    - AC-7: running cost basis column includes roll impact → `it('ROLL_TO leg shows updated running cost basis reflecting the roll net credit')`
  - Run `pnpm test:e2e` from a GUI terminal — all new tests must fail (app not yet built or assertions not yet met)

- [ ] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Helper additions to `e2e/us15-roll-pair-timeline.spec.ts`:
    - `rollCsp(page, { costToClose, newPremium, newExpiration, newStrike? })` — clicks Roll CSP btn, fills form, submits, waits for confirmation
    - `getLegTimeline(page)` — returns the Leg History table locator
  - If `rollCsp` helper logic already exists in `e2e/csp-roll.spec.ts`, extract it to `e2e/helpers.ts` first
  - Run `pnpm test:e2e` from a GUI terminal — all tests must pass

- [ ] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for right reason)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] E2E tests cover every AC (AC1 through AC7)
- [ ] `pnpm test && pnpm lint && pnpm typecheck` — all clean
