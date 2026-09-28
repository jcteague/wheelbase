---
page: docs/spec/features/us-2-position-list.md
audited_at: 2026-09-28
findings: 8
---

# Audit: docs/spec/features/us-2-position-list.md

## Verified (10)

- ✓ Surviving artifacts exist: `src/main/services/list-positions.ts`, `src/renderer/src/hooks/usePositions.ts`, `src/renderer/src/components/PositionCard.tsx`, `src/renderer/src/pages/PositionsListPage.tsx`
- ✓ Plan-era `backend/` and `frontend/` paths are absent — consistent with the page's heritage note (explicitly framed as history)
- ✓ IPC list handler `positions:list` — `src/main/ipc/positions.ts:54` (Electron equivalent of `GET /api/positions`)
- ✓ DTE computed server-side via `computeDte` — `src/main/services/list-positions.ts:6,78`
- ✓ Sort DTE ascending with nulls last — `dteSortKey` at `list-positions.ts:55-56`, sort at `:90-92`
- ✓ Logging: `DEBUG list_positions_query_start` (`list-positions.ts:64`), `DEBUG list_positions_query_complete` with count (`:68`), `INFO positions_listed` with count (`:97`)
- ✓ `listPositions` renderer adapter (IPC, not fetch) — `src/renderer/src/api/positions.ts:97-98`, matching "replaced by an Electron IPC adapter"
- ✓ `PositionListItem.phase` narrowed to `WheelPhase` — `src/renderer/src/api/positions.ts:61-64`
- ✓ `usePositions` query key `['positions']` — `src/renderer/src/hooks/usePositions.ts:7` → `positionQueryKeys.all = ['positions']` (`src/renderer/src/hooks/positionQueryKeys.ts:2`)
- ✓ Empty state copy "No positions yet" — `src/renderer/src/pages/PositionsListPage.tsx:222`

## Drift (5)

- ✗ AC4 / What was built: `dte: null` "renders as the literal string `Expired`". Current row renders an em dash: `{item.dte !== null ? `${item.dte}d` : '—'}` — `src/renderer/src/components/PositionCard.tsx:155`; no "Expired" string in `PositionCard.tsx` or `PositionsListPage.tsx`. DTE also renders with a `d` suffix (`42d`, not `42`).
- ✗ AC5: empty-state CTA "points at `/` — the New Wheel form lives at the root, not at a dedicated `/new` route". Code links `href="#/new"` (`PositionsListPage.tsx:224`) and `/new` is a dedicated route for `NewWheelPage` (`src/renderer/src/App.tsx:103`); `/` is `PositionsListPage` (`App.tsx:102`).
- ✗ "renders one `PositionCard` per row" — `PositionCard.tsx` now exports `PositionRow` rendering a `<tr>` (`PositionCard.tsx:57,91`), imported as `PositionRow` at `PositionsListPage.tsx:11`. The list is a table, not cards.
- ✗ "Phase is rendered as a plain styled `<span>` … shadcn `Badge` deferred" — phase now uses a `PhaseBadge` component (`PositionCard.tsx:11,133`), and `PositionsListPage.tsx:15` imports `Badge` from `components/ui/Badge`.
- ✗ "Currency formatting uses a local `parseFloat(value).toFixed(2)` … shared `formatCurrency` deferred" — card uses shared `fmtMoney` from `src/renderer/src/lib/format` (`PositionCard.tsx:8,144,160`).

Suggested fix: these reflect later stories (list-table redesign, shared formatters, badge components); mark them as superseded in a heritage note or update the AC to current behaviour.

## Unverifiable (3)

- ? `PositionListItemResponse`, `_dte_sort_key`, `selectinload` eager loading — plan-era FastAPI/SQLAlchemy artifacts the page itself frames as history; not auditable against current code.
- ? AC1 exact values (strike `$180.00`, cost basis `$177.50`) — not recomputed.
- ? "Renderer trusts the backend's sort order" — no client-side DTE sort found in `PositionsListPage.tsx` (only a ticker-set sort at `:165`), but other filtering/grouping in that page postdates US-2; flag for human review.

## Missing files (0)

- Relative links `../domain/cost-basis.md`, `../schema/tables.md`, `../contracts/ipc-handlers.md` resolve.
