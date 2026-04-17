# Implementation Plan: US-15 — Display Linked Roll Pairs in the Position Detail Leg Timeline

## Summary

Extends the existing `LegHistoryTable` component to detect ROLL_FROM/ROLL_TO leg pairs (grouped by `rollChainId`) and render them as visually linked sections with a group header, indented leg rows, and a cumulative summary row. Requires a small backend fix to expose `rollChainId` from `getPosition`, then pure grouping logic in the renderer, and finally updated component rendering.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/03-stories/US-15-roll-pair-display-in-timeline.md`
- **Research & Design Decisions:** `plans/us-15/research.md`
- **Data Model & Selection Logic:** `plans/us-15/data-model.md`
- **Quickstart & Verification:** `plans/us-15/quickstart.md`
- **Mockup:** `mockups/us-15-roll-pair-timeline.mdx`

## Prerequisites

- US-11: `LegHistoryTable` with running cost basis column already exists in `src/renderer/src/components/LegHistoryTable.tsx`
- US-12/14: `roll_chain_id` is written to the `legs` DB table by `roll-csp-position.ts` and `roll-cc-position.ts`
- `getCcRollTypeLabel` and `getCcRollTypeDetail` exist in `src/renderer/src/lib/rolls.ts`
- `computeNetCreditDebit` and `rollCreditDebitColors` exist in `src/renderer/src/lib/rolls.ts`

## Implementation Areas

---

### 1. Backend: Expose `rollChainId` in `getPosition` legs

**Files to create or modify:**

- `src/main/schemas.ts` — add `rollChainId: string | null` to `LegRecord`
- `src/main/services/get-position.ts` — add `roll_chain_id` to `LegRow` interface, `GET_LEGS_QUERY`, and `mapLegRow`

**Red — tests to write:**

In `src/main/services/get-position.test.ts` (find existing file or create):

- Test: after rolling a CSP (use the existing `roll-csp-position` service to set up state), call `getPosition`; assert that both the ROLL_FROM and ROLL_TO legs in `result.legs` have a non-null `rollChainId` and that both have the **same** `rollChainId` value.
- Test: a non-roll leg (e.g. `CSP_OPEN`) returned by `getPosition` has `rollChainId: null`.

**Green — implementation:**

In `src/main/schemas.ts`:

- Add `rollChainId: string | null` to the `LegRecord` interface (after `fillDate`).

In `src/main/services/get-position.ts`:

- Add `roll_chain_id: string | null` to the `LegRow` interface.
- In `GET_LEGS_QUERY`, add `roll_chain_id` to the SELECT column list.
- In `mapLegRow`, add `rollChainId: r.roll_chain_id ?? null`.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency with other `LegRecord` usages.

**Acceptance criteria covered:**

- Prerequisite for all renderer ACs (grouping requires `rollChainId` on legs from the IPC layer).

---

### 2. Renderer Type: Add `rollChainId` to `LegDetail` and `LegHistoryEntry`

**Files to create or modify:**

- `src/renderer/src/api/positions.ts` — add `rollChainId: string | null` to `LegDetail`
- `src/renderer/src/components/LegHistoryTable.tsx` — add `rollChainId: string | null` to `LegHistoryEntry`

**Red — tests to write:**

In `src/renderer/src/components/LegHistoryTable.test.tsx`:

- Test: rendering `LegHistoryTable` with a leg that has `rollChainId: null` (a normal leg) does not error — existing tests already cover this indirectly; add a new test that passes `rollChainId: null` explicitly and verifies the leg renders as a normal row (role badge is present, no roll group header rendered).

**Green — implementation:**

In `src/renderer/src/api/positions.ts`:

- Add `rollChainId: string | null` to the `LegDetail` type.

In `src/renderer/src/components/LegHistoryTable.tsx`:

- Add `rollChainId: string | null` to the `LegHistoryEntry` type.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- Prerequisite data flow for all renderer rendering ACs.

---

### 3. Pure Utility: `buildRollTimeline` and `computeCumulativeRollSummary`

**Files to create or modify:**

- `src/renderer/src/lib/rollGroups.ts` — new file with pure grouping functions
- `src/renderer/src/lib/rollGroups.test.ts` — new test file

**Red — tests to write:**

All tests in `src/renderer/src/lib/rollGroups.test.ts`:

- Test: `buildRollTimeline` with legs `[CSP_OPEN]` (no rolls) returns `[{ type: 'leg', leg: CSP_OPEN }]` — a single normal item, no roll group.
- Test: `buildRollTimeline` with legs `[CSP_OPEN, ROLL_FROM(chainId:'abc'), ROLL_TO(chainId:'abc')]` returns `[{ type: 'leg' }, { type: 'roll', rollNumber: 1, rollChainId: 'abc' }, { type: 'cumulative' }]` — 3 items total (one leg, one roll group, one cumulative summary).
- Test: `buildRollTimeline` with two roll pairs (chain-ids 'abc' and 'def', ROLL_FROM fill dates in order) returns roll groups numbered `rollNumber: 1` and `rollNumber: 2` in chronological order.
- Test: `buildRollTimeline` with legs `[CSP_OPEN, ROLL_FROM, ROLL_TO, ASSIGN, CC_OPEN]` (one roll pair, then post-roll normal legs) returns items in order: `[leg(CSP_OPEN), roll#1, cumulative, leg(ASSIGN), leg(CC_OPEN)]`.
- Test: a `RollGroup` item for a roll where ROLL_FROM.premiumPerContract = '1.20' and ROLL_TO.premiumPerContract = '2.80' and contracts = 1 has `net.isCredit: true`, `net.perContract: 1.60`, `net.total: 160`.
- Test: a `RollGroup` item for a roll where ROLL_FROM.premiumPerContract = '3.00' and ROLL_TO.premiumPerContract = '2.50' has `net.isCredit: false`, `net.perContract: 0.50`.
- Test: `buildRollTimeline` derives `rollType: 'Roll Out'` when ROLL_FROM and ROLL_TO have the same strike, different expiration.
- Test: `buildRollTimeline` derives `rollType: 'Roll Down & Out'` when ROLL_TO.strike < ROLL_FROM.strike and expiration also changes.
- Test: `computeCumulativeRollSummary` with two credit roll groups (net 1.60 and 0.80) returns `{ totalCredits: 2.40, totalDebits: 0, net: 2.40, rollCount: 2 }`.
- Test: `computeCumulativeRollSummary` with one credit (1.60) and one debit (-0.50) roll returns `{ totalCredits: 1.60, totalDebits: 0.50, net: 1.10, rollCount: 2 }`.

**Green — implementation:**

In `src/renderer/src/lib/rollGroups.ts`:

```typescript
// Types: LegHistoryEntry (imported from LegHistoryTable or a shared location),
// TimelineItem, RollGroup, NormalLeg, CumulativeItem, CumulativeRollSummary
// as defined in data-model.md

export function buildRollTimeline(legs: LegHistoryEntry[]): TimelineItem[]
export function computeCumulativeRollSummary(rollGroups: RollGroup[]): CumulativeRollSummary
```

`buildRollTimeline`:

1. Partition legs by whether `legRole === 'ROLL_FROM' || legRole === 'ROLL_TO'`.
2. Group roll legs by `rollChainId`. Each group = `{ rollFromLeg, rollToLeg }`.
3. Sort groups by `rollFromLeg.fillDate` ASC; assign `rollNumber` 1, 2, 3...
4. For each group, compute `rollType` / `rollDetail` via `getCcRollTypeLabel` / `getCcRollTypeDetail`, and `net` via `computeNetCreditDebit`.
5. Build chronological `TimelineItem[]` by interleaving normal legs and roll group items, sorted by `fillDate`. Append one `{ type: 'cumulative', summary }` item immediately after the last roll group.

`computeCumulativeRollSummary`:

- Accumulates `totalCredits` and `totalDebits` by summing `net.perContract` from each roll group by `net.isCredit`.

Import from `rolls.ts`: `getCcRollTypeLabel`, `getCcRollTypeDetail`, `computeNetCreditDebit`.

**Refactor — cleanup to consider:**

- Ensure no mutation of the input `legs` array (use `filter`, `reduce`, spread).
- Check naming is consistent with existing `rolls.ts` naming conventions.

**Acceptance criteria covered:**

- AC1 (grouping by `rollChainId`)
- AC2, AC3 (net credit/debit computation, `isCredit` flag)
- AC4 (sequential numbering, cumulative summary data)
- AC5 (roll type label derivation)
- AC6 (non-roll legs as normal items, chronological order)
- AC7 (ROLL_TO carries the running basis, ROLL_FROM basis is empty — enforced by the existing `deriveRunningBasis` logic which assigns basis to each leg including roll legs)

---

### 4. `LegHistoryTable` Render Extension

**Files to create or modify:**

- `src/renderer/src/components/LegHistoryTable.tsx` — replace flat `legs.map(...)` in `<tbody>` with timeline rendering; add new internal render components

**Red — tests to write:**

In `src/renderer/src/components/LegHistoryTable.test.tsx`:

- Test: given one ROLL_FROM leg (chainId 'abc', premiumPerContract '1.20', strike '180', expiration '2026-04-18') and one ROLL_TO leg (chainId 'abc', premiumPerContract '2.80', strike '180', expiration '2026-05-16'), `LegHistoryTable` renders a roll group header containing "Roll #1" and "Roll Out".
- Test: roll group header shows "+$1.60/contract" (green) for a net credit roll (ROLL_FROM cost $1.20, ROLL_TO premium $2.80).
- Test: roll group header shows "−$0.50/contract" in amber for a net debit roll (ROLL_FROM cost $3.00, ROLL_TO premium $2.50).
- Test: three roll pairs produce headers "Roll #1", "Roll #2", "Roll #3" in the rendered table.
- Test: cumulative summary row appears after the roll group(s) and shows "Credits: +$1.60" and "Net: +$1.60" for a single credit roll.
- Test: `[CSP_OPEN, ROLL_FROM, ROLL_TO, ASSIGN]` renders CSP Open as a normal row before the roll group, and Assign as a normal row after the cumulative summary.
- Test: ROLL_FROM leg row inside a group has an empty basis cell (no value shown), and ROLL_TO leg row shows a non-null `runningCostBasis` value.

**Green — implementation:**

In `src/renderer/src/components/LegHistoryTable.tsx`:

1. Import `buildRollTimeline`, `computeCumulativeRollSummary` from `../lib/rollGroups`.
2. Add `rollChainId: string | null` to `LegHistoryEntry`.
3. New internal component `RollGroupHeaderRow({ group: RollGroup })` — renders a `<tr>` with a single `<td colspan={8}>`:
   - Left: bold "Roll #N" in credit/debit color, roll type badge (`<Badge>`), roll detail string (strike/exp changes), fill date in muted text.
   - Right: "+$N.NN/contract" or "−$N.NN/contract" in credit/debit color.
   - Background and top border styled per mockup (green tint for credit, amber tint for debit) using `rollCreditDebitColors` from `rolls.ts`.
4. New internal component `RollLegRow({ leg: LegHistoryEntry })` — renders a `<tr>` with the same columns as a normal leg row but:
   - Blue-tinted `background: rgba(88,166,255,0.02)` on the row.
   - First cell (`<TableCell>`) has additional left padding (`pl-7`) to create visual indentation.
   - Uses existing `PremiumCell` and `BasisCell` components unchanged.
5. New internal component `CumulativeSummaryRow({ summary: CumulativeRollSummary })` — renders a `<tr>` with `<td colspan={8}>`:
   - Label "Roll Summary (N roll/rolls)".
   - Right section: "Credits: +$X.XX", optional "Debits: −$Y.YY", "Net: +/-$Z.ZZ" using green/amber/green or red color.
6. Replace the `<tbody>` `legs.map(...)` with a call to `buildRollTimeline(legs)` producing a `TimelineItem[]`, then map over it:
   - `type: 'leg'` → existing `<tr>` (unchanged)
   - `type: 'roll'` → `<RollGroupHeaderRow>` + `<RollLegRow>` for ROLL_FROM + `<RollLegRow>` for ROLL_TO
   - `type: 'cumulative'` → `<CumulativeSummaryRow>`

The mockup shows:

- `RollGroupHeader`: colored top border (2px solid), subtle bg tint, badge for roll type, fill date in muted text, right-aligned net per contract.
- `LegRow` (roll): `isRoll` flag adds left indent (28px padding), blue-tinted bg.
- `CumulativeSummary`: blue-tinted bg, `border-t` in blue, shows "Roll Summary", credits/debits/net inline.

**Refactor — cleanup to consider:**

- Extract color/style constants for roll group tinting to avoid magic values.
- Confirm that existing `LegHistoryTable` unit tests (non-roll legs) still pass unchanged.

**Acceptance criteria covered:**

- AC1 (visual grouping with connector — group header row visually links the pair)
- AC2 (net credit in green)
- AC3 (net debit in amber)
- AC4 (roll numbering "Roll #1", "Roll #2", "Roll #3"; cumulative summary)
- AC5 (roll type label with strike/exp detail in header)
- AC6 (normal legs render as plain rows between groups)
- AC7 (ROLL_TO running basis visible; ROLL_FROM basis cell empty via existing `deriveRunningBasis` logic — ROLL_FROM has no snapshot so basis is carried from previous leg)

---

### 5. E2E Tests

**Files to create or modify:**

- `e2e/us15-roll-pair-timeline.spec.ts` — new file

**Red — tests to write:**

Each test maps to exactly one AC from the user story. Use the same `launchFreshApp` / `openPosition` / `openDetailFor` / helper patterns from `e2e/csp-roll.spec.ts` and `e2e/leg-chain-display.spec.ts`. Roll setup uses the existing Roll CSP sheet UI (fill cost to close, new premium, new expiration, submit).

- **AC1 — Roll pair is grouped with a visual header in the leg timeline:**
  Given one CSP roll (cost to close $1.20, new premium $2.80, same strike, new expiration), navigate to position detail; assert that the text "Roll #1" appears in the leg timeline, and that "Roll Out" or a roll type label is visible near it.

- **AC2 — Roll pair shows net credit summary in green:**
  Same setup as AC1; assert "1.60/contract" appears in the leg timeline section (the group header net line) and that it does not contain a debit indicator.

- **AC3 — Roll pair with net debit shows amber net debit:**
  Roll with cost to close $3.00, new premium $2.50 (net debit $0.50); assert "0.50/contract" appears in the leg timeline, and verify no green credit is shown for this roll.

- **AC4 — Multiple sequential rolls are numbered in chronological order with cumulative summary:**
  Roll the CSP twice (two sequential rolls); assert "Roll #1" and "Roll #2" both appear in the timeline; assert that a cumulative summary section ("Roll Summary" or "Credits:") is visible.

- **AC5 — Roll type label shows strike and expiration change detail:**
  Roll with a lower strike (e.g. from $180 to $175) and later expiration; assert "Roll Down & Out" appears in the leg timeline header for that roll group.

- **AC6 — Non-roll legs display as normal rows in chronological order between roll pairs:**
  After one CSP roll, proceed to assign the position (HOLDING_SHARES); navigate to position detail; assert that the CSP Open row appears before the roll group section, and the Assign row appears after it — use `locator` ordering to verify DOM position.

- **AC7 — ROLL_TO leg shows updated running cost basis after roll:**
  After one roll (cost $1.20, premium $2.80, 1 contract, strike $180 basis $176.50), navigate to position detail; assert that the ROLL_TO leg's running basis cell shows "$174.90" (176.50 − 1.60).

**Green — implementation:**

Write the E2E spec using Playwright `_electron` with a fresh in-memory DB per test (same pattern as `e2e/csp-roll.spec.ts`). Each `it` block launches and closes its own app instance. Use `afterEach` to close the app and delete the temp DB file.

Helper functions:

- `rollCsp(page, { costToClose, newPremium, newExpiration, newStrike? })` — fills and submits the Roll CSP sheet.
- `getLegTimeline(page)` — returns the timeline container locator.

**Refactor — cleanup to consider:**

- Extract `rollCsp` helper to `e2e/helpers.ts` if it duplicates logic from `csp-roll.spec.ts`.
- Naming consistency with other e2e spec files.

**Acceptance criteria covered:**

- AC1, AC2, AC3, AC4, AC5, AC6, AC7 — each test maps to exactly one AC.
