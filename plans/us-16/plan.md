# Implementation Plan: US-16 — Update cost basis correctly after multiple sequential rolls

## Summary

This story fixes two bugs in the cost basis engine and one bug in the assignment service: (1) `calculateRollBasis` ignores the strike-delta formula for CSP rolls that change the strike, producing a materially wrong basis; (2) `calculateAssignmentBasis` includes gross ROLL_TO premium without deducting the ROLL_FROM cost to close, understating the assignment basis. Both fixes are pure engine/service changes — no IPC, schema, or frontend changes are required. Done state: all 9 acceptance-criteria scenarios pass as unit tests, service integration tests, and E2E tests.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/03-stories/US-16-cost-basis-after-sequential-rolls.md`
- **Research & Design Decisions:** `plans/us-16/research.md`
- **Data Model & Selection Logic:** `plans/us-16/data-model.md`
- **Quickstart & Verification:** `plans/us-16/quickstart.md`

## Prerequisites

- US-12: `rollCspPosition` service exists — creates ROLL_FROM/ROLL_TO leg pairs and cost basis snapshots (✅)
- US-14: `rollCcPosition` service exists — same pattern for covered calls (✅)
- `calculateRollBasis` function exists in `src/main/core/costbasis.ts` but handles only the simple formula (✅ partial — needs extension)
- `calculateAssignmentBasis` function exists but ignores ROLL_FROM costs (✅ partial — needs fix)
- `cost_basis_snapshots` table exists and is populated by roll services (✅)

---

## Implementation Areas

### 1. Extend `calculateRollBasis` for CSP different-strike rolls

**Files to create or modify:**

- `src/main/core/costbasis.ts` — extend `RollBasisInput` and update `calculateRollBasis`
- `src/main/core/costbasis.test.ts` — add tests for all new roll formula branches

**Red — tests to write:**

In `src/main/core/costbasis.test.ts`, within the existing `describe('calculateRollBasis', ...)` block:

- Test: `CSP same-strike roll net credit — uses simple formula (prevBasis − netCredit)`. Input: `legType: 'CSP'`, `prevStrike: '50.00'`, `newStrike: '50.00'`, `prevBasis: '48.00'`, `costToClose: '0.80'`, `newPremium: '1.50'`, `contracts: 1`. Assert `basisPerShare === '47.3000'`, `totalPremiumCollected === '270.0000'`.
- Test: `CSP roll-down to lower strike — includes strike delta in basis`. Input: `legType: 'CSP'`, `prevStrike: '50.00'`, `newStrike: '47.00'`, `prevBasis: '48.00'`, `costToClose: '1.20'`, `newPremium: '1.50'` (net credit $0.30), `contracts: 1`. Assert `basisPerShare === '44.7000'` (NOT $47.70), `totalPremiumCollected === '230.0000'`.
- Test: `CSP roll-up to higher strike — adds strike delta, subtracts net credit`. Input: `legType: 'CSP'`, `prevStrike: '47.00'`, `newStrike: '50.00'`, `prevBasis: '44.70'`, `costToClose: '1.00'`, `newPremium: '1.80'` (net credit $0.80), `contracts: 1`. Assert `basisPerShare === '46.9000'` (44.70 + 3 − 0.80).
- Test: `CSP roll net debit — basis increases, totalPremium decreases`. Input: `legType: 'CSP'`, `prevStrike: '50.00'`, `newStrike: '50.00'`, `prevBasis: '47.30'`, `costToClose: '1.60'`, `newPremium: '1.40'` (net debit $0.20), `contracts: 1`. Assert `basisPerShare === '47.5000'`, `totalPremiumCollected decreases by $20`.
- Test: `CC roll — ignores strike, uses simple formula`. Input: `legType: 'CC'`, `prevStrike: '52.00'`, `newStrike: '55.00'`, `prevBasis: '45.80'`, `costToClose: '2.00'`, `newPremium: '2.80'` (net credit $0.80), `contracts: 1`. Assert `basisPerShare === '45.0000'` (strike change does NOT affect CC basis), `totalPremiumCollected increases by $80`.
- Test: `multi-contract CSP roll — basisPerShare unchanged per share, totalPremium scales by 3 contracts`. Input: `legType: 'CSP'`, `prevStrike: '50.00'`, `newStrike: '50.00'`, `prevBasis: '48.00'`, `costToClose: '0.80'`, `newPremium: '1.50'`, `contracts: 3`. Assert `basisPerShare === '47.3000'` (same per-share), `totalPremiumCollected === '410.0000'` ($200 initial implied + $70 × 3 contracts; verify as: prevTotal + 0.70 × 300 = prevTotal + 210).
- Test: `three sequential CSP same-strike rolls — cumulative basis is correct`. Chain three `calculateRollBasis` calls feeding output as next input. Roll1: credit $0.70 → basis $47.30. Roll2: credit $0.80 → basis $46.50. Roll3: debit $0.20 → basis $46.70. Assert final `basisPerShare === '46.7000'`, `totalPremiumCollected === '330.0000'`.

**Green — implementation:**

In `src/main/core/costbasis.ts`:

1. Extend `RollBasisInput` interface to add `legType: 'CSP' | 'CC'`, `prevStrike?: string`, `newStrike?: string` (see `plans/us-16/data-model.md` for full interface).

2. Update `calculateRollBasis` to:
   - Compute `netCredit = newPremiumPerContract − costToClosePerContract` (unchanged).
   - For `legType === 'CC'` or `legType === 'CSP'` with matching strikes: `basisPerShare = prevBasis − netCredit` (existing formula).
   - For `legType === 'CSP'` with differing strikes: `basisPerShare = prevBasis + (newStrike − prevStrike) − netCredit`.
   - `totalPremiumCollected = prevTotal + netCredit × contracts × 100` (unchanged).

**Refactor — cleanup to consider:**

- Extract a `computeNetCredit(newPremium, costToClose)` helper if the formula appears more than twice.
- Verify the `prevStrike`/`newStrike` optionality is correctly typed (TypeScript will not enforce they are provided when `legType === 'CSP'`; add a runtime assertion or guard and throw if missing for CSP).

**Acceptance criteria covered:**

- Scenario: Cost basis after single CSP roll with net credit
- Scenario: Cost basis after single CSP roll with net debit
- Scenario: Cost basis after three sequential CSP rolls
- Scenario: Multi-contract roll applies net credit/debit per contract correctly
- Scenario: Cost basis after CSP roll down to lower strike
- Scenario: Cost basis after CC roll with net credit
- Scenario: Cost basis after CC roll up to higher strike

---

### 2. Extend `calculateAssignmentBasis` to support roll-net waterfall labels

**Files to create or modify:**

- `src/main/core/costbasis.ts` — add `label?: string` to `AssignmentBasisLeg`, update waterfall generation
- `src/main/core/costbasis.test.ts` — add tests for label override and ROLL_NET entries

**Red — tests to write:**

In `src/main/core/costbasis.test.ts`, within the existing `describe('calculateAssignmentBasis', ...)` block:

- Test: `label override used in waterfall when provided`. Input: `premiumLegs: [{ legRole: 'CSP_OPEN', premiumPerContract: '2.00', contracts: 1 }, { legRole: 'ROLL_NET', premiumPerContract: '0.70', contracts: 1, label: 'Roll #1 credit' }]`, `strike: '50.00'`. Assert `premiumWaterfall[1] === { label: 'Roll #1 credit', amount: '0.70' }`.
- Test: `basisPerShare uses net roll credit correctly`. Same input as above. Assert `basisPerShare === '47.3000'` (50 − 2.00 − 0.70 = 47.30), NOT 46.50.
- Test: `totalPremiumCollected sums all premiumPerContract values across legs`. Assert `totalPremiumCollected === '270.0000'` (200 + 70).
- Test: `negative premiumPerContract (net debit roll) correctly increases basis`. Input: `premiumLegs: [{ legRole: 'CSP_OPEN', premiumPerContract: '2.00', contracts: 1 }, { legRole: 'ROLL_NET', premiumPerContract: '-0.50', contracts: 1, label: 'Roll #1 debit' }]`, `strike: '50.00'`. Assert `basisPerShare === '48.5000'` (50 − 2.00 − (−0.50) = 48.50), `totalPremiumCollected === '150.0000'`.
- Test: `ROLL_NET legRole without label falls back to legRole string in waterfall`. Input: `{ legRole: 'ROLL_NET', premiumPerContract: '0.70', contracts: 1 }` (no label). Assert `premiumWaterfall` entry has `label: 'ROLL_NET'` (the raw fallback).

**Green — implementation:**

In `src/main/core/costbasis.ts`:

1. Add `label?: string` to `AssignmentBasisLeg` interface.
2. In `calculateAssignmentBasis`, update the `premiumWaterfall` map to use: `leg.label ?? LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole`.
3. No changes to `totalPremiumPerShare` or `totalPremiumCollected` calculations — they already sum all supplied `premiumPerContract` values; the fix is that the _service layer_ now passes correctly netted values.

**Refactor — cleanup to consider:**

- Verify the `LEG_ROLE_LABEL` map still makes sense — `ROLL_TO: 'Roll credit'` is still valid for callers that pass raw ROLL_TO legs; `assignCspPosition` will now pass `ROLL_NET` instead.
- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- Scenario: Cost basis after CSP rolls followed by assignment (waterfall shows "CSP Open: $2.00, Roll #1 credit: $0.70")

---

### 3. Update `rollCspPosition` to pass strike info to `calculateRollBasis`

**Files to create or modify:**

- `src/main/services/roll-csp-position.ts` — pass `legType`, `prevStrike`, `newStrike` to `calculateRollBasis`
- `src/main/services/roll-csp-position.test.ts` — add tests for strike-changing rolls and verify basis uses strike delta

**Red — tests to write:**

In `src/main/services/roll-csp-position.test.ts`:

- Test: `roll-down to lower strike — basisPerShare reflects strike delta + net credit`. CSP at $180, roll down to $175 (cost-to-close $1.20, new premium $1.50, net credit $0.30). Initial basis: $180 − $3.50 = $176.50. Expected after roll: $176.50 + ($175 − $180) − $0.30 = $171.20. Assert `result.costBasisSnapshot.basisPerShare === '171.2000'`.
- Test: `roll-up to higher strike — basisPerShare reflects strike delta`. CSP at $175, roll up to $180 (cost-to-close $2.00, new premium $2.50, net credit $0.50). Assert basis increases by `(180 − 175) − 0.50 = 4.50` from previous.
- Test: `same-strike roll — basisPerShare unchanged from previous simple-formula test` (confirms existing behaviour still works after the interface change; re-assert the happy-path values with explicit `legType`).

**Green — implementation:**

In `src/main/services/roll-csp-position.ts`, update the `calculateRollBasis` call:

```typescript
const basisResult = calculateRollBasis({
  prevBasisPerShare: prevSnapshot?.basisPerShare ?? '0.0000',
  prevTotalPremiumCollected: prevSnapshot?.totalPremiumCollected ?? '0.0000',
  costToClosePerContract: costToCloseFormatted,
  newPremiumPerContract: newPremiumFormatted,
  contracts: activeLeg.contracts,
  legType: 'CSP',
  prevStrike: activeLeg.strike,
  newStrike: newStrikeFormatted
})
```

(`newStrikeFormatted` is already computed on line 34 of the current file as `payload.newStrike ?? activeLeg.strike`.)

**Refactor — cleanup to consider:**

- Confirm `activeLeg.strike` is the correct previous-strike value (it is — `getPosition` returns the active ROLL_TO leg whose strike is the current obligation).
- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- Scenario: Cost basis after CSP roll down to lower strike
- Scenario: Cost basis after three sequential CSP rolls (service-layer chain)

---

### 4. Update `rollCcPosition` to pass `legType: 'CC'`

**Files to create or modify:**

- `src/main/services/roll-cc-position.ts` — add `legType: 'CC'` to `calculateRollBasis` call
- `src/main/services/roll-cc-position.test.ts` — add a test confirming CC strike direction has no effect on basis

**Red — tests to write:**

In `src/main/services/roll-cc-position.test.ts`:

- Test: `CC roll up to higher strike — basisPerShare decreases only by net credit, ignoring strike change`. Setup: CSP open → assignment → CC open at $185, then roll up to $190 (cost-to-close $2.00, new premium $2.80, net credit $0.80). Assert `result.costBasisSnapshot.basisPerShare` equals previous basis minus $0.80, not minus $0.80 plus any strike adjustment.
- Test: `CC roll down — strike change still does not affect basis`. Roll CC from $185 to $180, net credit $0.50. Assert basis decreases by exactly $0.50.

**Green — implementation:**

In `src/main/services/roll-cc-position.ts`, update the `calculateRollBasis` call:

```typescript
const basisResult = calculateRollBasis({
  prevBasisPerShare: prevSnapshot?.basisPerShare ?? '0.0000',
  prevTotalPremiumCollected: prevSnapshot?.totalPremiumCollected ?? '0.0000',
  costToClosePerContract: costToCloseFormatted,
  newPremiumPerContract: newPremiumFormatted,
  contracts: activeLeg.contracts,
  legType: 'CC'
  // prevStrike and newStrike omitted intentionally for CC rolls
})
```

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- Scenario: Cost basis after CC roll with net credit
- Scenario: Cost basis after CC roll up to higher strike

---

### 5. Fix `assignCspPosition` to compute net roll credits per roll chain

**Files to create or modify:**

- `src/main/services/assign-csp-position.ts` — group roll legs by roll_chain_id, pass ROLL_NET entries to `calculateAssignmentBasis`
- `src/main/services/assign-csp-position.test.ts` — add tests for assignment after 1 and 2 CSP rolls

**Red — tests to write:**

In `src/main/services/assign-csp-position.test.ts`:

- Test: `assignment after one same-strike CSP roll — basis uses net credit not gross ROLL_TO premium`. Setup: CSP at $50 / $2.00 / 1 contract, then roll (cost-to-close $0.80, new premium $1.50, net credit $0.70). Then assign. Assert `result.costBasisSnapshot.basisPerShare === '47.3000'` (NOT $46.50 which is the current buggy value).
- Test: `assignment after one CSP roll — waterfall shows 'Roll #1 credit: $0.70'`. Same setup. Assert `result.premiumWaterfall` contains `{ label: 'Roll #1 credit', amount: '0.70' }`.
- Test: `assignment after two CSP rolls — basis reflects cumulative net credits`. Setup: CSP at $50 / $2.00, Roll1 net credit $0.70 (basis $47.30), Roll2 net credit $0.80 (basis $46.50). Then assign. Assert `result.costBasisSnapshot.basisPerShare === '46.5000'`.
- Test: `assignment after CSP roll with net debit — waterfall shows 'Roll #1 debit: $0.50'`. CSP at $50 / $2.00, roll (cost-to-close $2.50, new premium $2.00, net debit $0.50). Assign. Assert waterfall entry `{ label: 'Roll #1 debit', amount: '-0.50' }` and `basisPerShare === '48.5000'`.
- Test: `assignment after CSP roll-down to different strike — basis uses ROLL_TO strike, not original`. CSP at $50, rolled down to $47 with net credit $0.30. Assign. Assert `basisPerShare === '44.7000'` (note: `activeLeg.strike = '47.0000'` is the key — the service already uses `openLeg.strike` for the assignment strike, which will be $47 after the roll-down).

**Green — implementation:**

In `src/main/services/assign-csp-position.ts`, replace the `premiumLegs` filter with roll-net grouping:

```typescript
// Compute CSP_OPEN entry
const cspOpenLeg = positionDetail.legs.find((l) => l.legRole === 'CSP_OPEN')

// Group ROLL_TO and ROLL_FROM pairs by roll_chain_id (sorted by fill_date ASC)
const rollChains = groupRollsByChain(positionDetail.legs) // pure helper, see below

const premiumLegs = [
  ...(cspOpenLeg
    ? [
        {
          legRole: 'CSP_OPEN',
          premiumPerContract: cspOpenLeg.premiumPerContract,
          contracts: cspOpenLeg.contracts
        }
      ]
    : []),
  ...rollChains.map(({ netCredit, contracts }, idx) => ({
    legRole: 'ROLL_NET',
    premiumPerContract: netCredit, // string, may be negative for debit
    contracts,
    label: `Roll #${idx + 1} ${parseFloat(netCredit) >= 0 ? 'credit' : 'debit'}`
  }))
]
```

The `groupRollsByChain` helper (defined in the same file or a co-located helper):

- Filters legs to `ROLL_TO` and `ROLL_FROM`
- Groups by `roll_chain_id`
- For each group: `netCredit = new Decimal(ROLL_TO.premiumPerContract).minus(ROLL_FROM.premiumPerContract).toFixed(4)`
- Orders groups by the earliest `fill_date` in each chain (ascending)

**Refactor — cleanup to consider:**

- `groupRollsByChain` is a pure function — consider co-locating it in `src/main/services/assign-csp-position.ts` (private, unexported) unless multiple services need it.
- Verify the existing tests still pass (no regressions on positions that were never rolled).

**Acceptance criteria covered:**

- Scenario: Cost basis after CSP rolls followed by assignment
- Scenario: Cost basis snapshot chain is complete and auditable (partial — assignment creates the 4th snapshot)

---

### 6. Full lifecycle integration tests — snapshot chain completeness

**Files to create or modify:**

- `src/main/services/assign-csp-position.test.ts` or a new `src/main/services/cost-basis-chain.test.ts` — a single integration test that walks all 6 lifecycle events and counts snapshots

**Red — tests to write:**

In a new `describe('cost basis snapshot chain', ...)` block (in `assign-csp-position.test.ts` or a new file):

- Test: `full lifecycle produces 6 snapshots in chronological order`. Sequence: createPosition (snapshot 1), rollCspPosition same-strike (snapshot 2), rollCspPosition roll-down (snapshot 3), assignCspPosition (snapshot 4), openCoveredCallPosition (snapshot 5), rollCcPosition (snapshot 6). After each step, query DB directly: `SELECT COUNT(*) FROM cost_basis_snapshots WHERE position_id = ?`. Assert count equals the step number. After all 6, assert snapshots are ordered by `snapshot_at ASC` and each has non-null `basis_per_share` and `total_premium_collected`.
- Test: `snapshot chain basis values match expected progression`. Same lifecycle. Read all 6 snapshots and assert each `basis_per_share` matches the expected value from `plans/us-16/quickstart.md` Key Numbers table.

**Green — implementation:**

No new production code — this test validates the existing snapshot writes across all services. The queries use `db.prepare(...).all(positionId)` directly.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency across test helpers (`makeOpenPosition`, `makeOpenCcPosition`, etc.).

**Acceptance criteria covered:**

- Scenario: Cost basis snapshot chain is complete and auditable (6 snapshots, each with basis_per_share and total_premium_collected, in chronological order)

---

### 7. E2E Tests

**Files to create or modify:**

- `e2e/cost-basis-sequential-rolls.spec.ts` — new E2E spec, one test per AC

**Red — tests to write:**

Each test launches a fresh Electron app with an isolated DB (same pattern as `e2e/csp-roll.spec.ts`). Tests drive the UI to create positions and trigger rolls/assignments through the interface, then check displayed values.

- Test (AC1): `cost basis after single CSP roll with net credit — basis shows $47.30, total premium $270`. Open CSP $50 / $2.00 / 1 contract. Roll (cost-to-close $0.80, new premium $1.50). Navigate to position detail. Assert cost basis display shows $47.30 and total premium $270.00.
- Test (AC2): `cost basis after single CSP roll with net debit — basis shows $48.50, total premium $150`. Open CSP $50 / $2.00. Roll (cost-to-close $2.50, new premium $2.00). Assert basis $48.50, premium $150.00.
- Test (AC3): `cost basis after three sequential CSP rolls — final basis $46.70, total premium $330`. Open $50 / $2.00. Roll1 credit $0.70 → $47.30. Roll2 credit $0.80 → $46.50. Roll3 debit $0.20 → $46.70. Assert final values.
- Test (AC4): `cost basis after CSP rolls followed by assignment — assignment basis $47.30`. Open $50 / $2.00. Roll (net credit $0.70). Assign. Assert assignment basis shown is $47.30.
- Test (AC5): `cost basis after CC roll with net credit — basis shows $45.00`. Open CSP $47.30 basis, open CC $52 / $1.50. Roll CC (cost-to-close $2.00, new premium $2.80). Assert basis $45.00.
- Test (AC6): `cost basis snapshot chain is complete and auditable — 6 snapshots`. Full lifecycle: CSP open, 2 CSP rolls, assignment, CC open, CC roll. Assert the snapshot chain panel (if rendered by US-15 display; otherwise assert snapshot count via Electron main process eval or IPC call).
- Test (AC7): `multi-contract roll applies net credit/debit per contract correctly — same per-share basis regardless of contract count`. Open CSP $50 / $2.00 / **3 contracts**. Roll (cost-to-close $0.80, new premium $1.50 per contract). Assert `basisPerShare === $47.30` (unchanged by contract count), `totalPremiumCollected increased by $70 × 3 contracts = $210`.
- Test (AC8): `cost basis after CSP roll down to lower strike — basis is $44.70, NOT $47.70`. Open CSP $50 / $2.00. Roll down to $47 (cost-to-close $1.20, new premium $1.50, net credit $0.30). Assert basis $44.70. Assert NOT $47.70.
- Test (AC9): `cost basis after CC roll up to higher strike — strike change does not affect basis`. After assignment basis $47.30, open CC $52 / $1.50. Roll up to $55 (cost-to-close $2.00, new premium $2.80, net credit $0.80). Assert basis $45.00 (not affected by the $3 strike increase).

**Green — implementation:**

Create `e2e/cost-basis-sequential-rolls.spec.ts` using the `launchFreshApp`, `openPosition`, `openDetailFor` helpers from `e2e/helpers.ts`. Each test follows the pattern from `e2e/csp-roll.spec.ts`: launch → navigate → interact → assert displayed values.

**Refactor — cleanup to consider:**

- Extract a `doRollCsp(page, { costToClose, newPremium, newExpiration, newStrike? })` E2E helper if the roll-sheet interaction is repeated across more than 2 tests.
- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- AC1: Cost basis after single CSP roll with net credit
- AC2: Cost basis after single CSP roll with net debit
- AC3: Cost basis after three sequential CSP rolls
- AC4: Cost basis after CSP rolls followed by assignment
- AC5: Cost basis after CC roll with net credit
- AC6: Cost basis snapshot chain is complete and auditable
- AC7: Multi-contract roll applies net credit/debit per contract correctly
- AC8: Cost basis after CSP roll down to lower strike
- AC9: Cost basis after CC roll up to higher strike
