# US-5: Record CSP expiration

<!-- generated:from us-5,missing-ac -->
## Summary

Adds the expiration-worthless path to the wheel lifecycle. On or after the option's expiration date a trader with a `CSP_OPEN` position clicks "Record Expiration →" in the detail header, confirms in a right-side `Sheet`, and the wheel transitions directly to `WHEEL_COMPLETE` with 100% of the collected premium captured. The expire leg is written with `action = 'EXPIRE'`, `premium_per_contract = '0.0000'`, `fill_price = NULL`, and `fill_date` set to the option's expiration date (not "today"). The success state offers a one-click "Open new wheel on {ticker}" shortcut that navigates to the New Wheel form with the ticker pre-filled via the wouter query string. The positions list is updated to split active and closed positions into separate sections so completed wheels don't crowd live decisions.

## Acceptance criteria

- Recording expiration on or after the expiration date transitions the position to `WHEEL_COMPLETE`, sets `status = CLOSED` and `closed_date`, writes an expire leg, and snapshots `final_pnl = totalPremiumCollected` (100% of premium captured).
- The success state surfaces an "Open new wheel on {ticker}" shortcut that navigates to the New Wheel form with `?ticker={ticker}` in the hash query string and pre-fills the form.
- Recording expiration is rejected when the position is not in `CSP_OPEN` phase ("Position is not in CSP_OPEN phase").
- Recording expiration before the expiration date is rejected ("Cannot record expiration before the expiration date"); same-day (`referenceDate === expirationDate`) is allowed.
- After expiration, the positions list shows the position with the `WHEEL_COMPLETE` phase badge in the Closed section; the active list no longer contains it.

## What was built

The pure lifecycle engine gains `expireCsp(input)`: it validates phase is `CSP_OPEN` and `referenceDate >= expirationDate`, then returns `{ phase: 'WHEEL_COMPLETE' }`. The signature mirrors `closeCsp` and keeps all date validation in the engine so the service stays a thin orchestrator. The cost-basis engine gains `calculateCspExpiration({ openPremiumPerContract, contracts })` returning `finalPnl = openPremiumPerContract × contracts × 100` and the literal constant `pnlPercentage = '100.0000'` — a separate function from `calculateCspClose` because expiration captures the full premium and the percentage is not derived from a close price.

`expireCspPosition` orchestrates the write inside one SQLite transaction. It loads context via `getPosition`, copies strike/expiration/contracts/`option_type` from the active `CSP_OPEN` leg, calls the lifecycle and cost-basis engines, then inserts the expire leg (`leg_role = 'EXPIRE'`, `action = 'EXPIRE'`, `premium_per_contract = '0.0000'`, `fill_price = NULL`, `fill_date` = the open leg's `expiration`), updates the position row (`phase = WHEEL_COMPLETE`, `status = CLOSED`, `closed_date`), and inserts a new `cost_basis_snapshots` row whose `basis_per_share` and `total_premium_collected` are copied from the most recent prior snapshot, `final_pnl` equals `total_premium_collected`, and `snapshot_at = now + 1ms` so it sorts after the opening snapshot under the existing `ORDER BY snapshot_at DESC LIMIT 1` query. The opening snapshot is never mutated.

The IPC handler `positions:expire-csp` is registered with the shared handler wrapper using `ExpireCspPayloadSchema` and returns `{ ok: true, position, leg, costBasisSnapshot }`. Error envelopes follow the close-CSP convention: `__phase__` for phase mismatch, `expiration` for the date-too-early check, `__root__` for not-found/internal.

On the renderer, the `expirePosition` API adapter maps snake_case (`position_id`, `expiration_date_override`) to camelCase IPC fields; `useExpirePosition` wraps it in a TanStack Query mutation that invalidates `['positions']` on success so both the list and detail entries refresh. `ExpirationSheet` is a right-side shadcn `Sheet` that manages two internal states — `'confirmation'` and `'success'` — and is installed via `pnpm dlx shadcn@latest add sheet --yes`. Confirmation shows the leg summary; success shows the captured P&L, an "Open new wheel on {ticker}" button (`navigate('/new?ticker=' + ticker)`), and a "View full position history" link that closes the sheet. `NewWheelPage` reads the pre-fill via wouter's `useSearch()` and passes it as `defaultTicker` to `NewWheelForm`'s `useForm` `defaultValues`. `PositionsListPage` and `PositionCard` are updated to split positions into Active and Closed sections; closed cards render at `opacity: 0.55`, use the project green `WHEEL_COMPLETE` "Complete ✓" badge (no pulse animation), and surface "Final P&L" in green in place of the live "Premium" label. `PositionCard` auto-detects closed state via `closed = isClosed ?? item.status === 'CLOSED'`, which also drives the `data-testid="position-card-closed"` marker. A shared `PHASE_COLOR` constant in `src/renderer/src/lib/phase.ts` is consumed by both `PositionCard` and `PositionDetailPage` (addressing the earlier US-4 note about independently maintained phase-color mappings).

## Revisions

- **us-5** (original): shipped the `expireCsp` lifecycle function + `calculateCspExpiration` cost-basis function, the `positions:expire-csp` handler/service writing a single `EXPIRE` leg and an appended snapshot whose `final_pnl` equals `total_premium_collected`, the right-side `ExpirationSheet` with confirmation and success states, the "Open new wheel on {ticker}" wouter query-string shortcut, the Active/Closed split on `PositionsListPage`, and the `LegAction` enum extension to `'EXPIRE'` (type-only, no migration).
- **missing-ac**: fixed a one-line bug in `ExpirationSheet.handleConfirmExpiration` that silently disabled the `too_early` guard. The mutate payload was passing `expiration_date_override: expiration` (the option's own expiration date) unconditionally, which the service used as `referenceDate` and which always satisfied `referenceDate >= expirationDate` — bypassing the AC "Cannot record expiration before the expiration date". The fix removes the `expiration_date_override` field from the payload entirely so the service's `referenceDate` defaults to today and the existing lifecycle guard fires correctly. The sheet now also renders the server-side `too_early` error message inline in the sheet body when the mutation rejects. Renderer-only change in `ExpirationSheet.tsx`; no IPC contract, schema, or service change.

## Architecture decisions

- Phase transitions directly from `CSP_OPEN → WHEEL_COMPLETE` in one step; no intermediate `CSP_EXPIRED` state is surfaced, since the position is immediately closed → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Date validation (`referenceDate >= expirationDate`, allowing same-day) lives in the pure lifecycle engine `expireCsp`, not in the service layer — mirrors `closeCsp` and preserves the core/service separation → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Cost basis on expiration is its own function `calculateCspExpiration`, not `calculateCspClose` with `closePrice = 0`; expiration captures 100% of premium and `pnlPercentage` is the literal `'100.0000'` (kept explicit, not derived) → [../domain/cost-basis.md](../domain/cost-basis.md)
- Each expired wheel is a self-contained lifecycle; re-opening a CSP on the same ticker creates a new independent wheel rather than resuming the prior one — keeps per-wheel P&L whole and history meaningful.
- `LegAction` enum extended from `z.enum(['SELL', 'BUY'])` to `z.enum(['SELL', 'BUY', 'EXPIRE'])`; the expire leg uses `action = 'EXPIRE'` and `leg_role = 'EXPIRE'`. Type-only change — the `legs.action` column has no CHECK constraint, so no migration → [../schema/tables.md](../schema/tables.md)
- Expire-leg shape: `premium_per_contract = '0.0000'` ("expired worthless") with `fill_price = NULL` ("no fill ever occurred"); `fill_date` is set to the open leg's `expiration` (not "today") regardless of when the user records the expiration → [../schema/tables.md](../schema/tables.md)
- New `cost_basis_snapshots` row is appended with `snapshot_at = now + 1ms` so the latest-snapshot query sorts it after the opening snapshot; the opening snapshot is never mutated → [../domain/cost-basis.md](../domain/cost-basis.md)
- `positions:expire-csp` follows the standard `{ ok, ... } | { ok: false, errors }` envelope; error field naming matches the close-CSP convention (`__phase__`, `__root__`, `expiration`) → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Renderer adapter is snake_case at the boundary and maps `position_id → positionId`, `expiration_date_override → expirationDateOverride` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Confirmation UI uses the shadcn `Sheet` primitive (Radix Dialog under the hood) with `<SheetContent side="right">`; this supplies scrim overlay, slide-in animation, Escape dismissal, and focus management without custom CSS. `ExpirationSheet` wraps the primitive and owns two internal states (`'confirmation'`, `'success'`).
- Ticker pre-fill propagates via wouter's `useSearch()` query string (`/new?ticker=AAPL`) rather than a global store or Context — idiomatic and stateless across the navigation hop.
- Positions list splits into Active and Closed sections (closed cards de-emphasised at `opacity: 0.55`, green `WHEEL_COMPLETE` "Complete ✓" badge with no pulse, "Final P&L" surfaced in green). A separate route for closed positions was rejected as over-engineering for Phase 1.
- `useExpirePosition` invalidates `queryKey: ['positions']` on success so both list and detail entries refresh after the transaction commits.

## Contracts touched

- `positions:expire-csp` — IPC handler returning `{ position, leg, costBasisSnapshot }`; the snapshot carries `finalPnl` equal to `totalPremiumCollected` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `ExpireCspPayloadSchema` — Zod schema validating `{ positionId: uuid, expirationDateOverride?: string }` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `ExpireCspInput` / `ExpireCspResult` — pure lifecycle engine function signature (`currentPhase`, `expirationDate`, `referenceDate` → `{ phase: 'WHEEL_COMPLETE' }`) → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `CspExpirationInput` / `CspExpirationResult` — pure cost-basis engine function signature (`openPremiumPerContract`, `contracts` → `{ finalPnl, pnlPercentage: '100.0000' }`) → [../domain/cost-basis.md](../domain/cost-basis.md)
- `ExpireCspPositionResult` — service / IPC return shape (`position`, `leg`, `costBasisSnapshot & { finalPnl }`) → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Preload binding `expirePosition(payload)` plus `IpcExpireCspPayload` and the `expirePosition` method declared on `Window.api` in `src/preload/index.d.ts` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Renderer adapter `expirePosition` with `ExpireCspPayload` / `ExpireCspResponse` and snake_case → camelCase mapping → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `useExpirePosition` — TanStack Query mutation hook invalidating `['positions']` on success.
- `LegAction` enum extended to include `'EXPIRE'` (type-only; no migration) → [../schema/tables.md](../schema/tables.md)
- Shared renderer constant `PHASE_COLOR` in `src/renderer/src/lib/phase.ts` consumed by `PositionCard` and `PositionDetailPage`.

## Source files

- `src/main/core/lifecycle.ts`
- `src/main/core/costbasis.ts`
- `src/main/core/types.ts`
- `src/main/schemas.ts`
- `src/main/services/expire-csp-position.ts`
- `src/main/services/positions.ts`
- `src/main/ipc/positions.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/api/positions.ts`
- `src/renderer/src/hooks/useExpirePosition.ts`
- `src/renderer/src/lib/phase.ts`
- `src/renderer/src/components/ui/sheet.tsx`
- `src/renderer/src/components/ExpirationSheet.tsx`
- `src/renderer/src/components/PositionCard.tsx`
- `src/renderer/src/components/NewWheelForm.tsx`
- `src/renderer/src/pages/PositionDetailPage.tsx`
- `src/renderer/src/pages/PositionsListPage.tsx`
- `src/renderer/src/pages/NewWheelPage.tsx`
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
