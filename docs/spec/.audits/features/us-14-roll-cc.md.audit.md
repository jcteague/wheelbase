---
page: docs/spec/features/us-14-roll-cc.md
audited_at: 2026-09-28
findings: 3
---

# Audit: docs/spec/features/us-14-roll-cc.md

## Verified (19)

- ✓ All 15 cited source files exist, including `src/main/services/roll-cc-position.ts`, `src/renderer/src/hooks/useRollCc.ts`, `src/renderer/src/pages/usePositionDetailSheets.ts`, `e2e/cc-roll.spec.ts`
- ✓ `rollCc` (`src/main/core/lifecycle.ts:398`) with `RollCcInput`/`RollCcResult` (`:384-396`): `requireCcOpenPhase` (`:399`), on-or-after rule `newExpiration < currentExpiration` → `must_be_on_or_after_current` (`:401-407`), no-change guard at field `__roll__`, code `no_change`, message "Roll must change at least one of strike or expiration" (`:409-415`), positive-money guards (`:417-418`), returns `{ phase: 'CC_OPEN' }`
- ✓ `rollCcPosition` (`roll-cc-position.ts:11`): `not_found`/`no_active_leg` (`:24,29`), one `db.transaction` (`:74`), `ROLL_FROM` BUY CALL (`:80`) and `ROLL_TO` SELL CALL (`:100`), snapshot with `final_pnl` NULL (`:119`), `newStrike` defaults to active-leg strike (`:34`)
- ✓ `positions:roll-cc` registered via `registerParsedPositionHandler` with `RollCcPayloadSchema` (`src/main/ipc/positions.ts:136-142`)
- ✓ `RollPayloadBaseSchema` (`src/main/schemas.ts:328`), `RollCcPayloadSchema = RollPayloadBaseSchema` (`:365`), `RollResultBase` (`:337`), `RollCspResult`/`RollCcResult extends RollResultBase` (`:352,369`), `IsoDateRegex`/`IsoDateMessage` (`:42-43`)
- ✓ Preload `rollCc` → `positions:roll-cc` (`src/preload/index.ts:29`); adapter `rollCc` (`src/renderer/src/api/positions.ts:540`)
- ✓ `useRollCc` one-liner over `usePositionMutation` (`hooks/useRollCc.ts:3-8`), no dedicated test file
- ✓ `getCcRollTypeLabel` (`src/renderer/src/lib/rolls.ts:82`) returning the 6-value `CcRollType` union incl. `'No Change'`; `getCcRollTypeColor` (`:95`) returns CSS variable strings
- ✓ `RollCcSheet`: `makeRollCcSchema` (`RollCcSheet.tsx:14`), `zodResolver` (`:75`), `createPortal` (`:108`), `SheetPanel width={420}` (`:110`); messages "Cost to close must be greater than zero" (`:26`) and "New expiration must be on or after the current expiration" (`:39`)
- ✓ `RollCcForm` is presentational (no `useForm`); below-basis warning is non-blocking `AlertBox variant="warning"` (`RollCcForm.tsx:276-281`); confirm disabled when `rollType === 'No Change'` (`:302`)
- ✓ Success title "CC Rolled Successfully" (`RollCcSuccess.tsx:79`)
- ✓ `rollCcOpen` OR'd into `overlayOpen` (`usePositionDetailSheets.ts:119-124`)
- ✓ `PositionDetailActions.tsx` exposes `onRollCc` (`:9`); `PositionDetailPage.tsx` renders `RollCcSheet` (`:249`)
- ✓ Each AC has an e2e case in `e2e/cc-roll.spec.ts:63,84,104,122,150,168,187,206,228,244,257`
- ✓ All linked ADR / contract / domain pages resolve

## Drift (3)

- ✗ Lines 23 and 34 say CC rolls reuse `calculateRollBasis()` "unchanged" with `basisPerShare = prevBasisPerShare − (newPremium − costToClose)`. The code now takes `legType: 'CC'` and `positionContracts` and **prorates** the net across all held shares: `prev − netTotal / sharesFromContracts(positionContracts)` (`src/main/core/costbasis.ts:252-256`; service passes them at `roll-cc-position.ts:64-65`). Suggested fix: update formula and link to US-16.
- ✗ Lines 27 and 42 say `makeRollCcSchema`'s Zod refines enforce the no-change guard "against the live current strike/expiration". The factory takes only `currentExpiration` (`RollCcSheet.tsx:14`) and has no no-change refine; the guard is derived in `RollCcForm` from `rollType === 'No Change'` (disabled button `:302`, error `AlertBox` `:272-273`). Suggested fix: describe the guard as form-derived.
- ✗ Line 27 says the below-basis warning compares `newStrike < basisPerShare`. It compares against the **projected** post-roll basis: `computeGuardrailComparison(newStrike, projectedBasis)` (`RollCcForm.tsx:135-141`). Relatedly, the renderer's no-change copy is "Roll must change the expiration, strike, or both." (`RollCcForm.tsx:273`), not the engine message quoted in the AC — the AC's `__roll__`/`no_change` text matches the engine only.

## Unverifiable (1)

- ? Rationale that CSP-roll architecture was "replicated, not generalized" and the `getCcRollType` → `getCcRollTypeLabel` rename history — narrative.

## Missing files (0)
