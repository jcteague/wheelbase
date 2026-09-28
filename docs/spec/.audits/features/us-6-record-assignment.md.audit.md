---
page: docs/spec/features/us-6-record-assignment.md
audited_at: 2026-09-28
findings: 29
---

# Audit: docs/spec/features/us-6-record-assignment.md

## Verified (19)

- ✓ `recordAssignment({ currentPhase, assignmentDate, openFillDate })` requires `CSP_OPEN` (`__phase__`/`invalid_phase`, "Assignment can only be recorded on a CSP_OPEN position") and `assignmentDate >= openFillDate` by ISO string compare (`assignmentDate`/"Assignment date cannot be before the CSP open date"). It returns `{ phase: 'HOLDING_SHARES' }` — `src/main/core/lifecycle.ts:263-291`
- ✓ `calculateAssignmentBasis` with `AssignmentBasisInput`/`AssignmentBasisResult` (`sharesHeld`, `premiumWaterfall`). Labels are `CSP_OPEN → 'CSP premium'` and `ROLL_TO → 'Roll credit'` — `src/main/core/costbasis.ts:85-138`
- ✓ `assignCspPosition` loads via `getPosition`, calls both engines, and writes in one `db.transaction` — `src/main/services/assign-csp-position.ts:54,59,91,101`
- ✓ The ASSIGN leg insert sets `leg_role='ASSIGN'`, `action='ASSIGN'`, `instrument_type='STOCK'`, `premium_per_contract='0.0000'`, `fill_price=NULL` and `fill_date=assignmentDate`, and copies strike/expiration/contracts from the open leg — `src/main/services/assign-csp-position.ts:102-115`
- ✓ The position update changes only `phase` and `updated_at` — `src/main/services/assign-csp-position.ts:117`. `status: 'ACTIVE'` is returned at `:147`
- ✓ A `cost_basis_snapshots` row is written with `final_pnl = null` (trigger `CSP_ASSIGN`) — `src/main/services/assign-csp-position.ts:123-135`
- ✓ `positions:assign-csp` is registered with `AssignCspPayloadSchema` — `src/main/ipc/positions.ts:81-87`. The result includes `premiumWaterfall` (`assign-csp-position.ts:176`)
- ✓ `AssignCspPayloadSchema` is `{ positionId, assignmentDate: ISO date }` — `src/main/schemas.ts:209-212`. `AssignCspPositionResult` is at `src/main/schemas.ts:216`
- ✓ Migration 003 rebuilds `legs` with `CHECK (instrument_type IN ('PUT','CALL','STOCK'))` — `migrations/003_rename_option_type_to_instrument_type.sql:6`
- ✓ The `InstrumentType` Zod enum is `PUT | CALL | STOCK` — `src/main/core/types.ts:32`. `LegRecord.instrumentType` is at `src/main/schemas.ts:86`
- ✓ `'ASSIGN'` is reused as a `LegRole` — `src/main/core/types.ts:25`
- ✓ `activeLeg` is null outside `CSP_OPEN`/`CC_OPEN`, so it is null for `HOLDING_SHARES` — `src/main/services/active-leg-sql.ts`, used at `get-position.ts:203,242`
- ✓ `IPC_TO_FORM_FIELD` maps `assignmentDate: 'assignment_date'` — `src/renderer/src/api/positions.ts:78-82`. `assignPosition` maps snake_case to camelCase — `:274-283`
- ✓ Preload `window.api.assignPosition` invokes `positions:assign-csp` — `src/preload/index.ts:23`
- ✓ `useAssignPosition` invalidates `positionQueryKeys.all` on success — `src/renderer/src/hooks/useAssignPosition.ts:14`
- ✓ `AssignmentSheet` uses `createPortal` and has form and success states — `src/renderer/src/components/AssignmentSheet.tsx`:
  - the "Assignment date is required" error (`:58`)
  - the future-date `AlertBox variant="warning"` (`:123`)
  - the portal (`:149`)
  - the `AlertBox variant="info"` "Many traders wait 1–3 days" nudge and the `Open Covered Call on ${ticker} →` CTA (`:304-310`)
- ✓ "Record Assignment →" renders only when `phase === 'CSP_OPEN'` — `src/renderer/src/components/PositionDetailActions.tsx:82-88`
- ✓ `e2e/csp-assignment.spec.ts` covers each AC (lines 103, 127, 151, 170, 188, 206, 226)
- ✓ All listed source files and linked spec pages (`schema/tables.md`, `domain/wheel-lifecycle.md`, `domain/cost-basis.md`, `contracts/ipc-handlers.md`) exist

## Drift (7)

- ✗ Page says `LegAction` is "now `SELL | BUY | EXPIRE | ASSIGN`". The current values are `['SELL','BUY','EXPIRE','ASSIGN','EXERCISE']` — `src/main/core/types.ts:3`. Suggested fix: note the later `EXERCISE` addition.
- ✗ The page's `AssignmentSheetProps` list is missing the required `onOpenCoveredCall(ctx)` prop — `src/renderer/src/components/AssignmentSheet.tsx:32-37`.
- ✗ Page says the irrevocable "This cannot be undone." warning is a gold `AlertBox variant="warning"`. It is a raw `div` with `bg-wb-gold-dim … text-wb-gold` classes — `src/renderer/src/components/AssignmentSheet.tsx:125-128`.
- ✗ Page says the sheet portals to `document.body`. It portals to `getSheetPortal()`, which is `#sheet-portal` and falls back to body — `AssignmentSheet.tsx:149-154`, `src/renderer/src/lib/portal.ts:9-11`.
- ✗ Page says the "Record Assignment →" button is rendered by `PositionDetailPage`. It lives in `src/renderer/src/components/PositionDetailActions.tsx:85-88`, which is not in Source files.
- ✗ Page says `PositionDetailPage` applies blur/opacity to `<main>` for `showAssignment`/`showExpiration`. Neither `blur`, `opacity` nor `showAssignment` appears in `src/renderer/src/pages/PositionDetailPage.tsx`; the sheet is gated on `assignmentCtx` (`:166`).
- ✗ Page says the adapter surfaces errors "via `apiError`". `assignPosition` uses `throwMappedIpcErrors(mapIpcErrors(...))` — `src/renderer/src/api/positions.ts:279-281`.

## Unverifiable (2)

- ? Migration "uses `ALTER TABLE … RENAME COLUMN` where possible and falls back to a table-rebuild". The file does a `legs_new` table rebuild; whether a rename was tried first is history.
- ? The rationale that "Returning the waterfall from the engine keeps display ordering pure" is narrative.

## Missing files (1)

- ✗ The refactor-status banner cites `plans/us-6/` (`refactor-phase-results.md`), but that directory no longer exists because plan dirs were deleted. The "Refactor status: pending" note is stale.
