# US-10: Record shares called away

<!-- generated:from us-10 -->
## Summary

Adds the terminal "shares called away" path that closes a wheel when a covered call is exercised at expiration. A right-side `CallAwaySheet` on the position detail page confirms the trade with a P&L waterfall (CC strike − effective basis → appreciation per share × 100 shares → final cycle P&L); on submit the backend writes a single `CC_CLOSE`/`EXERCISE`/`CALL` leg with `fill_price` set to the CC strike and `fill_date` set to the CC expiration date, transitions the position `CC_OPEN → WHEEL_COMPLETE` (terminal), flips `status` to `CLOSED`, sets `closed_date`, and appends a final `cost_basis_snapshots` row carrying the newly computed `final_pnl`. The success state surfaces a "WHEEL COMPLETE" hero with the signed final P&L, cycle days, annualized return, and a "Start New Wheel on {ticker} →" CTA. No schema migration is required — the only enum change (`LegAction` adding `'EXERCISE'`) is type-only and `WHEEL_COMPLETE` already exists as a `WheelPhase` value. The action is single-contract only; multi-contract call-away is explicitly rejected.

## Acceptance criteria

- Recording shares called away on a `CC_OPEN` position transitions it to `WHEEL_COMPLETE`, sets `status = CLOSED` and `closed_date = fillDate` (the CC's expiration date), and writes a `CC_CLOSE`/`EXERCISE`/`CALL` leg with `fill_price = CC strike`, `fill_date = CC expiration`, and `premium_per_contract = '0.0000'`.
- Final cycle P&L is `(ccStrike − basisPerShare) × sharesHeld` — `+$780.00` when CC strike `$182.00` is called against effective basis `$174.20` on 100 shares; `−$250.00` when CC strike `$174.00` is called against effective basis `$176.50` (displayed in red).
- The confirmation sheet shows a P&L waterfall — CC strike, minus effective cost basis, equals appreciation per share, times 100 shares, equals final cycle P&L — before submission.
- Attempting the action from any phase other than `CC_OPEN` is rejected with `"No open covered call on this position"`.
- Submitting a `fillDate` before the CC's open date is rejected with `"Fill date cannot be before the CC open date"` and no leg is created. (The renderer derives `fillDate` from the CC_OPEN leg, so this guard is defense in depth.)
- The success screen shows "WHEEL COMPLETE", the prominent signed final P&L, cycle duration in calendar days (`position.openedDate → fillDate`), the annualized return percentage, and a "Start New Wheel on {ticker} →" CTA.

## What was built

The pure lifecycle engine gains `recordCallAway(input)`: it validates `currentPhase === 'CC_OPEN'`, `contracts <= 1`, and `fillDate >= ccOpenFillDate`, then returns `{ phase: 'WHEEL_COMPLETE' }`. The function is structurally separate from `closeCoveredCall` because the post-transition phase is terminal (`WHEEL_COMPLETE`, not `HOLDING_SHARES`) and the leg semantics differ (exercise vs. buy-to-close). The Refactor pass extracted two shared helpers — `requireCcOpenPhase()` and `requireFillDateOnOrAfterOpen()` — plus the constant `NO_OPEN_COVERED_CALL_MESSAGE`, all now used by both `recordCallAway()` and `closeCoveredCall()` so the two CC-close paths share identical phase and date guards with identical error text. Multi-contract call-away is rejected with `contracts/multi_contract_unsupported/"Multi-contract call-away is not yet supported"`.

The cost-basis engine gains `calculateCallAway({ ccStrike, basisPerShare, contracts, positionOpenedDate, fillDate })` returning `{ finalPnl, sharesHeld, capitalDeployed, cycleDays, annualizedReturn }`. The formula is `finalPnl = round4((ccStrike − basisPerShare) × sharesHeld)` where `sharesHeld = contracts × 100`; `annualizedReturn = round4((finalPnl / capitalDeployed) × (365 / cycleDays) × 100)` with a guard returning `'0.0000'` when `cycleDays <= 0` to avoid divide-by-zero. **`basisPerShare` is the effective cost basis from the latest `cost_basis_snapshot`; the formula never re-adds `totalPremiumCollected` because the premium reductions are already baked into `basisPerShare`.** The Refactor pass extracted `SHARES_PER_CONTRACT`, `sharesFromContracts()`, and `calculateCycleDays()` helpers and reused them across the engine. All math runs through `decimal.js` with `ROUND_HALF_UP`.

`recordCallAwayPosition` orchestrates the write inside one SQLite transaction. A `getCcOpenLeg()` helper sources `strike`/`expiration`/`contracts`/`fillDate` from the active `CC_OPEN` leg; the service derives `fillDate = ccOpenLeg.expiration` and `fillPrice = ccOpenLeg.strike` (the trader never enters either), reads `basisPerShare` from the latest `cost_basis_snapshots` row, calls the lifecycle and cost-basis engines, inserts the `CC_CLOSE`/`EXERCISE`/`CALL` leg (`premium_per_contract = '0.0000'`), updates the position row (`phase = WHEEL_COMPLETE`, `status = CLOSED`, `closed_date = fillDate`), and inserts a new `cost_basis_snapshots` row copying the prior `basis_per_share` and `total_premium_collected` and writing the newly computed `final_pnl`. The opening snapshots are never mutated. The IPC handler `positions:record-call-away` is registered via the shared `registerParsedPositionHandler()` helper (introduced/standardized in the Refactor pass) and returns `{ ok: true, position, leg, costBasisSnapshot, finalPnl, cycleDays, annualizedReturn, basisPerShare }`. Error envelopes follow the standard convention: `__phase__/invalid_phase`, `contracts/multi_contract_unsupported`, `fillDate/close_date_before_open`, `__root__/not_found`, `__root__/no_cc_open_leg`.

On the renderer, the `recordCallAway` API adapter maps snake_case (`position_id`) to camelCase IPC fields and throws via the shared `throwMappedIpcErrors()` helper (extracted in the Refactor pass to consolidate the call-away / covered-call error-mapping path). A new shared `usePositionMutation()` hook centralizes `positionQueryKeys.all` invalidation plus an optional `onSuccess(data)` forward; both `useRecordCallAway` and `useCloseCoveredCallEarly` now delegate to it. `CallAwaySheet` is a portal-based right-side panel (400 px) rendered via `createPortal`, mirroring `CloseCcEarlySheet`; it owns a single `successState: RecordCallAwayResponse | null` state machine, returns `null` when `!open`, and renders `CallAwaySuccess` when `successState` is set, else `CallAwayForm`. The sheet derives `sharesHeld`, `appreciationPerShare`, `appreciationTotal`, `finalPnl`, and `capitalDeployed` from props for the preview.

`CallAwayForm` shows the position summary, the P&L waterfall (CC strike, − effective cost basis, = appreciation per share, × 100 shares, = final cycle P&L), a read-only fill-date field using the existing `FormField` + `Input readOnly` primitives with the hint "Derived from your CC — the day shares are delivered to the buyer", an `AlertBox variant="warning"` reading "This cannot be undone." / "The position will close as WHEEL_COMPLETE. Full leg history is preserved.", and the Cancel + Confirm Call-Away footer. `CallAwaySuccess` renders the "WHEEL COMPLETE" hero card with `pnlColor(finalPnl)` (green positive, red negative — shared with the confirmation sheet), a Cycle Summary `SectionCard` showing cycle days and annualized return, and a "Start New Wheel on {ticker} →" CTA whose `onClick` sets `window.location.hash = '#/new?ticker=' + ticker` and calls `onClose` (hash-based wouter routing as required by the Electron `file://` shell).

The "Record Call-Away →" button lives in `PositionDetailActions` with `data-testid="record-call-away-btn"` and renders only when `phase === 'CC_OPEN'` (alongside "Close CC Early →"). The Refactor pass replaced repetitive action-button markup with a shared `ActionButton` renderer covering close-covered-call, call-away, assignment, expiration, and open-covered-call buttons (labels, test IDs, and handlers unchanged). `PositionDetailPage` was reduced to 142 lines: the Refactor pass extracted `usePositionDetailSheets()` (a new hook owning all five modal contexts, the shared CC leg lookup, the assignment waterfall derivation, and the overlay-open calculation) and `PositionDetailContent` (a new component holding the detail-body rendering separate from the sheet orchestration). `callAwayCtx` is populated from the active CC_OPEN leg, the current snapshot's `basisPerShare`, and `position.openedDate`, and participates in the page-level blur/overlay condition so the underlying detail view dims while the sheet is open — locked in by a page-level test that clicks `record-call-away-btn` and asserts both that the sheet appears and that the detail view blurs.

## Architecture decisions

- `recordCallAway()` is its own pure lifecycle function returning `{ phase: 'WHEEL_COMPLETE' }` rather than reusing `closeCoveredCall()` with a flag — call-away ends the wheel at a terminal state; buy-to-close keeps the wheel alive at `HOLDING_SHARES`. Single-purpose engine functions over branching, consistent with `closeCsp`, `recordAssignment`, `openCoveredCall`, `closeCoveredCall` → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `WHEEL_COMPLETE` is a terminal state — no further phase transitions are valid from it; `status = CLOSED`, `closed_date = fillDate`, mirroring the [US-5](./us-5-expire-csp.md) CSP-expiry terminal path → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `LegAction` enum extended from `z.enum(['SELL', 'BUY', 'EXPIRE', 'ASSIGN'])` to `z.enum(['SELL', 'BUY', 'EXPIRE', 'ASSIGN', 'EXERCISE'])`. Reusing `BUY` was rejected because the trader did not buy back the contract — the contract was exercised against them; `EXERCISE` preserves leg-history semantics for downstream analytics. Type-only change — `legs.action` is `TEXT` with no CHECK constraint, so no migration → [../schema/tables.md](../schema/tables.md)
- A dedicated `calculateCallAway()` cost-basis function keeps the engine open/closed and the service thin; the formula uses `basisPerShare` directly (effective basis) and never re-adds `totalPremiumCollected` because premium reductions are already baked in. Inline computation in the service was rejected as a violation of the pure-engine boundary → [../domain/cost-basis.md](../domain/cost-basis.md)
- `fillDate` and `fillPrice` are derived, not user-entered: the service reads `fillDate = ccOpenLeg.expiration` and `fillPrice = ccOpenLeg.strike`, and the renderer shows fill-date as a read-only field with the hint "Derived from your CC — the day shares are delivered to the buyer". Eliminates a whole class of user-entry validation errors; early exercise is explicitly out of scope. The lifecycle engine's `close_date_before_open` guard remains as defense in depth against manipulated payloads → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Multi-contract call-away is rejected at the lifecycle layer (`contracts/multi_contract_unsupported/"Multi-contract call-away is not yet supported"`) because service-layer guards are the authoritative validation layer in this codebase; UI guards alone would be insufficient. Multi-contract support is deferred → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- The final `cost_basis_snapshots` row is **appended**, not mutated: it carries the prior snapshot's `basis_per_share` and `total_premium_collected` plus the newly computed `final_pnl`. Snapshots are append-only history, matching the [US-5](./us-5-expire-csp.md) `expireCspPosition` / [US-6](./us-6-close-csp-early.md) `closeCspPosition` pattern → [../domain/cost-basis.md](../domain/cost-basis.md)
- The CC_CLOSE leg shape: `leg_role = 'CC_CLOSE'`, `action = 'EXERCISE'`, `instrument_type = 'CALL'`, `strike`/`expiration`/`contracts` copied verbatim from the CC_OPEN leg, `premium_per_contract = '0.0000'` (exercise: no premium collected), `fill_price = CC strike`, `fill_date = CC expiration`. The CC_OPEN leg is linked by shared strike + expiration; no `closed_date` column is added to `legs` solely for display affordance → [../schema/tables.md](../schema/tables.md)
- `cycleDays` is calendar days from `position.openedDate → fillDate`; `annualizedReturn` returns the literal `'0.0000'` when `cycleDays <= 0` to avoid divide-by-zero rather than throwing or returning a sentinel → [../domain/cost-basis.md](../domain/cost-basis.md)
- The sheet follows the `createPortal` right-panel pattern (400 px, scrim backdrop, returns `null` when `!open`) used by `OpenCoveredCallSheet`, `AssignmentSheet`, `ExpirationSheet`, and `CloseCcEarlySheet` — rejected the shadcn `Sheet` primitive as inconsistent with the established custom portal pattern.
- The success-state hero card uses `pnlColor(finalPnl)` (green positive, red negative) so the confirmation waterfall and the success view render the sign consistently — extracted to a shared helper during the Refactor pass.
- The irrevocable-action warning reads: "This cannot be undone." / "The position will close as WHEEL_COMPLETE. Full leg history is preserved." (`AlertBox variant="warning"`).
- "Start New Wheel on {ticker} →" navigates via `window.location.hash = '#/new?ticker=' + ticker` followed by `onClose` (mirroring the success-CTA pattern in `CloseCcEarlySuccess`); `<Link>` was acceptable but the imperative pattern was preferred for consistency. Hash-based routing is required by the Electron `file://` shell.
- The IPC handler uses the shared `registerParsedPositionHandler()` helper standardized in the Refactor pass, consistent with `positions:close-cc-early`, `positions:open-cc`, etc. → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- A shared `PositionIdSchema` (`z.string().uuid()`) was extracted during Refactor and is reused across payload schemas including `RecordCallAwayPayloadSchema`; the `LegAction` literal set was named `LEG_ACTION_VALUES` so the `EXERCISE`-enabled action set is explicit at the type level.
- The renderer's preload bridge uses a shared `invoke()` helper (Refactor pass) so all `window.api` methods share the same wrapper; the adapter's error path uses `throwMappedIpcErrors()` (Refactor pass) to consolidate the repeated call-away / covered-call mapping; a shared `FilledOptionCloseLegData` renderer type was extracted for the CC_CLOSE leg shape returned by both `recordCallAway` and `closeCoveredCallEarly`.
- A shared `usePositionMutation()` hook (Refactor pass) centralizes `positionQueryKeys.all` invalidation plus optional `onSuccess` forwarding; both `useRecordCallAway` and `useCloseCoveredCallEarly` delegate to it.
- `PositionDetailPage` was split during Refactor: the new `usePositionDetailSheets()` hook owns the five modal contexts (assignment, expiration, open-CC, close-CC, call-away), the shared CC leg lookup, the assignment waterfall derivation, and the overlay-open calculation; `PositionDetailContent` holds the detail-body rendering. The page itself dropped to 142 lines. A page-level test clicks `record-call-away-btn`, asserts the sheet appears, and verifies the detail view blurs while the sheet is open, locking in the `callAwayCtx` overlay path.

## Contracts touched

- `positions:record-call-away` — IPC handler returning `{ position, leg, costBasisSnapshot, finalPnl, cycleDays, annualizedReturn, basisPerShare }` where `position.phase = 'WHEEL_COMPLETE'`, `position.status = 'CLOSED'`, and `position.closedDate = fillDate`; `costBasisSnapshot` is a new final snapshot row carrying `final_pnl` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `RecordCallAwayPayloadSchema` — Zod schema validating `{ positionId: uuid }`; reuses the shared `PositionIdSchema` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `RecordCallAwayResult` — IPC return type composing the trimmed position fields, `LegRecord`, `CostBasisSnapshotRecord & { finalPnl: string }`, plus `finalPnl`, `cycleDays`, `annualizedReturn`, and `basisPerShare` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `recordCallAway` lifecycle function (`RecordCallAwayInput` / `RecordCallAwayResult`); known error codes `__phase__/invalid_phase/"No open covered call on this position"`, `contracts/multi_contract_unsupported/"Multi-contract call-away is not yet supported"`, `fillDate/close_date_before_open/"Fill date cannot be before the CC open date"` → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `calculateCallAway` cost-basis function (`CallAwayInput` / `CallAwayResult`) — formula `(ccStrike − basisPerShare) × contracts × 100`, `annualizedReturn` 4 dp `ROUND_HALF_UP` with `'0.0000'` guard when `cycleDays <= 0` → [../domain/cost-basis.md](../domain/cost-basis.md)
- Shared lifecycle helpers `requireCcOpenPhase()`, `requireFillDateOnOrAfterOpen()`, and constant `NO_OPEN_COVERED_CALL_MESSAGE` extracted during Refactor and shared by `recordCallAway()` and `closeCoveredCall()` → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Shared cost-basis helpers `SHARES_PER_CONTRACT`, `sharesFromContracts()`, `calculateCycleDays()` extracted during Refactor → [../domain/cost-basis.md](../domain/cost-basis.md)
- Shared `PositionIdSchema` (`z.string().uuid()`) and named `LEG_ACTION_VALUES` constant extracted during Refactor → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Preload binding `window.api.recordCallAway(payload)`; preload now uses a shared `invoke()` helper across all bridge methods → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Renderer adapter `recordCallAway` with `RecordCallAwayPayload` / `RecordCallAwayResponse` and snake_case → camelCase mapping (`position_id → positionId`); error mapping `__phase__ → __phase__`, `contracts → contracts`, `fillDate → fill_date`, `__root__ → __root__`; throws via the shared `throwMappedIpcErrors()` helper extracted during Refactor → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Shared renderer type `FilledOptionCloseLegData` extracted during Refactor and used by both `RecordCallAwayResponse.leg` and `CloseCcPositionResponse.leg`.
- `useRecordCallAway` — TanStack Query mutation hook delegating to the new shared `usePositionMutation()` hook (Refactor pass), which centralizes `positionQueryKeys.all` invalidation + optional `onSuccess` forwarding; `useCloseCoveredCallEarly` also delegates to it.
- `CallAwaySheetProps` — renderer component contract: `{ open, positionId, ticker, ccStrike, ccExpiration, contracts, basisPerShare, positionOpenedDate, onClose }`.
- `LegAction` enum extended to include `'EXERCISE'` (type-only; no migration) → [../schema/tables.md](../schema/tables.md)
- Refactor extractions in the page layer: `usePositionDetailSheets()` (the five modal contexts + shared CC leg lookup + assignment waterfall derivation + overlay-open calculation) and `PositionDetailContent` (detail-body rendering); a shared `ActionButton` renderer in `PositionDetailActions` deduplicates the five conditional action buttons.

## Source files

- `src/main/core/types.ts`
- `src/main/core/types.test.ts`
- `src/main/core/lifecycle.ts`
- `src/main/core/lifecycle.test.ts`
- `src/main/core/costbasis.ts`
- `src/main/core/costbasis.test.ts`
- `src/main/schemas.ts`
- `src/main/schemas.test.ts`
- `src/main/services/record-call-away-position.ts`
- `src/main/services/record-call-away-position.test.ts`
- `src/main/ipc/positions.ts`
- `src/main/ipc/positions.test.ts`
- `src/preload/index.ts`
- `src/renderer/src/api/positions.ts`
- `src/renderer/src/hooks/usePositionMutation.ts`
- `src/renderer/src/hooks/useRecordCallAway.ts`
- `src/renderer/src/hooks/useRecordCallAway.test.ts`
- `src/renderer/src/hooks/useCloseCoveredCallEarly.ts`
- `src/renderer/src/components/CallAwaySheet.tsx`
- `src/renderer/src/components/CallAwaySheet.test.tsx`
- `src/renderer/src/components/CallAwayForm.tsx`
- `src/renderer/src/components/CallAwaySuccess.tsx`
- `src/renderer/src/components/PositionDetailActions.tsx`
- `src/renderer/src/components/PositionDetailActions.test.tsx`
- `src/renderer/src/pages/PositionDetailPage.tsx`
- `src/renderer/src/pages/PositionDetailPage.test.tsx`
- `src/renderer/src/pages/PositionDetailContent.tsx`
- `src/renderer/src/pages/usePositionDetailSheets.ts`
- `e2e/call-away.spec.ts`
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
