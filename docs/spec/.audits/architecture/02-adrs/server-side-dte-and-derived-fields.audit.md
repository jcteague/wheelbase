---
page: docs/spec/architecture/02-adrs/server-side-dte-and-derived-fields.md
audited_at: 2026-06-27
findings: 1
---

# Audit: server-side-dte-and-derived-fields.md

## Verified (4)

- ✓ DTE computed in the main process / service — `src/main/services/list-positions.ts:78` (`dte: computeDte(row.expiration ?? null)`), via `src/main/core/dte.ts`.
- ✓ DTE for no-active-option returns `null` — `computeDte` returns `number | null` (`src/main/core/dte.ts:11`).
- ✓ Server-side sort by DTE ascending, nulls last — `list-positions.ts:55-92` (`dteSortKey` returns `[item.dte === null, item.dte ?? 0]`, then `items.sort(...)` orders nulls last).
- ✓ `positions:list` is an IPC handler returning the list — `src/main/ipc/positions.ts:48` (`ipcMain.handle('positions:list', () => listPositions(db))`).

## Drift (1)

- ✗ Page claims the renderer "renders `null` as `\"Expired\"`" and that "`PositionCard` renders DTE as `\"42d\"` or `\"Expired\"`". In current code `PositionCard` renders `—` (em dash) for null DTE, not `"Expired"` — `src/renderer/src/components/PositionCard.tsx:141` (`{item.dte !== null ? \`${item.dte}d\` : '—'}`). Suggested fix: update the ADR to say null DTE renders as `—`.

## Unverifiable (2)

- ? "no need for SQL ROW_NUMBER window functions" / "selectinload (FastAPI-era equivalent)" — design rationale referencing pre-Electron stack; narrative.
- ? "The same principle applies to other derived fields (premium-waterfall ordering, sharesHeld, etc.)" — general principle, not a single mechanical claim.

## Missing files (0)

- `../../.extracts/us-2.md`, `../../features/us-2-position-list.md` — source/feature references.
