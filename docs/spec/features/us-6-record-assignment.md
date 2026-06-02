# US-6: Record a CSP assignment

<!-- generated:from us-6 -->
## Summary

Adds the assignment flow that transitions a `CSP_OPEN` position to `HOLDING_SHARES` when the broker assigns shares to the trader. A right-side `AssignmentSheet` reached from the position detail page collects the assignment date, renders a full premium waterfall (one line per CSP and roll credit), writes an `ASSIGN` event leg plus a new cost-basis snapshot, and ends on a success state that nudges the trader to wait 1–3 days before opening the first covered call. The position keeps `status='ACTIVE'` — only `phase` and `updated_at` change.

> **Refactor status: pending.** `plans/us-6/` does not contain a `refactor-phase-results.md` yet, so this page reflects plan-phase decisions only. Re-run `/update-spec us-6` once refactor results are recorded.

## Acceptance criteria

- Submitting the form with a valid assignment date transitions the position to `HOLDING_SHARES`, shows `contracts × 100` shares held at the assignment strike, and displays the effective cost basis (`strike − Σ premium`) per share.
- The summary card renders the premium waterfall as `Assignment strike $X` then one `− CSP premium $Y` or `− Roll credit $Z` line per CSP/roll leg, ending in `= Effective cost basis $...`.
- Cost basis accounts for every CSP open premium and every roll credit collected; e.g. strike `$175` with `$2.00` CSP premium and `$1.50` roll credit yields `$171.50` per share.
- A future assignment date triggers a client-side gold soft warning ("This date is in the future — are you sure?"); the Confirm Assignment button stays enabled and the backend accepts the date.
- Submitting without an assignment date raises "Assignment date is required" and no leg is written.
- Submitting an assignment date before the CSP open date raises "Assignment date cannot be before the CSP open date" and no leg is written; the boundary case `assignmentDate === openFillDate` is valid.
- Attempting to record an assignment on any phase other than `CSP_OPEN` is rejected with "Assignment can only be recorded on a CSP_OPEN position".
- The success state shows the strategic nudge ("Many traders wait 1–3 days for a bounce…") above an "Open Covered Call" CTA.

## What was built

The pure lifecycle engine gains `recordAssignment({ currentPhase, assignmentDate, openFillDate })`: it requires `currentPhase === 'CSP_OPEN'` and `assignmentDate >= openFillDate` (ISO string compare, matching `closeCsp` / `expireCsp`), then returns `{ phase: 'HOLDING_SHARES' }`. The cost-basis engine gains `calculateAssignmentBasis({ strike, contracts, premiumLegs })`, which sums per-share premium across `CSP_OPEN` and `ROLL_TO` legs using `decimal.js` (`ROUND_HALF_UP`, 4 dp) and returns `basisPerShare`, `totalPremiumCollected`, `sharesHeld = contracts × 100`, and a `premiumWaterfall` array (`{ label, amount }`) where `label` is `'Roll credit'` for `ROLL_TO` legs and `'CSP premium'` otherwise. Returning the waterfall from the engine keeps display ordering pure and out of the renderer.

`assignCspPosition` orchestrates the write inside one SQLite transaction. It loads context via `getPosition`, hands plain values to both engines, then inserts an `ASSIGN` event leg (`leg_role='ASSIGN'`, `action='ASSIGN'`, `instrument_type='STOCK'`, `premium_per_contract='0.0000'`, `fill_price=NULL`, `fill_date=assignmentDate`, strike/expiration/contracts copied from the open CSP leg) and a new `cost_basis_snapshots` row with `final_pnl=NULL`. The position row's only changes are `phase → HOLDING_SHARES` and `updated_at`; `status` stays `ACTIVE` and `closed_date` stays `NULL`. The IPC handler `positions:assign-csp` is registered with the standard `handleIpcCall` wrapper using `AssignCspPayloadSchema` and returns `{ ok: true, position, leg, costBasisSnapshot, premiumWaterfall }`.

Migration `003_rename_option_type_to_instrument_type.sql` renames the `legs.option_type` column to `instrument_type` and expands its CHECK constraint to `instrument_type IN ('PUT', 'CALL', 'STOCK')`. The migration uses `ALTER TABLE … RENAME COLUMN` where possible and falls back to a table-rebuild because SQLite cannot alter a CHECK constraint in place. Every leg INSERT/SELECT in services — `positions.ts`, `close-csp-position.ts`, `expire-csp-position.ts`, and `get-position.ts` — is updated; `get-position.ts` aliases `instrument_type as instrumentType`. The `LegAction` Zod enum gains `'ASSIGN'` (now `SELL | BUY | EXPIRE | ASSIGN`) and the existing `'ASSIGN'` `LegRole` is reused — no schema change for `leg_role`. `getPosition().activeLeg` returns `null` once the position is in `HOLDING_SHARES` (the ASSIGN leg is an event marker, not an open leg), mirroring how `EXPIRE` is handled.

The renderer adapter `assignPosition` maps a snake_case payload to camelCase IPC fields (extending `IPC_TO_FORM_FIELD` with `assignmentDate: 'assignment_date'`) and surfaces validation errors via `apiError`. A `useAssignPosition` TanStack Query mutation hook mirrors `useExpirePosition` and invalidates `positionQueryKeys.all` on success. `AssignmentSheet` is a 400px right-side sheet rendered via `createPortal` to `document.body` (same pattern as `ExpirationSheet`); it has two internal states — form and success — and is opened from a "Record Assignment →" button that the `PositionDetailPage` only renders when `position.phase === 'CSP_OPEN'`. The form-state irrevocable warning ("**This cannot be undone.**…") is a gold `AlertBox variant="warning"`; the success-state strategic nudge is a blue `AlertBox variant="info"` above the "Open Covered Call on `<ticker>` →" CTA (which routes to US-7's open-CC flow). `PositionDetailPage` extends the existing blur/opacity treatment to fire for `showAssignment` alongside `showExpiration`.

## Architecture decisions

- `OptionType` is renamed to `InstrumentType` (`PUT | CALL | STOCK`) and the `legs.option_type` column is renamed to `instrument_type` with an expanded CHECK constraint via migration 003 — one enum cleanly covers options and the stock-holding event marker → [schema/tables.md](../schema/tables.md)
- `LegAction` is extended with `'ASSIGN'` (now `SELL | BUY | EXPIRE | ASSIGN`); reusing `BUY` or `EXPIRE` would be semantically wrong → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- The existing `'ASSIGN'` `LegRole` is reused — no schema change for `leg_role`; the story's "stock_assignment" wording refers to semantics, not a new enum value → [schema/tables.md](../schema/tables.md)
- The premium waterfall is computed in the pure cost-basis engine (one `{ label, amount }` entry per `CSP_OPEN` and per `ROLL_TO` leg) so display ordering stays out of the renderer → [domain/cost-basis.md](../domain/cost-basis.md)
- Assignment is a phase transition, not a close: a new `cost_basis_snapshots` row is appended with `final_pnl=NULL`; `positions.status` stays `ACTIVE`, `closed_date` stays `NULL`, and only `phase` and `updated_at` change → [domain/cost-basis.md](../domain/cost-basis.md), [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Future assignment dates are client-side soft warnings only — the lifecycle engine and IPC handler both accept future `assignmentDate` values; the boundary case `assignmentDate === openFillDate` is valid → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Date validation lives in the lifecycle engine and takes `openFillDate` as a parameter (the service reads it from the open leg), keeping the engine pure → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- After assignment, `getPosition().activeLeg` returns `null` for `HOLDING_SHARES` positions (`ASSIGN` is an event marker, like `EXPIRE`); the detail page already guards `activeLeg &&` so no page rewrite is needed → [schema/tables.md](../schema/tables.md)
- `positions:assign-csp` follows the standard `{ ok, ... } | { ok: false, errors }` envelope and uses `handleIpcCall`; error `field` naming uses `__phase__` for phase mismatch, `__root__` for not-found / no-active-leg / internal errors, and the actual field name (`assignmentDate`) for field-level validation → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Renderer adapter is snake_case at the boundary and maps to camelCase IPC fields via `IPC_TO_FORM_FIELD` (`assignmentDate: 'assignment_date'`) → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- "Record Assignment →" is only rendered when `position.phase === 'CSP_OPEN'`, gating the action at the UI in addition to the engine's `invalid_phase` check.
- `AssignmentSheet` is a 400px right-side sheet rendered via `createPortal`, matching the `ExpirationSheet` pattern; `PositionDetailPage` applies the same blur/opacity to `<main>` for `showAssignment` as it does for `showExpiration`.
- `useAssignPosition` invalidates `positionQueryKeys.all` on success (mirrors `useExpirePosition`).
- All assignment arithmetic uses `decimal.js` with `ROUND_HALF_UP` at 4 dp.

## Contracts touched

- `positions:assign-csp` — IPC handler returning `{ position, leg, costBasisSnapshot, premiumWaterfall }` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `AssignCspPayloadSchema` — Zod schema for `{ positionId: UUID, assignmentDate: 'YYYY-MM-DD' }` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `AssignCspPositionResult` — IPC return type with `position`, `leg`, `costBasisSnapshot`, and `premiumWaterfall: Array<{ label, amount }>` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `recordAssignment` lifecycle function (`RecordAssignmentInput` / `RecordAssignmentResult`) → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `calculateAssignmentBasis` cost-basis function (`AssignmentBasisInput` / `AssignmentBasisResult`) → [../domain/cost-basis.md](../domain/cost-basis.md)
- `InstrumentType` Zod enum (`PUT | CALL | STOCK`) — replaces `OptionType` → [../schema/tables.md](../schema/tables.md)
- `LegAction` Zod enum extended with `'ASSIGN'` → [../schema/tables.md](../schema/tables.md)
- `LegRecord` field rename `optionType` → `instrumentType` (camelCase IPC shape) → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Renderer adapter `assignPosition` — snake_case payload, camelCase response, error mapping via `IPC_TO_FORM_FIELD` (`assignmentDate: 'assignment_date'`) → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Preload binding `window.api.assignPosition` → invokes `positions:assign-csp` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `useAssignPosition` TanStack Query mutation hook — mirrors `useExpirePosition`, invalidates `positionQueryKeys.all`.
- `AssignmentSheetProps` — `{ open, positionId, ticker, strike, expiration, contracts, openFillDate, premiumWaterfall, projectedBasisPerShare, onClose }`.

## Source files

- `migrations/003_rename_option_type_to_instrument_type.sql`
- `src/main/db/migrate.ts`
- `src/main/core/types.ts`
- `src/main/core/lifecycle.ts`
- `src/main/core/costbasis.ts`
- `src/main/schemas.ts`
- `src/main/services/assign-csp-position.ts`
- `src/main/services/get-position.ts`
- `src/main/services/positions.ts`
- `src/main/services/close-csp-position.ts`
- `src/main/services/expire-csp-position.ts`
- `src/main/ipc/positions.ts`
- `src/main/ipc/utils.ts`
- `src/preload/index.ts`
- `src/renderer/src/api/positions.ts`
- `src/renderer/src/hooks/useAssignPosition.ts`
- `src/renderer/src/components/AssignmentSheet.tsx`
- `src/renderer/src/pages/PositionDetailPage.tsx`
- `e2e/csp-assignment.spec.ts`
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
