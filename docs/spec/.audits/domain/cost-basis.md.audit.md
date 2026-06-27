---
page: docs/spec/domain/cost-basis.md
audited_at: 2026-06-27
findings: 5
---

# Audit: docs/spec/domain/cost-basis.md

## Verified (15)

- ✓ Pure engine `src/main/core/costbasis.ts` exists with all documented entry
  points: `calculateInitialCspBasis` (l.37), `calculateCspClose` (l.71),
  `calculateCspExpiration` (l.173), `calculateRollBasis` (l.235),
  `calculateAssignmentBasis` (l.115), `calculateCcOpenBasis` (l.155),
  `calculateCcClose` (l.195), `calculateCallAway` (l.310),
  `computeUnrealizedPnl` (l.285).
- ✓ `calculateRollBasis` takes `legType: 'CSP' | 'CC'` with optional
  `prevStrike`/`newStrike` and CSP-different-strike branch
  `prev + (newStrike − prevStrike) − net` (l.259-262); same-strike + CC branch
  reduce by `net`.
- ✓ CSP-roll guard throws when `prevStrike`/`newStrike` missing for CSP
  (`src/main/core/costbasis.ts:236-241`).
- ✓ `calculateAssignmentBasis` walks `CSP_OPEN + ROLL_NET[]`, subtracting
  `premiumPerContract` from `strike`, returns `premiumWaterfall` with
  `label ?? LEG_ROLE_LABEL[legRole] ?? legRole` (l.115-139).
- ✓ Service-layer roll grouping: `groupRollsByChain` + synthetic
  `legRole: 'ROLL_NET'` in `src/main/services/assign-csp-position.ts:16,84`.
- ✓ `calculateCcClose` returns `ccLegPnl` only and writes no snapshot
  (l.195-199); no insert in CC-close service (claim consistent — no snapshot insert).
- ✓ `calculateCspExpiration` returns `pnlPercentage` literal `'100.0000'`
  (interface l.61-69; implementation l.173-181).
- ✓ `computeUnrealizedPnl({ entryPremium, currentMid, contracts })` returns
  `{ pnl, pnlPercent, maxProfit }` as 4dp strings (l.273-308).
- ✓ Profit-target: `DEFAULT_PROFIT_TARGET_PERCENT = 50` and
  `resolveProfitTarget(override) => override === null ? default : override`
  (`src/main/core/profit-target.ts:4-8`) — strict `=== null` confirmed.
- ✓ `positions.profit_target_percent` nullable INTEGER added by
  `migrations/005_add_profit_target_percent.sql:2`.
- ✓ Renderer helper `deriveRunningBasis` is in
  `src/renderer/src/lib/deriveRunningBasis.ts:48` with the documented generic
  `<T extends { fillDate: string }>` signature.
- ✓ `LEG_ROLE_LABEL` map exists mapping `CSP_OPEN → 'CSP premium'`
  (`src/main/core/costbasis.ts:110-113`).
- ✓ `cost_basis_snapshots` columns sourced from `migrations/001_initial_schema.sql`
  - `trigger_event` from `migrations/004_add_trigger_event_to_snapshots.sql`
    (both files exist).
- ✓ `round4` / `ROUND_HALF_UP` 4dp money convention used throughout the engine.
- ✓ All linked feature pages (us-4..us-33) referenced in "Driven by" exist
  under `docs/spec/features/`.

## Drift (5)

- ✗ Page's `CallAwayResult` interface (function-signatures section, ~l.780-786)
  lists a `sharesHeld: number` field. The actual `CallAwayResult` in
  `src/main/core/costbasis.ts:210-215` has **no** `sharesHeld` field — only
  `finalPnl`, `capitalDeployed`, `cycleDays`, `annualizedReturn`. (The prose at
  l.190-194 also claims call-away "returns `sharesHeld`".) Suggested fix: remove
  `sharesHeld` from the documented `CallAwayResult` (it is computed internally
  but not returned).

- ✗ Page's `CcOpenBasisInput` interface (~l.749-754) lists only
  `prevBasisPerShare, prevTotalPremiumCollected, ccPremiumPerContract, contracts`.
  The actual interface (`src/main/core/costbasis.ts:142-148`) has an additional
  **required** field `positionContracts: number`. The documented CC-open formula
  `basisPerShare = prevBasisPerShare − ccPremiumPerContract` is also stale: the
  implementation prorates the reduction across all held shares
  (`totalCcIncome / totalShares` where `totalShares = positionContracts × 100`,
  l.161-162). Suggested fix: add `positionContracts` and correct the formula.

- ✗ Page's `RollBasisInput` interface (~l.710-719) omits the `positionContracts?`
  field that the actual interface carries (`src/main/core/costbasis.ts:217-228`,
  "Required for CC rolls"). The documented CC-roll formula
  `basisPerShare = prevBasisPerShare − net` (l.409, l.518-520) is stale: the
  implementation prorates `net × shares / (positionContracts × 100)` across all
  held shares (l.253-257) and throws if `positionContracts` is missing for CC
  rolls (l.243-245). Suggested fix: add `positionContracts?` and correct the CC
  branch description.

- ✗ Page claims `sharesFromContracts()` and `calculateCycleDays()` are exported
  shared helpers ("Shared helpers also live in `src/main/core/costbasis.ts`:
  `SHARES_PER_CONTRACT`, `sharesFromContracts()`, and `calculateCycleDays()` —
  reused by call-away and other cost-basis math"). In code all three are
  file-private — `const SHARES_PER_CONTRACT = 100` (l.10, not exported),
  `function sharesFromContracts` (l.27, not exported),
  `function calculateCycleDays` (l.31, not exported). They are reused only within
  `costbasis.ts`, not exported for other modules. Suggested fix: drop the
  "Shared helpers ... reused by call-away and other cost-basis math" framing or
  mark them as module-internal.

- ✗ Page's `AssignmentBasisResult` (function-signatures section ~l.740-745) types
  `premiumWaterfall` as `Array<{ label: string; amount: string }>`. The code uses
  a named `WaterfallEntry` interface (`src/main/core/costbasis.ts:98-101,107`).
  Structurally identical (minor), but the named type is not mentioned. Suggested
  fix: reference `WaterfallEntry` for accuracy.

## Unverifiable (1)

- ? "the latest row wins via `ORDER BY snapshot_at DESC LIMIT 1`" and the
  `now + 1ms` expiration-snapshot timestamp claim — these are service/SQL
  conventions described narratively; the engine functions audited here don't own
  the SQL. Consistent with the documented selector pattern but not mechanically
  re-verified against each service insert site.

## Missing files (0)

(none)
