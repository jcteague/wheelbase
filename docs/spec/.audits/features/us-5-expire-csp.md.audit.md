---
page: docs/spec/features/us-5-expire-csp.md
audited_at: 2026-09-28
findings: 5
---

# Audit: us-5-expire-csp.md

## Verified (20)

- ✓ All 19 listed source files exist. `src/renderer/src/components/ui/sheet.tsx` resolves only case-insensitively: the tracked file is `ui/Sheet.tsx` (see Drift).
- ✓ `expireCsp(input)` rejects non-`CSP_OPEN` with 'Position is not in CSP_OPEN phase' and early dates with 'Cannot record expiration before the expiration date' — `src/main/core/lifecycle.ts:149-158`.
- ✓ `calculateCspExpiration` returns the literal `pnlPercentage: '100.0000'` — `src/main/core/costbasis.ts:173-181`.
- ✓ `LegAction` includes `'EXPIRE'` — `src/main/core/types.ts:3,31`. (It has since also gained `ASSIGN` and `EXERCISE`.)
- ✓ `ExpireCspPayloadSchema = { positionId, expirationDateOverride?: string }` — `src/main/schemas.ts:186-189`.
- ✓ Service `expireCspPosition` runs one `db.transaction` — `src/main/services/expire-csp-position.ts:56`.
- ✓ The expire leg is inserted with `leg_role='EXPIRE'`, `action='EXPIRE'`, `premium_per_contract='0.0000'` and `fill_price=NULL` — `expire-csp-position.ts:57-73`.
- ✓ `fill_date` defaults to the open leg's `expiration` (`recordedDate = override ?? openLeg.expiration`) — `expire-csp-position.ts:37`.
- ✓ The position update sets `phase`, `status='CLOSED'` and `closed_date` — `expire-csp-position.ts:75-77`.
- ✓ The snapshot copies `basis_per_share` and `total_premium_collected` from the prior snapshot, and `final_pnl = calcResult.finalPnl` — `expire-csp-position.ts:79-91`. The opening snapshot is not mutated.
- ✓ `referenceDate` defaults to today when there is no override — `expire-csp-position.ts:36`.
- ✓ The error fields `__phase__`, `__root__` and `expiration` are used — `expire-csp-position.ts:22,26,31`; `lifecycle.ts:151-158`.
- ✓ IPC `positions:expire-csp` is registered with `ExpireCspPayloadSchema` — `src/main/ipc/positions.ts:10,91`; preload `expirePosition` — `src/preload/index.ts:22`; `IpcExpireCspPayload` / `expirePosition` are declared in `src/preload/index.d.ts:102,682`.
- ✓ The renderer adapter maps `position_id → positionId` and `expiration_date_override → expirationDateOverride` — `src/renderer/src/api/positions.ts:194-195,265-266`.
- ✓ `useExpirePosition` invalidates `positionQueryKeys.all` = `['positions']` — `src/renderer/src/hooks/useExpirePosition.ts:14`, `hooks/positionQueryKeys.ts:2`.
- ✓ missing-ac fix: the sheet mutates with `{ position_id }` only (no override) — `ExpirationSheet.tsx:52` — and renders the server error inline — `ExpirationSheet.tsx:200-202`.
- ✓ The success state has "Open new wheel on {ticker}" → `navigate('/new?ticker=' + ticker)` and a "View full position history" link — `ExpirationSheet.tsx:56,125,133`.
- ✓ `NewWheelPage` reads `ticker` via `useSearch()` and passes `defaultTicker` into the `NewWheelForm` defaults — `NewWheelPage.tsx:16,25,42`; `NewWheelForm.tsx:91`.
- ✓ `PositionCard` uses `closed = isClosed ?? item.status === 'CLOSED'` with `data-testid` `position-card-closed` — `PositionCard.tsx:67,92`; the list has Active and Closed sections and closed rows at `opacity-[0.55]` — `PositionsListPage.tsx:125,255,267`.
- ✓ The detail header button reads "Record Expiration →" — `PositionDetailActions.tsx:71`.

## Drift (5)

- ✗ **Snapshot timestamp.** The page says `snapshot_at = now + 1ms`. The code uses `makeSnapshotAt(recordedDate)` (`expire-csp-position.ts:54`), which builds `<recordedDate>T<current wall-clock time>Z` (`src/main/dates.ts:24-27`). The snapshot is keyed to the expiration date, not "now + 1ms".
- ✗ **Sheet primitive.** The page says `ExpirationSheet` wraps the shadcn `Sheet` (`<SheetContent side="right">`, installed via `shadcn add sheet`). The code imports `SheetOverlay`, `SheetPanel`, `SheetHeader`, `SheetBody` and `SheetFooter` from the project's own `./ui/Sheet` (`ExpirationSheet.tsx:10`; exports at `src/renderer/src/components/ui/Sheet.tsx:16-103`) and portals through `getSheetPortal()`. There is no `SheetContent`/`side="right"` usage. The Source-files path `ui/sheet.tsx` is lowercase, but the tracked file is `ui/Sheet.tsx`.
- ✗ **`PHASE_COLOR` consumers.** The page says `PHASE_COLOR` is used by both `PositionCard` and `PositionDetailPage`. `PositionDetailPage.tsx` does not import it; the detail header's consumer is now `position-cockpit/PositionCockpit.tsx:5,42` (alongside `PositionCard.tsx:9`, the calendar components and `PhaseBadge`).
- ✗ **Closed-card "Final P&L".** The page says closed cards show "Final P&L" in green in place of "Premium". A grep for `Final P&L` finds it only in `ExpirationSheet.tsx:84,186` and `LegHistoryTable.tsx:248`, not in `PositionCard.tsx` or `PositionsListPage.tsx`. The list is now a table (`PositionsListPage.tsx:125`).
- ✗ **Expire leg `instrument_type` / badge copy.** The page says the service copies `option_type` from the open leg. The insert hard-codes `'PUT'` (`expire-csp-position.ts:62,113`), which is behaviourally equivalent for a CSP. Separately, the "Complete ✓" badge text does not appear: the short label is `'Complete'` (`src/renderer/src/lib/phase.ts:61`). Low severity.

## Unverifiable (3)

- ? "No pulse animation" on the complete badge is a visual claim and was not traced.
- ? "Each expired wheel is a self-contained lifecycle; re-opening creates a new wheel" is a design rationale.
- ? The `legs.action` column having "no CHECK constraint" was not re-verified across all migrations.

## Missing files (0)
