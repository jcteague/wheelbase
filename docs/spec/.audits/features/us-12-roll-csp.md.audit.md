---
page: docs/spec/features/us-12-roll-csp.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/features/us-12-roll-csp.md

## Verified (20)

- ✓ All 19 listed source files exist, including `src/main/services/roll-csp-position.ts`, `src/main/services/active-leg-sql.ts`, `src/renderer/src/lib/rolls.ts`, `e2e/csp-roll.spec.ts`
- ✓ `positions:roll-csp` registered via `registerParsedPositionHandler` (`src/main/ipc/positions.ts:35`) with `RollCspPayloadSchema` and label `positions_roll_csp_unhandled_error` (`positions.ts:128-134`)
- ✓ `rollCsp()` at `src/main/core/lifecycle.ts:365`: rejects non-`CSP_OPEN` (`:366`), requires strictly later expiration with "New expiration must be after the current expiration" (`:370-375`), positive money inputs (`:378-379`), returns `{ phase: 'CSP_OPEN' }`
- ✓ `calculateRollBasis()` at `src/main/core/costbasis.ts:235`; `net = newPremium − costToClose` (`:247`); `totalPremiumCollected = prev + netTotal` (`:264`); `Decimal.ROUND_HALF_UP` + 4 dp `round4` (`costbasis.ts:8,24`)
- ✓ `RollCspPayloadSchema` (`src/main/schemas.ts:348`) derives from `RollPayloadBaseSchema` (`:328`) with `newExpiration` ISO regex (`:332`), optional `newStrike`, `fillDate` (`:333-334`)
- ✓ Service loads via `getPosition` (`roll-csp-position.ts:22`), writes in one `db.transaction` (`:67`) a `ROLL_FROM` BUY PUT (`:73`) and `ROLL_TO` SELL PUT (`:93`) sharing `roll_chain_id`, and a snapshot with `final_pnl` NULL (`:110-113`); no `UPDATE positions`
- ✓ `activeLegSubquery()` at `active-leg-sql.ts:6` with `CSP_OPEN → CSP_OPEN|ROLL_TO`, `CC_OPEN → CC_OPEN|ROLL_TO` (`:10-11`), `ORDER BY fill_date DESC, created_at DESC LIMIT 1` (`:13-14`); used by `get-position.ts:203` and `list-positions.ts:45`
- ✓ Renderer adapter `rollCsp` maps snake_case → camelCase (`src/renderer/src/api/positions.ts:490-500`); errors via `mapIpcErrors`/`IPC_TO_FORM_FIELD` (`:78,91`) and `throwMappedIpcErrors` → `apiError(400, …)` (`src/renderer/src/api/error.ts:24-25`)
- ✓ `useRollCsp` wraps `usePositionMutation` (`src/renderer/src/hooks/useRollCsp.ts:3-8`)
- ✓ `getRollTypeLabel` ("Roll Out"/"Roll Down & Out"/"Roll Up & Out", `rolls.ts:23-30`), `computeNetCreditDebit` (`:40`), `rollCreditDebitColors` (`:61`)
- ✓ `RollCspSheet`: `makeRollCspSchema(currentExpiration)` (`RollCspSheet.tsx:13`) with refine message (`:36`), `zodResolver` (`:79`), `createPortal` (`:112`), `SheetPanel width={420}` (`:114`)
- ✓ `RollCspForm.tsx` does not call `useForm` (presentational)
- ✓ Success hero uses linear-gradient (`RollCspSuccess.tsx:30-31`)
- ✓ Preload bridge `rollCsp` → `positions:roll-csp` (`src/preload/index.ts:28`), typed at `src/preload/index.d.ts:688`
- ✓ `PositionDetailActions.tsx` exposes `onRollCsp` (`:13`); `PositionDetailPage.tsx` renders `RollCspSheet` (`:235`)
- ✓ e2e covers each AC: `e2e/csp-roll.spec.ts:68,89,103,118,138,154,169`
- ✓ Linked pages `../domain/wheel-lifecycle.md`, `../domain/cost-basis.md`, `../contracts/ipc-handlers.md`, `../schema/tables.md` exist

## Drift (1)

- ✗ Page states the roll basis formula as `basisPerShare = prevBasisPerShare − net` (What was built; Architecture decisions) while also saying the roll may change strike. For a CSP roll to a different strike the code is `prev + (newStrike − prevStrike) − net` (`src/main/core/costbasis.ts:259-262`). Suggested fix: qualify the formula as the same-strike case and note the strike-delta term (likely added by US-13).

## Unverifiable (1)

- ? "closing NaN edge cases" from the RHF migration — historical/narrative.

## Missing files (0)
