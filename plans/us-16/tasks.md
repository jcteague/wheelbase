# US-16 — Update cost basis correctly after multiple sequential rolls — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Engine Foundation (no dependencies)

> Areas 1 and 2 both modify `src/main/core/costbasis.ts` and `src/main/core/costbasis.test.ts` — they must run **sequentially** (Area 1 first, then Area 2). Do not start Area 2 until Area 1 Refactor is complete.
>
> **Important:** After Area 1 Green, TypeScript will fail in `roll-csp-position.ts` and `roll-cc-position.ts` because `legType` becomes a required field. Layer 2 (Areas 3 and 4) must be started immediately after Area 1 Green to restore compilation.

### Area 1 — Extend `calculateRollBasis` for CSP different-strike rolls

- [x] **[Red]** Write failing tests — `src/main/core/costbasis.test.ts`
  - Inside the existing `describe('calculateRollBasis', ...)` block, add:
    - `CSP same-strike roll net credit — uses simple formula`: `legType: 'CSP'`, `prevStrike: '50.00'`, `newStrike: '50.00'`, `prevBasis: '48.00'`, `costToClose: '0.80'`, `newPremium: '1.50'`, `contracts: 1` → assert `basisPerShare === '47.3000'`, `totalPremiumCollected === '270.0000'`
    - `CSP roll-down to lower strike — includes strike delta in basis`: `legType: 'CSP'`, `prevStrike: '50.00'`, `newStrike: '47.00'`, `prevBasis: '48.00'`, `costToClose: '1.20'`, `newPremium: '1.50'`, `contracts: 1` → assert `basisPerShare === '44.7000'` (NOT $47.70), `totalPremiumCollected === '230.0000'`
    - `CSP roll-up to higher strike — adds strike delta, subtracts net credit`: `legType: 'CSP'`, `prevStrike: '47.00'`, `newStrike: '50.00'`, `prevBasis: '44.70'`, `costToClose: '1.00'`, `newPremium: '1.80'` → assert `basisPerShare === '46.9000'`
    - `CSP roll net debit — basis increases, totalPremium decreases`: `legType: 'CSP'`, same strike, `costToClose: '1.60'`, `newPremium: '1.40'` from basis $47.30 → assert `basisPerShare === '47.5000'`
    - `CC roll — ignores strike, uses simple formula`: `legType: 'CC'`, `prevStrike: '52.00'`, `newStrike: '55.00'`, `prevBasis: '45.80'`, `costToClose: '2.00'`, `newPremium: '2.80'` → assert `basisPerShare === '45.0000'` (strike delta NOT applied), `totalPremiumCollected` increases by $80
    - `multi-contract CSP roll — per-share basis unchanged, totalPremium scales by 3 contracts`: `legType: 'CSP'`, same strike, 3 contracts → assert `basisPerShare === '47.3000'`, `totalPremiumCollected` increases by $210
    - `three sequential CSP same-strike rolls — cumulative basis is correct`: chain 3 calls (Roll1 credit $0.70, Roll2 credit $0.80, Roll3 debit $0.20) → assert final `basisPerShare === '46.7000'`, `totalPremiumCollected === '330.0000'`
  - Run `pnpm test src/main/core/costbasis.test.ts` — all new tests must fail (existing pass)

- [x] **[Green]** Implement — `src/main/core/costbasis.ts` _(depends on: Area 1 Red ✓)_
  - Extend `RollBasisInput` interface: add `legType: 'CSP' | 'CC'`, `prevStrike?: string`, `newStrike?: string`
  - Update `calculateRollBasis`:
    - `netCredit = newPremiumPerContract − costToClosePerContract` (unchanged)
    - If `legType === 'CC'` OR (`legType === 'CSP'` AND `newStrike === prevStrike`): `basisPerShare = prevBasis − netCredit`
    - If `legType === 'CSP'` AND `newStrike !== prevStrike`: `basisPerShare = prevBasis + (newStrike − prevStrike) − netCredit`
    - `totalPremiumCollected = prevTotal + netCredit × contracts × 100` (unchanged)
  - Run `pnpm test src/main/core/costbasis.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/core/costbasis.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: extract `computeNetCredit` helper; add runtime guard if `legType === 'CSP'` but `prevStrike`/`newStrike` are missing
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 2 — Extend `calculateAssignmentBasis` for roll-net waterfall labels

**Requires:** Area 1 Refactor ✓ (same files — must be fully done before starting Area 2)

- [x] **[Red]** Write failing tests — `src/main/core/costbasis.test.ts` _(depends on: Area 1 Refactor ✓)_
  - Inside the existing `describe('calculateAssignmentBasis', ...)` block, add:
    - `label override used in waterfall when provided`: `premiumLegs: [CSP_OPEN $2.00, { legRole: 'ROLL_NET', premiumPerContract: '0.70', contracts: 1, label: 'Roll #1 credit' }]`, `strike: '50.00'` → assert `premiumWaterfall[1] === { label: 'Roll #1 credit', amount: '0.70' }`
    - `basisPerShare uses net roll credit correctly`: same input → assert `basisPerShare === '47.3000'` (50 − 2.00 − 0.70), NOT $46.50
    - `totalPremiumCollected sums all premiumPerContract values`: same input → assert `totalPremiumCollected === '270.0000'`
    - `negative premiumPerContract (net debit roll) correctly increases basis`: `ROLL_NET` with `premiumPerContract: '-0.50'`, `label: 'Roll #1 debit'`, `strike: '50.00'` → assert `basisPerShare === '48.5000'`, `totalPremiumCollected === '150.0000'`
    - `ROLL_NET without label falls back to legRole string in waterfall`: no `label` field → assert waterfall entry has `label: 'ROLL_NET'`
  - Run `pnpm test src/main/core/costbasis.test.ts` — all new tests must fail (existing pass)

- [x] **[Green]** Implement — `src/main/core/costbasis.ts` _(depends on: Area 2 Red ✓)_
  - Add `label?: string` to `AssignmentBasisLeg` interface
  - In `calculateAssignmentBasis`, update waterfall map: `leg.label ?? LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole`
  - No changes to `totalPremiumPerShare` or `totalPremiumCollected` numeric calculations
  - Run `pnpm test src/main/core/costbasis.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/core/costbasis.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify `LEG_ROLE_LABEL` still makes sense; `ROLL_TO: 'Roll credit'` remains valid for existing callers
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Service Callers (parallel, depends on Area 1 Green ✓)

> These two areas can run **in parallel** — they modify different files. Both must be started immediately after Area 1 Green to fix the TypeScript errors introduced when `legType` became a required field in `RollBasisInput`.

### Area 3 — Update `rollCspPosition` to pass strike info

**Requires:** Area 1 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/roll-csp-position.test.ts` _(depends on: Area 1 Green ✓)_
  - Add to the existing `describe('rollCspPosition', ...)` block:
    - `roll-down to lower strike — basisPerShare reflects strike delta + net credit`: CSP at $180 / $3.50, roll to $175 (close $1.20, new premium $1.50, net credit $0.30). Expected basis: $176.50 + ($175−$180) − $0.30 = **$171.20**. Assert `result.costBasisSnapshot.basisPerShare === '171.2000'`
    - `roll-up to higher strike — basisPerShare reflects positive strike delta`: Starting basis from a prior position, roll from current strike to higher strike; assert basis = prevBasis + (newStrike − prevStrike) − netCredit
    - `same-strike roll — existing simple-formula behaviour preserved`: existing happy-path test values still hold after `legType` is added
  - Run `pnpm test src/main/services/roll-csp-position.test.ts` — new tests must fail

- [x] **[Green]** Implement — `src/main/services/roll-csp-position.ts` _(depends on: Area 3 Red ✓)_
  - Update `calculateRollBasis` call to add: `legType: 'CSP'`, `prevStrike: activeLeg.strike`, `newStrike: newStrikeFormatted`
  - (`newStrikeFormatted` is already computed as `payload.newStrike ?? activeLeg.strike`)
  - Run `pnpm test src/main/services/roll-csp-position.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/services/roll-csp-position.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 4 — Update `rollCcPosition` to pass `legType: 'CC'`

**Requires:** Area 1 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/roll-cc-position.test.ts` _(depends on: Area 1 Green ✓)_
  - Add to the existing `describe('rollCcPosition', ...)` block:
    - `CC roll up to higher strike — basis decreases only by net credit, strike delta ignored`: CSP open → assign → CC open at $185, roll up to $190 (close $2.00, new premium $2.80, net credit $0.80). Assert `result.costBasisSnapshot.basisPerShare` = prevBasis − $0.80 (NO strike-delta adjustment)
    - `CC roll down to lower strike — strike change still does not affect basis`: Roll CC from $185 to $180, net credit $0.50. Assert basis decreases by exactly $0.50
  - Run `pnpm test src/main/services/roll-cc-position.test.ts` — new tests must fail

- [x] **[Green]** Implement — `src/main/services/roll-cc-position.ts` _(depends on: Area 4 Red ✓)_
  - Update `calculateRollBasis` call to add: `legType: 'CC'` (omit `prevStrike`/`newStrike` — intentionally not passed for CC)
  - Run `pnpm test src/main/services/roll-cc-position.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/services/roll-cc-position.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Assignment Service Fix (depends on Layer 1 and Layer 2)

**Requires:** Area 2 Green ✓ (for `AssignmentBasisLeg.label`), Area 3 Green ✓ (for `rollCspPosition` to compile in test setup)

### Area 5 — Fix `assignCspPosition` to compute net roll credits per roll chain

- [x] **[Red]** Write failing tests — `src/main/services/assign-csp-position.test.ts` _(depends on: Area 2 Green ✓, Area 3 Green ✓)_
  - Add a new `describe` block for rolled-position assignment:
    - `assignment after one same-strike CSP roll — basis uses net credit not gross ROLL_TO premium`: CSP $50/$2.00, roll (close $0.80, new $1.50, net $0.70), assign → assert `basisPerShare === '47.3000'` (current buggy value is $46.50)
    - `assignment after one CSP roll — waterfall shows Roll #1 credit label`: same setup → assert `premiumWaterfall` contains `{ label: 'Roll #1 credit', amount: '0.70' }`
    - `assignment after two CSP rolls — basis reflects cumulative net credits`: CSP $50/$2.00, Roll1 net $0.70, Roll2 net $0.80, assign → assert `basisPerShare === '46.5000'`
    - `assignment after CSP roll with net debit — waterfall shows Roll #1 debit and basis increases`: roll (close $2.50, new $2.00, net debit $0.50) → assert waterfall entry `{ label: 'Roll #1 debit', amount: '-0.50' }`, `basisPerShare === '48.5000'`
    - `assignment after CSP roll-down to different strike — uses ROLL_TO strike $47 not original $50`: CSP $50, roll to $47, assign → assert `basisPerShare === '44.7000'`
  - Run `pnpm test src/main/services/assign-csp-position.test.ts` — new tests must fail

- [x] **[Green]** Implement — `src/main/services/assign-csp-position.ts` _(depends on: Area 5 Red ✓)_
  - Add private `groupRollsByChain(legs)` pure helper: filters to ROLL_TO/ROLL_FROM, groups by `roll_chain_id`, sorts each group by `fill_date ASC`, computes `netCredit = ROLL_TO.premiumPerContract − ROLL_FROM.premiumPerContract`
  - Replace the existing `premiumLegs` filter (which picked `CSP_OPEN | ROLL_TO`) with:
    1. One entry for `CSP_OPEN` leg
    2. One `ROLL_NET` entry per roll chain with `premiumPerContract: netCredit` and `label: 'Roll #N credit|debit'`
  - Run `pnpm test src/main/services/assign-csp-position.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/services/assign-csp-position.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify existing tests (no-roll assignment) still pass; check `groupRollsByChain` for clarity and edge cases
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Lifecycle Integration Tests (depends on Layer 3)

**Requires:** Areas 3, 4, 5 Green ✓

### Area 6 — Full lifecycle snapshot chain integration tests

- [x] **[Red]** Write failing tests — `src/main/services/cost-basis-chain.test.ts` (new file) _(depends on: Areas 3, 4, 5 Green ✓)_
  - Create new file with a `describe('cost basis snapshot chain', ...)` block:
    - `full lifecycle produces 6 snapshots in chronological order`: sequence createPosition → rollCspPosition (same-strike) → rollCspPosition (roll-down) → assignCspPosition → openCoveredCallPosition → rollCcPosition. After each step, query `SELECT COUNT(*) FROM cost_basis_snapshots WHERE position_id = ?`; assert count equals step number 1–6. After all 6, assert all rows have non-null `basis_per_share` and `total_premium_collected`, ordered by `snapshot_at ASC`
    - `snapshot chain basis values match expected progression`: same lifecycle; read all 6 snapshots and assert each `basis_per_share` matches the Key Numbers table in `plans/us-16/quickstart.md`
  - Run `pnpm test src/main/services/cost-basis-chain.test.ts` — tests must fail or (if no production changes needed) already pass — verify correct basis values at each step
  - **Note:** No production code changes — this area is test-only. The Red step verifies the full chain is correct end-to-end.

- [x] **[Green]** Verify tests pass _(depends on: Area 6 Red ✓)_
  - No production code to write — if tests fail, the failure indicates a regression in a previous area's implementation
  - Run `pnpm test src/main/services/cost-basis-chain.test.ts` — all tests must pass

- [ ] **[Refactor]** `/refactor` — `src/main/services/cost-basis-chain.test.ts` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Deduplicate setup helpers with those in `assign-csp-position.test.ts` and `roll-cc-position.test.ts`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — E2E Tests (depends on all Green tasks ✓)

**Requires:** All Green tasks from Layers 1–4 ✓

### Area 7 — E2E tests for all 9 ACs

- [ ] **[Red]** Write failing e2e tests — `e2e/cost-basis-sequential-rolls.spec.ts` (new file) _(depends on: all Green tasks ✓)_
  - Follow the pattern from `e2e/csp-roll.spec.ts`: `launchFreshApp()`, `openPosition()`, `openDetailFor()` helpers; one `it()` per AC:
    - AC1: `cost basis after single CSP roll with net credit — basis shows $47.30, total premium $270`
    - AC2: `cost basis after single CSP roll with net debit — basis shows $48.50, total premium $150`
    - AC3: `cost basis after three sequential CSP rolls — final basis $46.70, total premium $330`
    - AC4: `cost basis after CSP rolls followed by assignment — assignment basis $47.30`
    - AC5: `cost basis after CC roll with net credit — basis shows $45.00`
    - AC6: `cost basis snapshot chain is complete and auditable — 6 snapshots`
    - AC7: `multi-contract roll applies net credit/debit per contract correctly — same per-share basis regardless of contract count`
    - AC8: `cost basis after CSP roll down to lower strike — basis is $44.70, NOT $47.70`
    - AC9: `cost basis after CC roll up to higher strike — strike change does not affect basis`
  - Run `pnpm test:e2e` (from a GUI terminal — not Claude Code's shell) — all new tests must fail

- [ ] **[Green]** Make e2e tests pass _(depends on: Area 7 Red ✓)_
  - If any E2E test fails due to missing UI display, check whether US-15 renders the required basis/premium fields; update assertions to match the available display
  - Run `pnpm test:e2e` — all 9 AC tests must pass

- [ ] **[Refactor]** `/refactor` — `e2e/cost-basis-sequential-rolls.spec.ts` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract `doRollCsp(page, opts)` E2E helper if roll-sheet interaction is repeated in 3+ tests
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for the right reason)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] E2E tests cover every AC (9 scenarios)
- [ ] `pnpm test && pnpm lint && pnpm typecheck` — all clean
