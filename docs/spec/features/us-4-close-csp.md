# US-4: Close a CSP early

<!-- generated:from us-4,missing-ac -->

## Summary

Adds the ability to close a cash-secured put before expiration by recording a buy-to-close transaction. The flow validates the position is in `CSP_OPEN`, computes final P&L, writes a close leg plus a new cost-basis snapshot, and transitions the position to `CSP_CLOSED_PROFIT` or `CSP_CLOSED_LOSS`. The detail page renders a live P&L preview as the trader types — no IPC round-trip until submission.

## Acceptance criteria

- P&L preview updates in real time as the close price is entered (per-contract net, total, % of premium captured).
- Closing below open premium transitions the position to `CSP_CLOSED_PROFIT`; at or above transitions to `CSP_CLOSED_LOSS` (breakeven counts as loss).
- A `CSP_CLOSE` leg is written with `action = BUY`, copying strike/expiration/contracts from the open leg and using the close price as `fill_price` / `premium_per_contract`.
- A new `cost_basis_snapshots` row is inserted with `final_pnl = (openPremium − closePrice) × contracts × 100`; the opening snapshot is never mutated.
- The position's `phase`, `status = CLOSED`, and `closed_date` are updated; the trader is navigated back to the positions list on success.
- Close is rejected if the phase is not `CSP_OPEN`, the close price is not positive, the fill date is before the open fill date, or the fill date is after expiration. Fill on the expiration date is valid.

## What was built

A new `positions:get` IPC handler hydrates the detail page with the position, active leg, and latest cost-basis snapshot — `positions:list` was kept lean. A second handler, `positions:close-csp`, drives the close transaction: the service reads position context via a `getPosition(db, ...)` helper, hands plain values to pure lifecycle and cost-basis engines, then writes the close leg, new snapshot, and position update inside one transaction. The lifecycle engine owns date validation (mirroring how `openWheel()` works) so the service layer stays a thin orchestrator. The renderer adds `usePosition` / `useClosePosition` hooks and a `CloseCspForm` (React Hook Form + Zod) with a locally computed P&L preview, hosted on a minimal build-out of `PositionDetailPage`.

## Revisions

- **us-4** (original): shipped the `closeCsp` lifecycle function with phase + date guards, the `cspClose` cost-basis function, the `positions:get` and `positions:close-csp` IPC handlers, the `getPosition` / `closeCspPosition` services orchestrating the close transaction, and the `CloseCspForm` + minimal `PositionDetailPage` build-out with a client-side P&L preview. Refactor extracted `mapIpcErrors` in the renderer adapter, the shared `handleIpcCall` wrapper for IPC handlers, and the `computePreview` helper above `CloseCspForm`.
- **missing-ac**: closed the AC gap "trader can record fill date for the close" by adding the optional `fill_date` input to `CloseCspForm`. The backend pipeline already accepted `fillDate` and the lifecycle engine already enforced `closeFillDate >= openFillDate` and `closeFillDate <= expiration` — the form simply offered no way to send a non-default fill date, so the service defaulted to today and the date guards never tripped. Renderer-only change: extended `CloseCspFormProps` with `openFillDate` and `expiration` (sourced from `activeLeg` already in scope on `PositionDetailPage`), extended the Zod form schema with an optional `fill_date` matching `/^\d{4}-\d{2}-\d{2}$/`, mapped server `fillDate` errors back to the form's `fill_date` field via the existing `IPC_TO_FORM_FIELD` mapper, and left empty/blank values to continue defaulting to today server-side. No changes to the lifecycle engine, the service, the IPC handler, `CloseCspPayloadSchema`, or the database — the validation logic and error contracts were already in place.

## Architecture decisions

- Date validations (`closeFillDate >= openFillDate`, `closeFillDate <= expiration`) live in the lifecycle engine, not the service layer → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Close emits `CSP_CLOSED_PROFIT` vs `CSP_CLOSED_LOSS` based on `netPnl > 0`; breakeven classifies as loss → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Cost basis on close: append a new `cost_basis_snapshots` row with `final_pnl`; never mutate the opening snapshot → [domain/cost-basis.md](../domain/cost-basis.md)
- `pnl_percentage` is derivable per-contract and is not stored; no schema migration required → [domain/cost-basis.md](../domain/cost-basis.md)
- New IPC handlers `positions:get` and `positions:close-csp` follow the standard `{ ok, ... } | { ok: false, errors }` envelope and use the shared `handleIpcCall` wrapper → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Close leg shape: `leg_role = 'CSP_CLOSE'`, `action = 'BUY'`, `option_type = 'PUT'`, copying strike/expiration/contracts from the opening leg → [schema/tables.md](../schema/tables.md)
- P&L preview is computed in the renderer as the user types — no debounced IPC preview call.
  - All inputs (open premium, contracts) are already on the detail page; local math is instant and avoids round-trip complexity.
- `PositionDetailPage` is built to the minimum needed to host the close form; broader detail work is deferred to a later story.

## Contracts touched

- `positions:get` — IPC handler returning `{ position, activeLeg, costBasisSnapshot }` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `positions:close-csp` — IPC handler returning the updated position, new close leg, and new cost-basis snapshot → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `CloseCspPayloadSchema` — Zod schema validating `{ positionId, closePricePerContract, fillDate? }` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `CloseCspInput` / `CloseCspResult` — lifecycle engine function signature → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `CspCloseInput` / `CspCloseResult` — cost basis engine function signature → [../domain/cost-basis.md](../domain/cost-basis.md)
- Renderer adapter snake_case ↔ camelCase mapping for `getPosition` / `closePosition` payloads and error fields → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)

## Source files

- `src/main/core/lifecycle.ts`
- `src/main/core/lifecycle.test.ts`
- `src/main/core/costbasis.ts`
- `src/main/core/costbasis.test.ts`
- `src/main/schemas.ts`
- `src/main/services/get-position.ts`
- `src/main/services/get-position.test.ts`
- `src/main/services/close-csp-position.ts`
- `src/main/services/close-csp-position.test.ts`
- `src/main/services/positions.ts`
- `src/main/ipc/positions.ts`
- `src/main/ipc/utils.ts`
- `src/preload/index.ts`
- `src/renderer/src/api/positions.ts`
- `src/renderer/src/hooks/usePosition.ts`
- `src/renderer/src/hooks/useClosePosition.ts`
- `src/renderer/src/components/CloseCspForm.tsx`
- `src/renderer/src/components/CloseCspForm.test.tsx`
- `src/renderer/src/pages/PositionDetailPage.tsx`
- `src/renderer/src/pages/PositionDetailPage.test.tsx`
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
