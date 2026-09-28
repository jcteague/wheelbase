---
page: docs/spec/domain/cost-basis.md
audited_at: 2026-09-28
findings: 9
---

# Audit: docs/spec/domain/cost-basis.md

## Verified (30)

- ✓ `Decimal.set({ rounding: Decimal.ROUND_HALF_UP })` and module-private `round4` → `toDecimalPlaces(4)` (`src/main/core/costbasis.ts:8,23-25`)
- ✓ `costbasis.ts` imports only `decimal.js`; no DB/broker imports (`costbasis.ts:6`)
- ✓ `calculateInitialCspBasis(leg: CspLegInput): CostBasisResult` (`costbasis.ts:37`)
- ✓ `CspCloseInput`/`CspCloseResult` and `calculateCspClose` shape; `finalPnl = (open − close) × contracts × 100` (`costbasis.ts:50-83`)
- ✓ `CspExpirationInput`/`Result`; `finalPnl = openPremium × contracts × 100`, literal `pnlPercentage: '100.0000'` (`costbasis.ts:61-69,173-183`)
- ✓ `RollBasisInput` fields incl. `legType: 'CSP' | 'CC'`, optional `prevStrike`/`newStrike`/`positionContracts` (`costbasis.ts:217-228`)
- ✓ `calculateRollBasis` throws when CSP strikes are missing or CC `positionContracts` is missing (`costbasis.ts:236-245`)
- ✓ CC roll prorates `netTotal / (positionContracts × 100)`; CSP same-strike `prev − net`; different-strike `prev + (new − prev) − net`; `totalPremiumCollected = prevTotal + net × contracts × 100` (`costbasis.ts:247-265`)
- ✓ No `calculateCcRollBasis` exists; `rollCcPosition` calls with `legType: 'CC', positionContracts` (`src/main/services/roll-cc-position.ts:64-65`); `rollCspPosition` passes `legType: 'CSP', prevStrike, newStrike` (`roll-csp-position.ts:56-58`)
- ✓ Roll services issue no `UPDATE positions` (grep empty in `roll-c*-position.ts`); CC roll inserts `ROLL_FROM`/`BUY`/`CALL` + `ROLL_TO`/`SELL`/`CALL` (`roll-cc-position.ts:80,100`)
- ✓ `AssignmentBasisLeg` with optional `label`; `AssignmentBasisInput`/`Result` incl. `sharesHeld`, `premiumWaterfall` (`costbasis.ts:85-108`)
- ✓ Waterfall label `leg.label ?? LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole`; `LEG_ROLE_LABEL.CSP_OPEN = 'CSP premium'` (`costbasis.ts:110-113,130`)
- ✓ Assignment basis `strike − Σ premiumPerContract`; total `Σ premium × contracts × 100` (`costbasis.ts:115-140`)
- ✓ `assignCspPosition` owns private `groupRollsByChain`, emitting `legRole: 'ROLL_NET'` with `Roll #N credit|debit` labels (`src/main/services/assign-csp-position.ts:16,71,84,87`)
- ✓ `CcOpenBasisInput` incl. `positionContracts`; prorated basis reduction (`costbasis.ts:142-171`)
- ✓ `CcCloseInput`/`CcCloseResult { ccLegPnl }` (`costbasis.ts:185-200`)
- ✓ CC close inserts one `CC_CLOSE`/`BUY`/`CALL` leg with premium and fill both equal to the close price, and writes no snapshot (`src/main/services/close-covered-call-position.ts:65,72-73`)
- ✓ CC expiration writes no snapshot and persists `leg_role = 'CC_EXPIRED'` (`src/main/services/expire-cc-position.ts:52`)
- ✓ `CallAwayInput`/`CallAwayResult`; `finalPnl = (ccStrike − basis) × shares`, `capitalDeployed`, `cycleDays`, `annualizedReturn` with `'0'` when `cycleDays <= 0` (`costbasis.ts:202-215,310-335`)
- ✓ Call-away inserts leg `CALLED_AWAY`/`EXERCISE`/`CALL` with premium `'0.0000'`, flips to `WHEEL_COMPLETE`/`CLOSED`/`closed_date = fillDate`, and inserts a snapshot carrying the prior basis with `final_pnl` (`src/main/services/record-call-away-position.ts:73-101`)
- ✓ Multi-contract call-away rejected (`contracts > 1` → `multi_contract_unsupported`); fill before CC open → `close_date_before_open` (`src/main/core/lifecycle.ts:246-258,61-64`)
- ✓ Breakeven close classified `CSP_CLOSED_LOSS` (`netPnl.gt(0)` → profit) (`lifecycle.ts:136`)
- ✓ CSP expire leg `premium_per_contract '0.0000'`, `fill_price NULL` (`src/main/services/expire-csp-position.ts:69-70`)
- ✓ `UnrealizedPnlInput`/`Result` and `computeUnrealizedPnl` validation (`entry > 0`, `mid >= 0`, integer contracts ≥ 1) (`costbasis.ts:273-308`)
- ✓ `SHARES_PER_CONTRACT`, `sharesFromContracts`, `calculateCycleDays`, `LEG_ROLE_LABEL` are module-private (`costbasis.ts:10,27,31,110`)
- ✓ `DEFAULT_PROFIT_TARGET_PERCENT = 50` in `src/main/core/profit-target.ts:4`; `=== null` check (`:10`)
- ✓ `deriveRunningBasis<T extends { fillDate: string }>(legs, snapshots)` with `SnapshotInput = { snapshotAt; basisPerShare }` and `slice(0, 10)` date comparison (`src/renderer/src/lib/deriveRunningBasis.ts:1,5,48-50`)
- ✓ `CcPnlPreview` labels `% of max`, `% above open`, `$0.00 break-even` (`src/renderer/src/components/ui/CcPnlPreview.tsx:39,48,51`)
- ✓ Option snapshot polling 60 s, disabled when session closed (`src/renderer/src/hooks/useOptionSnapshots.test.ts:208-245`)
- ✓ `cost_basis_snapshots` columns per `migrations/001_initial_schema.sql:40-49` plus `trigger_event TEXT NOT NULL DEFAULT 'UNKNOWN'` (`migrations/004_add_trigger_event_to_snapshots.sql:1`); no `pnl_percentage` column

## Drift (6)

- ✗ Lines 257, 672-673, 830: `resolveProfitTarget(override: number | null): number`. The actual signature is `resolveProfitTarget(override, defaultPercent = DEFAULT_PROFIT_TARGET_PERCENT)` (`src/main/core/profit-target.ts:6-10`), and callers pass a configured default (`src/renderer/src/components/PositionCard.tsx:44`, `src/main/core/alerts.ts:308`).
- ✗ Lines 260-264: "No story currently describes the UX for setting a global default… without introducing an `app_settings` table." A global default now exists. It is stored in `app_settings` under `alert_default_profit_target_percent` and falls back to the constant (`src/main/services/alert-defaults.ts:15,32`), and is exposed via `settings:get-alert-defaults`.
- ✗ Lines 351, 896-898: the CSP expiration snapshot uses `snapshot_at = now + 1ms`. `expire-csp-position.ts:55` uses `makeSnapshotAt(recordedDate)`, which is the event date plus the current wall-clock time (`src/main/dates.ts:24-26`). There is no `+1ms`. Latest-row selectors break ties with `ORDER BY snapshot_at DESC, rowid DESC` (`get-position.ts:208`, `list-positions.ts:50`), not plain `snapshot_at DESC` as lines 12, 61 and 889-893 state.
- ✗ Snapshot tables (lines 329, 399, 428, 481, 506, 585) give `snapshot_at` as "now". Every snapshot-writing service builds it with `makeSnapshotAt(<eventDate>)` (close-csp, expire-csp, assign-csp, open-cc, roll-csp, roll-cc, record-call-away, positions), so the date part is the event date, not today.
- ✗ Lines 627-634, the leg-role → snapshot table: `CC_EXPIRED | Yes | Yes (terminal)`. CC expiration writes no snapshot and is not terminal (lines 547-553 of the same page; `expire-cc-position.ts` has no snapshot insert). Suggested fix: `CC_EXPIRED | No | N/A`.
- ✗ Line 589: "A single `CC_CLOSE` leg is inserted with `action = 'EXERCISE'`…". The inserted leg has `leg_role = 'CALLED_AWAY'` (`record-call-away-position.ts:78`). Line 593 of the page says so too, so the page contradicts itself.

## Unverifiable (4)

- ? Line 98: "$47.70 instead of $44.70 in the US-16 scenario". The worked example at line 389 computes $44.30. This is internal arithmetic inconsistency in narrative, flagged for human review.
- ? Lines 678-680: "the engine … does not gate the badge". The badge predicate does run in the renderer (`PositionCard.tsx:44`), but `src/main/core/alerts.ts:308` now resolves the profit target for alert evaluation in main. It is unclear whether the claim is scoped to the badge only.
- ? Line 310: "CSP open — Not yet documented in extracts": a placeholder, not a code claim.
- ? Lines 60, 94-100, 169, 290-295: rationale prose (audit trail, tastytrade framing).

## Missing files (3)

- ✗ `../features/us-5-record-csp-expiration.md` (lines 127, 916) does not exist; the page is `us-5-expire-csp.md`.
- ✗ `../features/us-6-record-csp-assignment.md` (lines 145, 917) does not exist; the page is `us-6-record-assignment.md`.
- ✗ `../features/us-8-close-covered-call-early.md` (lines 184, 279, 296, 919) does not exist; the page is `us-8-close-cc-early.md`.
