---
page: docs/spec/features/us-9-expire-cc.md
audited_at: 2026-09-28
findings: 3
---

# Audit: docs/spec/features/us-9-expire-cc.md

## Verified (15)

- ✓ All 20 listed source files exist, including `src/main/services/expire-cc-position.ts` and `e2e/cc-expiration.spec.ts`.
- ✓ `positions:expire-cc` registered at `src/main/ipc/positions.ts:121` with `handleIpcCall('positions_expire_cc_unhandled_error', …)` (`:122`) and `ExpireCcPayloadSchema.parse` (`:123`).
- ✓ `expireCc()` at `src/main/core/lifecycle.ts:303`, separate from `expireCsp()` (`:149`); wrong-phase `__phase__/invalid_phase/'No open covered call on this position'` (`:305`); too-early message interpolates `${input.expirationDate}` (`:312`).
- ✓ `ExpireCcPayloadSchema` `{ positionId, expirationDateOverride?: string }` at `src/main/schemas.ts:280`; `ExpireCcPositionResult` with `position/leg/costBasisSnapshot/sharesHeld` at `schemas.ts:287-298`.
- ✓ Service date contract: `referenceDate = payload.expirationDateOverride ?? today` (`expire-cc-position.ts:26`), `recordedDate = payload.expirationDateOverride ?? openLeg.expiration` (`:39`).
- ✓ Defensive `__root__/no_active_leg` guard (`expire-cc-position.ts:36`).
- ✓ `sharesHeld = assignLeg ? assignLeg.contracts * 100 : 0` (`expire-cc-position.ts:41-42`), returned (`:107`).
- ✓ Leg insert: `action='EXPIRE'`, `instrument_type='CALL'`, `premium_per_contract='0.0000'`, `fill_price=NULL`, `fill_date=recordedDate` (`expire-cc-position.ts:47-61`); phase update to `HOLDING_SHARES` only (`:65`); no snapshot write; existing snapshot returned (`:97`).
- ✓ Preload `expireCc` → `positions:expire-cc` (`src/preload/index.ts:27`, `index.d.ts:687`); renderer adapter `expireCc` at `src/renderer/src/api/positions.ts:444` mapping `expiration_date_override` (`:266`).
- ✓ `useExpireCoveredCall` invalidates `positionQueryKeys.all` (`useExpireCoveredCall.ts:14`).
- ✓ `CcExpirationSheet` uses `createPortal` (`:2,89`), `totalPremium = (parseFloat(premiumPerContract) * contracts * 100).toFixed(0)` (`:63`), "100% premium captured · {contracts} contract" (`:164`), Still Holding badge (`:166`), nudge in `AlertBox variant="info"` (`:218-219`).
- ✓ "Record Expiration →" renders only for `phase === 'CC_OPEN' && ccExpired` (`PositionDetailActions.tsx:68-72`).
- ✓ `ccExpired = phase === 'CC_OPEN' && activeLeg ? computeDte(activeLeg.expiration) <= 0 : false` (`PositionDetailPage.tsx:120-121`); `computeDte` in `src/renderer/src/lib/format.ts:48`.
- ✓ Page-side `sharesHeld={assignLeg?.contracts ? assignLeg.contracts * 100 : 0}` (`PositionDetailPage.tsx:122,230`).
- ✓ `e2e/cc-expiration.spec.ts` has 5 test cases, matching "5 scenarios".

## Drift (3)

- ✗ Page states the leg is written with `leg_role = 'EXPIRE'` (What was built; "CC expire leg shape" decision; "`LegRole = 'EXPIRE'` … already in enums"). The service inserts `leg_role = 'CC_EXPIRED'` (`src/main/services/expire-cc-position.ts:51`) and returns `legRole: 'CC_EXPIRED'` (`:84`); `CC_EXPIRED` is a `LegRole` member (`src/main/core/types.ts:24`). Suggested fix: update leg-role references to `CC_EXPIRED`.
- ✗ Page says `PositionDetailPage` "adds `ccExpCtx` state" and that `ccExpCtx` joins the blur condition. No `ccExpCtx` exists; the state is `ccExpirationCtx` in `src/renderer/src/pages/usePositionDetailSheets.ts:114`, and the any-sheet-open check is at `usePositionDetailSheets.ts:120-121`. Suggested fix: rename and point to the hook.
- ✗ "Refactor status: pending" callout says post-refactor decisions are not captured; the code has since been refactored (sheet state extracted to `usePositionDetailSheets.ts`; `requireCcOpenPhase` helper at `src/main/core/lifecycle.ts:55`). The callout is stale.

## Unverifiable (2)

- ? 400 px sheet width — no literal width in `CcExpirationSheet.tsx`; may be shared styling.
- ? Worktree caveat (commits `47f5412` / `9fb1928`) is historical process narrative.

## Missing files (0)

- ✓ `./us-7-open-covered-call.md`, `./us-5-expire-csp.md`, `../domain/*.md`, `../contracts/ipc-handlers.md`, `../schema/tables.md` resolve.
