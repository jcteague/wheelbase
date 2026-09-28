---
page: docs/spec/features/us-4-close-csp.md
audited_at: 2026-09-28
findings: 18
---

# Audit: docs/spec/features/us-4-close-csp.md

## Verified (14)

- ✓ All 20 files in the "Source files" list exist.
- ✓ `closeCsp`, `CloseCspInput` and `CloseCspResult` are in `src/main/core/lifecycle.ts:99-112`. The date guards `closeFillDate < openFillDate` and `closeFillDate > expiration` are at `:119,127`, so fill on the expiration date is valid.
- ✓ Profit/loss classification is `netPnl.gt(0) ? 'CSP_CLOSED_PROFIT' : 'CSP_CLOSED_LOSS'`, so breakeven counts as a loss: `lifecycle.ts:136`.
- ✓ `calculateCspClose`, `CspCloseInput` and `CspCloseResult` are in `src/main/core/costbasis.ts:50-71`.
- ✓ `CloseCspPayloadSchema = { positionId, closePricePerContract: positive number, fillDate?: string }`: `src/main/schemas.ts:129-133`.
- ✓ The `positions:get` and `positions:close-csp` channels are registered: `src/main/ipc/positions.ts:62,75`. `close-csp` goes through `registerParsedPositionHandler` (Zod parse + `handleIpcCall`, `:35-47`).
- ✓ The close leg is inserted with `leg_role='CSP_CLOSE'`, `action='BUY'`, `'PUT'` inside `db.transaction`: `src/main/services/close-csp-position.ts:56-61`.
- ✓ The position update is `phase = ?, status = 'CLOSED', closed_date = ?`: `close-csp-position.ts:76`.
- ✓ A new `cost_basis_snapshots` row is inserted with `final_pnl` and `trigger_event='CSP_CLOSE'` (an append, not an update): `close-csp-position.ts:81-88`.
- ✓ The service reads context through `getPosition(db, ...)` from `./get-position`: `close-csp-position.ts:9,22`.
- ✓ `getPosition` returns `position`, `activeLeg` and `costBasisSnapshot`: `src/main/services/get-position.ts:250`. It now also returns `legs` and `allSnapshots`, which are later additions and not contradicted by the page.
- ✓ `CloseCspForm` uses `zodResolver`, `computePreview`, the `openFillDate`/`expiration` props, an optional `fill_date` with a `YYYY-MM-DD` check, and `navigate('/')` on success: `src/renderer/src/components/CloseCspForm.tsx:1,29-34,42,85,98`.
- ✓ `mapIpcErrors` and `IPC_TO_FORM_FIELD` are in `src/renderer/src/api/positions.ts:78,89`.
- ✓ The `usePosition` / `useClosePosition` hooks exist (`hooks/usePosition.ts:5`, `hooks/useClosePosition.ts:10`).

## Drift (2)

- ✗ **The page says `positions:get` and `positions:close-csp` "use the shared `handleIpcCall` wrapper".** `positions:get` is a bare `ipcMain.handle` with no Zod parse and no `handleIpcCall`. It builds its own `{ ok: false, errors }` not-found envelope: `src/main/ipc/positions.ts:62-70`. Suggested fix: correct the page, or bring the handler into line with the CLAUDE.md thin-handler rule.
- ✗ **"Close leg shape: … `option_type = 'PUT'`".** Migration `003_rename_option_type_to_instrument_type.sql` renamed the column. The insert writes `instrument_type` (`src/main/services/close-csp-position.ts:59`).

## Unverifiable (2)

- ? That the P&L preview is local-only, with no debounced IPC call. This is consistent with `computePreview` in the form, but proving the absence of an IPC call is narrative.
- ? The missing-ac revision says the date guards "never tripped" before it. This is historical narrative. The form now also enforces the open-date and expiration bounds client-side (`CloseCspForm.tsx:32-33`), which goes beyond the revision's "regex only" description but does not contradict the ACs.

## Missing files (0)

- All linked spec pages exist (`domain/wheel-lifecycle.md`, `domain/cost-basis.md`, `contracts/ipc-handlers.md`, `schema/tables.md`).
