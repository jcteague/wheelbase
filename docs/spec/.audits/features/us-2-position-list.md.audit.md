---
page: docs/spec/features/us-2-position-list.md
audited_at: 2026-06-27
findings: 0
---

# Audit: docs/spec/features/us-2-position-list.md

## Verified (8)

- ✓ Surviving artifact `src/main/services/list-positions.ts` exists.
- ✓ Surviving artifact `src/renderer/src/hooks/usePositions.ts` exists; `usePositions` exported at `src/renderer/src/hooks/usePositions.ts:5`.
- ✓ Surviving artifact `src/renderer/src/components/PositionCard.tsx` exists.
- ✓ Surviving artifact `src/renderer/src/pages/PositionsListPage.tsx` exists.
- ✓ `listPositions` renderer fetch wrapper exists at `src/renderer/src/api/positions.ts:106`.
- ✓ DTE computed server-side and `null` sorts last — `dteSortKey` at `src/main/services/list-positions.ts:55` returns `[item.dte === null, item.dte ?? 0]`; `computeDte` used at line 78; sort at lines 90-92.
- ✓ IPC list handler exists — `ipcMain.handle('positions:list', ...)` at `src/main/ipc/positions.ts:48`, the documented Electron equivalent of `GET /api/positions`.
- ✓ Plan-era `backend/` and `frontend/` paths confirmed absent (page's heritage note explicitly states they were removed).

## Drift (0)

None.

## Unverifiable (3)

- ? `PositionListItemResponse` server-side response model — the page itself states this is a plan-era FastAPI symbol that no longer exists in the repo; not auditable against current code.
- ? `_dte_sort_key` extracted-during-refactor name — plan-era FastAPI artifact; current equivalent is `dteSortKey` in `list-positions.ts`. Narrative heritage claim, flagged for human review.
- ? `PositionListItem` / `usePositions` keyed `['positions']` shape claims — narrative; the symbols exist but the exact field-by-field shape is not mechanically verified here.

## Missing files (0)

- ✓ Relative links `../domain/cost-basis.md`, `../schema/tables.md`, `../contracts/ipc-handlers.md` all resolve.
