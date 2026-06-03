# US-8: Close a covered call early

<!-- generated:from us-8,us-8-pct-fix -->

## Summary

Adds buy-to-close functionality for an open covered call, introducing the lifecycle transition `CC_OPEN → HOLDING_SHARES`. A right-side sheet on the position detail page hosts a React Hook Form + Zod form with a live P&L preview ("X% of max" for profit, "X% above open" for loss, "$0.00 break-even" when equal); on submit the backend writes a single `CC_CLOSE`/`BUY`/`CALL` leg copying strike, expiration, and contracts from the active `CC_OPEN` leg, transitions the position back to `HOLDING_SHARES`, and **does not** create a new cost-basis snapshot — the CC_OPEN snapshot remains current. The wheel continues; only the CC leg closes, not the position. No schema migration required.

## Acceptance criteria

- The "Close CC Early →" button appears in the position detail header only when phase is `CC_OPEN`; the action is rejected from any other phase with "No open covered call on this position".
- A `CC_CLOSE` leg is written with `action = BUY`, `instrument_type = CALL`, and the trader-entered close price as both `fill_price` and `premium_per_contract`; strike, expiration, and contracts are copied verbatim from the active `CC_OPEN` leg (no partial close).
- The position transitions to `HOLDING_SHARES`, `status` stays `ACTIVE`, and `closed_date` stays `null`; the existing CC_OPEN cost-basis snapshot remains the current snapshot (cost basis per share is unchanged on CC close).
- The form shows a live P&L preview: `+$X.XX profit · Y.Y% of max` (green) when `closePrice < openPremium`; `−$X.XX loss · Y.Y% above open` (red) when `closePrice > openPremium`; `$0.00 break-even` (neutral) when equal; nothing when the close-price field is empty or non-positive.
- Close price must be positive; a value of `0` or negative rejects with "Close price must be greater than zero" and no leg is created.
- Fill date is rejected if before the CC_OPEN leg's fill date ("Fill date cannot be before the CC open date") or after the CC's expiration ("Fill date cannot be after the CC expiration date — use Record Expiry instead").
- The IPC response carries `ccLegPnl = (openPremium − closePrice) × contracts × 100` (4 dp, decimal string) for the success-state hero card; the value is not persisted.

## What was built

The pure lifecycle engine gains `closeCoveredCall(input)`: it validates phase is `CC_OPEN`, close price is positive, and `openFillDate ≤ fillDate ≤ expiration`, then returns `{ phase: 'HOLDING_SHARES' }`. The cost-basis engine gains `calculateCcClose(input)` with formula `ccLegPnl = round4((openPremium − closePrice) × contracts × 100)` using `decimal.js` with `ROUND_HALF_UP`. Both functions are named separately from their CSP counterparts (`closeCsp`, `calculateCspClose`) to communicate domain intent even though the close-price-positivity guard and the math are identical to the CSP versions — a shared `requirePositiveClosePrice` helper was extracted during refactor and is used by both lifecycle functions, with the message normalised to "Close price must be greater than zero".

`closeCoveredCallPosition` orchestrates the write inside one SQLite transaction: it loads the active `CC_OPEN` leg to source strike/expiration/contracts/open premium/open fill date, calls the lifecycle and cost-basis engines, inserts the `CC_CLOSE`/`BUY`/`CALL` leg, and updates `positions.phase` to `HOLDING_SHARES`. **No `cost_basis_snapshots` row is inserted or updated** — the CC_OPEN snapshot already reflects the premium reduction, and the wheel is still active so no final P&L exists. The IPC handler `positions:close-cc-early` is registered via the shared `handleIpcCall('positions_close_cc_early_unhandled_error', ...)` wrapper and returns `{ ok: true, position, leg, ccLegPnl }`. `fillDate` defaults to today when omitted.

The renderer adapter `closeCoveredCallEarly` maps a snake_case payload (`position_id`, `close_price_per_contract`, `fill_date`) to camelCase IPC fields via `IPC_TO_FORM_FIELD`. A `useCloseCoveredCallEarly` mutation hook invalidates `positionQueryKeys.all` on success and forwards an `onSuccess(data)` callback to drive the sheet's success-state transition. `CloseCcEarlySheet` is a portal-based right-side panel (400 px, `SIDEBAR_WIDTH=200` left offset) mirroring `OpenCoveredCallSheet`; it delegates to `CloseCcEarlyForm` (position summary card, close-price + fill-date inputs, live preview, irrevocable-action warning, footer) and `CloseCcEarlySuccess` (hero `+$X.XX` / `−$X.XX` P&L card, result summary including the literal `CC_OPEN → HOLDING_SHARES` string and a `PhaseBadge` pair, and a full-width gold "Sell New Covered Call on {ticker} →" CTA whose actual open-CC wire-up is deferred to a later story — currently it just calls `onClose`). The pure `CcPnlPreview` UI component lives in `src/renderer/src/components/ui/`. The contracts field on the form is read-only (no partial close). The conditional entry-point button lives on `PositionDetailActions`; `PositionDetailPage` owns `closeCcCtx` state populated from the active CC_OPEN leg plus the current snapshot's `basisPerShare`. Front-end validation duplicates the lifecycle engine's date and price guards so inline errors render without an IPC round-trip; the engine remains authoritative.

## Revisions

- **us-8** (original): shipped `closeCoveredCall` lifecycle + `calculateCcClose`, the `positions:close-cc-early` handler/service writing a single `CC_CLOSE` leg and transitioning to `HOLDING_SHARES` (no new cost-basis snapshot), the 400 px `CloseCcEarlySheet` with live `CcPnlPreview`, the irrevocable-action warning, and the success state with hero P&L card and "Sell New Covered Call" CTA. Refactor extracted the shared `requirePositiveClosePrice` lifecycle helper between `closeCsp` and `closeCoveredCall` and normalised the message to "Close price must be greater than zero".
- **us-8-pct-fix**: corrected the profit-branch percentage formula in `CcPnlPreview` from `closePrice / openPremium × 100` ("% of premium paid back") to `(openPremium − closePrice) / openPremium × 100` — the industry-standard "% of max profit captured" framing popularised by tastytrade that wheel traders use to apply the 50%-of-max close rule, and the metric called out in US-8's AC3 technical requirements. The old formula produced incorrect labels for every close price except the exact 50% midpoint (e.g. close `$1.10` on a `$2.30` open: corrected `52.2% of max` vs. old `47.8% of max`); at `$1.15` both formulas coincidentally agree at `50.0%`, which is why the original e2e fixture failed to catch the bug. Renderer-only one-line change in `CcPnlPreview.tsx` plus updated unit and e2e test fixtures (e2e price moved off the `$1.15` midpoint to `$1.10` to make the assertion regression-proof). Loss-branch "% above open" label left intact as an intentional enhancement beyond the original AC. No new entities, contracts, IPC payloads, or schema changes.

## Architecture decisions

- Lifecycle owns a dedicated `closeCoveredCall()` function rather than overloading an existing transition; the engine is a pure state machine where each transition gets its own named function (matching `closeCsp`, `recordAssignment`, `openCoveredCall`) → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Cost basis on CC close: **no new snapshot row is inserted** and the existing CC_OPEN snapshot is not mutated; the wheel is still active and the CC_OPEN snapshot already reflects the premium reduction, so a `final_pnl`-style snapshot would be incorrect → [domain/cost-basis.md](../domain/cost-basis.md)
- `calculateCcClose()` is its own function rather than a reuse of `calculateCspClose()`; the formula is identical but a dedicated name communicates domain intent and keeps the engine open/closed → [domain/cost-basis.md](../domain/cost-basis.md)
- `ccLegPnl` is computed by the service and returned on the IPC envelope, never persisted; P&L is always derivable from leg history, and adding a column would bloat the schema → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Fill-date validation (`fillDate ≥ openFillDate`, `fillDate ≤ expiration`) lives in the lifecycle engine as pure date-string comparisons; both bounds are enforced because the story ACs specify both error cases → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `positions:close-cc-early` registered via the shared `handleIpcCall` wrapper with label `positions_close_cc_early_unhandled_error`, returning the standard `{ ok, ... } | { ok: false, errors }` envelope → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Renderer adapter is snake_case at the boundary and maps to camelCase IPC fields via `IPC_TO_FORM_FIELD`; error fields `closePricePerContract` / `fillDate` map back to `close_price_per_contract` / `fill_date` → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- CC close leg shape: `leg_role = 'CC_CLOSE'`, `action = 'BUY'`, `instrument_type = 'CALL'`, `fill_price` equals `premium_per_contract` (both = close price), strike/expiration/contracts copied verbatim from the CC_OPEN leg; reuses existing `legs` and `positions` tables with no migration — `CC_CLOSE` is already in the `LegRole` enum and `HOLDING_SHARES` is already a valid `positions.phase` → [schema/tables.md](../schema/tables.md)
- Contracts must match the open CC; partial close is not supported (the contracts form field is read-only).
- IPC response keeps `position.status = 'ACTIVE'` and `position.closedDate = null` because the wheel continues — only the CC leg closes, not the position.
- The P&L preview is computed client-side (pure arithmetic via `decimal.js`) — no debounced IPC round-trip; profit branch uses `(openPremium − closePrice) / openPremium × 100` ("% of max profit captured", tastytrade-standard framing used to apply the 50%-of-max close rule); loss branch uses `(closePrice − openPremium) / openPremium × 100` ("% above open"); the preview renders `null` when the close-price input is empty or non-positive.
- The sheet follows the `OpenCoveredCallSheet` portal pattern (`createPortal` with a fixed right-panel overlay, header/body/footer, form-state → success-state transition) rather than the shadcn `Sheet` primitive, to stay consistent with `AssignmentSheet`, `ExpirationSheet`, and `OpenCoveredCallSheet`.
- The irrevocable-action warning (`AlertBox variant="warning"`) reads: "This cannot be undone. A CC_CLOSE leg will be recorded. The position returns to Holding Shares. Full leg history is preserved."
- The success state renders both a literal `CC_OPEN → HOLDING_SHARES` string and the `PhaseBadge` pair so unit tests, E2E assertions, and the visual design stay aligned; the "Sell New Covered Call on {ticker} →" CTA currently only calls `onClose` (open-CC wire-up from the success-state CTA is deferred).
- Front-end validation duplicates the lifecycle engine's date and price guards so inline errors render without an IPC round-trip; the engine remains the authoritative source of truth.
- `requirePositiveClosePrice` lifecycle helper extracted during refactor and shared by `closeCsp` and `closeCoveredCall`; consistent with the existing `requirePositiveStrike` / `requirePositivePremium` pattern → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)

## Contracts touched

- `positions:close-cc-early` — IPC handler returning `{ position, leg, ccLegPnl }` where `position.phase = 'HOLDING_SHARES'`, `position.status = 'ACTIVE'`, `position.closedDate = null`, and `ccLegPnl` is a 4-dp decimal string → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `CloseCcPayloadSchema` — Zod schema for `{ positionId, closePricePerContract, fillDate? }` with UUID and positive-number constraints → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `CloseCcPositionResult` — IPC return type composing the trimmed position fields, `LegRecord`, and `ccLegPnl: string` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `closeCoveredCall` lifecycle function (`CloseCoveredCallInput` / `CloseCoveredCallResult`); known error codes `__phase__/invalid_phase`, `closePricePerContract/must_be_positive`, `fillDate/close_date_before_open`, `fillDate/close_date_after_expiration` → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `calculateCcClose` cost-basis function (`CcCloseInput` / `CcCloseResult`) — formula `(openPremium − closePrice) × contracts × 100`, 4 dp `ROUND_HALF_UP` → [../domain/cost-basis.md](../domain/cost-basis.md)
- Preload bridge: `window.api.closeCoveredCallEarly(payload)` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Renderer adapter `closeCoveredCallEarly` — snake_case payload, camelCase response, error mapping via `IPC_TO_FORM_FIELD` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `useCloseCoveredCallEarly` hook — TanStack Query mutation invalidating `positionQueryKeys.all`, forwards `onSuccess` callback to drive sheet success state.
- `CcPnlPreview` — pure renderer UI component; profit branch uses `(openPremium − closePrice) / openPremium × 100`, loss branch uses `(closePrice − openPremium) / openPremium × 100`, renders `null` for empty/non-positive close price.
- Shared lifecycle helper `requirePositiveClosePrice` extracted during refactor, used by both `closeCsp()` and `closeCoveredCall()` → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)

## Source files

- `src/main/core/lifecycle.ts`
- `src/main/core/lifecycle.test.ts`
- `src/main/core/costbasis.ts`
- `src/main/core/costbasis.test.ts`
- `src/main/schemas.ts`
- `src/main/services/close-covered-call-position.ts`
- `src/main/services/close-covered-call-position.test.ts`
- `src/main/services/positions.ts`
- `src/main/ipc/positions.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/api/positions.ts`
- `src/renderer/src/hooks/useCloseCoveredCallEarly.ts`
- `src/renderer/src/hooks/useCloseCoveredCallEarly.test.ts`
- `src/renderer/src/components/ui/CcPnlPreview.tsx`
- `src/renderer/src/components/ui/CcPnlPreview.test.tsx`
- `src/renderer/src/components/CloseCcEarlySheet.tsx`
- `src/renderer/src/components/CloseCcEarlySheet.test.tsx`
- `src/renderer/src/components/CloseCcEarlyForm.tsx`
- `src/renderer/src/components/CloseCcEarlyForm.test.tsx`
- `src/renderer/src/components/CloseCcEarlySuccess.tsx`
- `src/renderer/src/components/CloseCcEarlySuccess.test.tsx`
- `src/renderer/src/components/PositionDetailActions.tsx`
- `src/renderer/src/pages/PositionDetailPage.tsx`
- `e2e/close-cc-early.spec.ts`
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
