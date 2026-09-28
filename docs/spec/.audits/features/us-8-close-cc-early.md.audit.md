---
page: docs/spec/features/us-8-close-cc-early.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/features/us-8-close-cc-early.md

## Verified (16)

- ✓ All 25 listed source files exist, including `src/main/services/close-covered-call-position.ts`, `src/renderer/src/components/ui/CcPnlPreview.tsx` and `e2e/close-cc-early.spec.ts`.
- ✓ IPC handler `positions:close-cc-early` registered at `src/main/ipc/positions.ts:107` with label `positions_close_cc_early_unhandled_error` (`:108`) via `registerParsedPositionHandler`, which wraps `handleIpcCall`.
- ✓ `closeCoveredCall()` at `src/main/core/lifecycle.ts:331`; uses `requirePositiveClosePrice` (`:334`); messages "Fill date cannot be before the CC open date" (`:339`) and "Fill date cannot be after the CC expiration date — use Record Expiry instead" (`:346`), code `close_date_after_expiration` (`:345`).
- ✓ Shared `requirePositiveClosePrice` helper at `src/main/core/lifecycle.ts:51`, used by `closeCsp` (`:117`) and `closeCoveredCall` (`:334`).
- ✓ Wrong-phase message constant `'No open covered call on this position'` at `src/main/core/lifecycle.ts:33`.
- ✓ `calculateCcClose()` at `src/main/core/costbasis.ts:195`; `round4((open − close) × sharesFromContracts(contracts))`, returned `.toFixed(4)` (`:198-199`). `calculateCspClose` is separate at `costbasis.ts:71`.
- ✓ `CloseCcPayloadSchema` at `src/main/schemas.ts:304` — `positionId`, `closePricePerContract: z.number().positive()`, `fillDate?`.
- ✓ Service inserts `'CC_CLOSE', 'BUY', 'CALL'` leg (`close-covered-call-position.ts:65`), updates phase to `HOLDING_SHARES` (`:79`), no `cost_basis_snapshots` write in the file (grep), returns `ccLegPnl` (`:111`); `fillDate = payload.fillDate ?? today` (`:17`).
- ✓ Preload `closeCoveredCallEarly` → `positions:close-cc-early` (`src/preload/index.ts:25`); declared in `src/preload/index.d.ts:685`.
- ✓ Renderer adapter `closeCoveredCallEarly` at `src/renderer/src/api/positions.ts:350`; `IPC_TO_FORM_FIELD` maps `closePricePerContract → close_price_per_contract` (`positions.ts:78-81`).
- ✓ `useCloseCoveredCallEarly` delegates to `usePositionMutation` (`useCloseCoveredCallEarly.ts:8`), which invalidates `positionQueryKeys.all` (`usePositionMutation.ts:20`).
- ✓ `CcPnlPreview` profit branch "% of max" using `(openPremium − closePrice)/openPremium` (`CcPnlPreview.tsx:33,39`), loss "% above open" (`:48`), "$0.00 break-even" (`:51`), null for empty/non-positive (`:14,19`) — matches us-8-pct-fix.
- ✓ e2e uses the `$1.10` off-midpoint fixture expecting 52.2% (`e2e/close-cc-early.spec.ts:84-86`).
- ✓ Irrevocable warning copy "This cannot be undone. A CC_CLOSE leg will be recorded…" (`CloseCcEarlyForm.tsx:138`).
- ✓ Success CTA `Sell New Covered Call on ${ticker} →` calls `onClose` (`CloseCcEarlySuccess.tsx:94-95`); sheet uses `createPortal` (`CloseCcEarlySheet.tsx:2,88`).
- ✓ "Close CC Early →" button rendered only inside `phase === 'CC_OPEN'` (`PositionDetailActions.tsx:53-58`).

## Drift (1)

- ✗ Page says "`PositionDetailPage` owns `closeCcCtx` state populated from the active CC_OPEN leg plus the current snapshot's `basisPerShare`". The state now lives in the extracted hook `src/renderer/src/pages/usePositionDetailSheets.ts:112` (populated at `:159-166`); `PositionDetailPage.tsx:83` only destructures it. Suggested fix: name the hook and add it to Source files.

## Unverifiable (2)

- ? 400 px sheet width and `SIDEBAR_WIDTH=200` left offset — no literal `400`/`SIDEBAR_WIDTH` in `CloseCcEarlySheet.tsx`; may live in shared styling. Flag for human review.
- ? Front-end validation "duplicates the lifecycle engine's date and price guards" — narrative; not mechanically checked.

## Missing files (0)

- ✓ `../domain/wheel-lifecycle.md`, `../domain/cost-basis.md`, `../contracts/ipc-handlers.md`, `../schema/tables.md` resolve.
