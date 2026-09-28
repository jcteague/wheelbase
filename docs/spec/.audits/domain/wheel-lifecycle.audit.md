---
page: docs/spec/domain/wheel-lifecycle.md
audited_at: 2026-09-28
findings: 6
---

# Audit: docs/spec/domain/wheel-lifecycle.md

## Verified (31)

- ✓ `WheelPhase` Zod enum in `src/main/core/types.ts:7-18` has exactly the 10 values in the Phases table
- ✓ `LegAction = z.enum(LEG_ACTION_VALUES)` with `['SELL','BUY','EXPIRE','ASSIGN','EXERCISE']`, and `LEG_ACTION_VALUES` is module-private (`types.ts:3,31`)
- ✓ `InstrumentType = z.enum(['PUT','CALL','STOCK'])` (`types.ts:32`); `LegRole` includes `CALLED_AWAY` and `CC_EXPIRED` (`types.ts:19-30`)
- ✓ `migrations/003_rename_option_type_to_instrument_type.sql:6` has `CHECK (instrument_type IN ('PUT','CALL','STOCK'))`, and `action` has no CHECK (`:5`)
- ✓ `lifecycle.ts` imports only `decimal.js` + `./types` (`src/main/core/lifecycle.ts:4-5`)
- ✓ `ValidationError(field, code, message)` (`lifecycle.ts:7-16`)
- ✓ `openWheel` validates strike, premium and `fillDate > referenceDate` → `cannot_be_future` (`lifecycle.ts:67-96`)
- ✓ `CloseCspInput`/`Result` shape; `invalid_phase`, `close_date_before_open`, `close_date_after_expiration`, `must_be_positive`; `netPnl.gt(0)` breakeven → loss (`lifecycle.ts:98-137`)
- ✓ `ExpireCspInput`/`Result`; `too_early` on field `expiration`; same-day valid (`lifecycle.ts:139-163`)
- ✓ `RecordAssignmentInput`/`Result`; `assignmentDate`/`date_before_open`; no future-date check (`lifecycle.ts:262-289`)
- ✓ `OpenCoveredCallInput` fields incl. `positionContracts`, `assignmentDate`, `referenceDate`; `exceeds_shares` message `Contracts cannot exceed shares held (${n})`; `before_assignment`; `cannot_be_future` (`lifecycle.ts:165-229`)
- ✓ `CloseCoveredCallInput`/`Result`; messages "No open covered call on this position", "Close price must be greater than zero", "Fill date cannot be before the CC open date", "…use Record Expiry instead" (`lifecycle.ts:319-352`, helpers `:41-59`)
- ✓ `requirePositiveClosePrice`, `requireCcOpenPhase`, `requireFillDateOnOrAfterOpen`, `NO_OPEN_COVERED_CALL_MESSAGE` exist as private helpers/constants (`lifecycle.ts:33,51,55,61`)
- ✓ `ExpireCcInput`/`Result`; interpolated `too_early` message (`lifecycle.ts:291-317`)
- ✓ `RecordCallAwayInput`/`Result`; `multi_contract_unsupported`; `close_date_before_open` (`lifecycle.ts:231-260`)
- ✓ As-implemented `RollCspInput` has no strike fields; `newExpiration <= currentExpiration` → `must_be_after_current`; positive cost/premium (`lifecycle.ts:354-385`)
- ✓ `RollCcInput`/`Result`; `must_be_on_or_after_current`; `__roll__`/`no_change` "Roll must change at least one of strike or expiration"; messages "Cost to close / New premium must be greater than zero" (`lifecycle.ts:387-420`)
- ✓ Leg-role table matches service inserts. `CSP_OPEN/SELL/PUT` (`services/positions.ts:92`), `CSP_CLOSE/BUY/PUT` (`close-csp-position.ts:61`), `EXPIRE/EXPIRE/PUT` (`expire-csp-position.ts:62`), `ASSIGN/ASSIGN/STOCK` (`assign-csp-position.ts:106`), `CC_OPEN/SELL/CALL` (`open-covered-call-position.ts:73`), `CC_CLOSE/BUY/CALL` (`close-covered-call-position.ts:65`), `CC_EXPIRED/EXPIRE/CALL` (`expire-cc-position.ts:52`), `CALLED_AWAY/EXERCISE/CALL` (`record-call-away-position.ts:78`), `ROLL_FROM/BUY/PUT` + `ROLL_TO/SELL/PUT` (`roll-csp-position.ts:73,93`), CALL pair (`roll-cc-position.ts:80,100`)
- ✓ Expire legs use `premium '0.0000'`, `fill_price NULL`, `fill_date = override ?? openLeg.expiration` (`expire-csp-position.ts:37,69-70`; `expire-cc-position.ts:39,58-60`)
- ✓ Roll ROLL_TO strike = `payload.newStrike ?? activeLeg.strike` (`roll-csp-position.ts:34`, `roll-cc-position.ts:34`); rolls issue no `UPDATE positions`
- ✓ `activeLegSubquery` resolves `CSP_OPEN|ROLL_TO` / `CC_OPEN|ROLL_TO` ordered `fill_date DESC, created_at DESC` (`src/main/services/active-leg-sql.ts:6-15`)
- ✓ `GET_LEGS_QUERY`, `mapLegRow` with `rollChainId: r.roll_chain_id ?? null`, and `mapActiveLeg` returning `rollChainId: null` (`src/main/services/get-position.ts:58,71,90,107,130`)
- ✓ Non-roll services construct `rollChainId: null` (positions.ts:157, close-csp:119, expire-csp:120, close-cc:107, open-cc:129, assign-csp:162, expire-cc:93, record-call-away:125)
- ✓ `buildRollTimeline` in `src/renderer/src/lib/rollGroups.ts:107`
- ✓ `PositionDetailActions` renders "Roll CSP →" only for `CSP_OPEN` and "Roll CC →" only for `CC_OPEN` (`src/renderer/src/components/PositionDetailActions.tsx:53-55,82-84`)
- ✓ CC "Record Expiration →" gated on `phase === 'CC_OPEN' && computeDte(activeLeg.expiration) <= 0` (`PositionDetailActions.tsx:68`, `src/renderer/src/pages/PositionDetailPage.tsx:120-121`)
- ✓ Parameterised phase-rejection tests exist (`lifecycle.test.ts:787,927`; `roll-csp-position.test.ts:311`; `roll-cc-position.test.ts:300`)
- ✓ Call-away sets `WHEEL_COMPLETE`/`CLOSED`/`closed_date = fillDate` and writes a final snapshot (`record-call-away-position.ts:92-101`)
- ✓ CC close and CC expire write no cost-basis snapshot (no insert in `close-covered-call-position.ts` / `expire-cc-position.ts`)
- ✓ `calculateCcClose` returns `ccLegPnl` (`src/main/core/costbasis.ts:195-200`)
- ✓ `RollCspPayloadSchema` exists (`src/main/schemas.ts:348`)

## Drift (2)

- ✗ Lines 224-225: for `openCoveredCall`, the `invalid_phase` message "also covers… 'This position is closed' for terminal phases". The code only has "A covered call is already open on this position" for `CC_OPEN` and "Position is not in HOLDING_SHARES phase" for every other phase (`src/main/core/lifecycle.ts:182-196`). No "This position is closed" string exists.
- ✗ Lines 517-520: CC roll cost basis "reuses `calculateRollBasis()` unchanged from `rollCsp`: … `basisPerShare = prevBasisPerShare − net`". For `legType: 'CC'`, `calculateRollBasis` prorates `netTotal / (positionContracts × 100)` (`src/main/core/costbasis.ts:253-257`), and `rollCcPosition` passes `positionContracts` (`roll-cc-position.ts:64-65`). The per-share basis only equals `prev − net` when every held contract is rolled.

## Unverifiable (4)

- ? Lines 459-463: the us-13 status note describes the contents of the "us-13 plan dir". `plans/us-13/` no longer exists (only us-44, us-56…, us-121 and similar remain), so the claim cannot be checked. The feature page `us-13-roll-down-and-out.md` says the same.
- ? Line 462: the "5-way roll-type label… design intent only". `src/renderer/src/lib/rolls.ts:68-90` already defines a 5-way `'Roll Up & Out' | 'Roll Down & Out' | 'Roll Up' | 'Roll Down' | 'Roll Out'` type (apparently for CC rolls). Whether it counts as the us-13 CSP work is a judgment call.
- ? Line 549: "service-level tests cover all 9 non-rollable phases per direction": `it.each` tables exist, but the row count was not verified.
- ? Lines 666-682: rationale bullets (testability, single source of truth).

## Missing files (4)

- ✗ `../features/us-8-close-covered-call.md` (line 698) doesn't exist; the page is `us-8-close-cc-early.md`.
- ✗ `../features/us-10-record-call-away.md` (line 700) doesn't exist; the page is `us-10-call-away.md`.
- ✗ `../features/us-11-terminal-leg-roles.md` (line 701) doesn't exist; the page is `us-11-leg-history.md`.
- ✗ `../features/us-13-roll-csp-strike.md` (line 703) doesn't exist; the page is `us-13-roll-down-and-out.md`.
