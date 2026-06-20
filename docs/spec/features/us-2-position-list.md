# US-2: Position list

<!-- generated:from us-2 -->

## Summary

Renders every wheel the trader owns on a single positions list page. Each row shows the ticker, phase badge, active-leg strike and expiration, days-to-expiration, premium collected to date, and the latest effective cost basis. Rows are sorted by DTE ascending with no-active-option positions (holding shares, closed wheels) placed last so the trader sees the nearest decision point first. An empty trader sees a "No positions yet" state with a CTA linking to the New Wheel form. No new schema or migration: every field is sourced from existing Phase 1 tables, with DTE computed at query time.

> **Heritage note.** The plan was authored against a FastAPI backend (`backend/`) and Vite frontend (`frontend/`) layout that has since migrated to the Electron `src/main` / `src/renderer` structure. The plan-era paths are preserved in the Source files section alongside the surviving artifacts at their current Electron locations.

## Acceptance criteria

- Given the trader has one open CSP on AAPL (strike $180, expiration 2026-04-17, premium $2.50/contract), the positions list shows a card with ticker `AAPL`, phase `CSP_OPEN`, strike `$180.00`, expiration `2026-04-17`, DTE `42`, premium collected `$250.00`, effective cost basis `$177.50`.
- Given open wheels on AAPL (30 DTE), MSFT (14 DTE), and TSLA (45 DTE), the list renders in DTE-ascending order: MSFT, AAPL, TSLA.
- Given an open wheel on AAPL expiring 2026-04-17 and today is 2026-03-06, DTE renders as `42` (computed server-side from `expiration − today`).
- Given a completed wheel (`WHEEL_COMPLETE`) on SPY, the SPY card shows the `WHEEL_COMPLETE` phase badge and the DTE field renders as `Expired` instead of a countdown.
- Given the trader has no positions, the page shows "No positions yet" with a call-to-action linking to the New Wheel form (the empty-state CTA points at `/` — the New Wheel form lives at the root, not at a dedicated `/new` route).
- All positions are returned regardless of phase or status — endpoint-level filtering, searching, pagination, and grouping are explicitly out of scope.

## What was built

A read-only list endpoint that joins every position to its active leg and latest cost-basis snapshot, then projects a flat row shape sized for the card UI. Active-leg selection is the most recent `open`-action leg (max `fill_date`); latest snapshot is the max `snapshot_at`. Both selections are made in application code after an eager `selectinload` of `position.legs` and `position.cost_basis_snapshots`, which issues two efficient `IN` queries instead of N+1 — adequate for a single-user app with well under 100 positions.

DTE is computed server-side as `(expiration − today).days` so the renderer never does date arithmetic and sort order can be applied in the handler before serialising. Positions with no active open leg (holding shares, completed wheels) return `dte: null`, which the renderer renders as the literal string `Expired`. Sort key is `(dte is None, dte)` so `None`s land at the bottom while the live options sort ascending. The list is returned in pre-sorted order and the renderer trusts that order rather than re-sorting client-side.

The renderer wraps the endpoint behind a TanStack Query hook (`usePositions`) and renders one `PositionCard` per row, plus an empty-state card with a CTA link. Phase is rendered as a plain styled `<span>` keyed on the phase string — shadcn/ui `Badge` was considered but deferred per the project's "adopt incrementally for shared primitives" stance. Currency formatting on the card uses a local `parseFloat(value).toFixed(2)` inside `$…`; a shared `formatCurrency` helper is deferred until a second consumer needs it.

## Architecture decisions

- DTE is computed server-side in the list handler and returned as `dte: number | null`; the renderer never does date math. Centralises the logic, keeps the sort trivially expressible before serialisation, and lets `null` cleanly signal "no active option" instead of a negative integer.
- Active-leg selection eager-loads `position.legs` via `selectinload` and picks the latest open-action leg in application code; `O(2)` queries beats N+1 without the complexity of a window function at this scale.
- Latest cost-basis snapshot uses the same eager-load + in-memory `max(snapshot_at)` pattern. Snapshots are append-only, so the latest row is always authoritative → [domain/cost-basis.md](../domain/cost-basis.md)
- Closed / expired positions (no active open leg) serialise `strike`, `expiration`, and `dte` as `null`; the renderer translates `null` DTE to the literal `Expired`.
- Sort order is `dte` ascending with `null`s last. Traders prioritise positions closest to expiration; positions without an active option are secondary.
- Phase badge ships as a plain styled `<span>`, not a shadcn `Badge` component. Sufficient for Phase 1 and avoids premature abstraction — easy to migrate later.
- No schema migration required for US-2. All fields are sourced from existing Phase 1 tables (`positions`, `legs`, `cost_basis_snapshots`) or computed at query time → [schema/tables.md](../schema/tables.md)
- Renderer trusts the backend's sort order — page-level tests assert presence of all expected tickers plus the first card matching the nearest-expiration ticker; they do not re-sort client-side.
- Endpoint returns all positions unfiltered. Filtering, searching, pagination, and grouping are deferred (Phase 4 / later epic concerns).
- Logging in the handler: `DEBUG list_positions_query_start` before the select, `DEBUG list_positions_query_complete count=...` after, `INFO positions_listed count=...` on return.

## Contracts touched

- `GET /api/positions` — read-only list endpoint returning a sorted array of position rows (DTE ascending, nulls last); no query params, no body, no domain validation. Plan-era FastAPI route; current Electron equivalent is the IPC list-positions handler → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `PositionListItemResponse` — server-side response model (one entry per row) with fields `id`, `ticker`, `phase`, `status`, `strike`, `expiration`, `dte`, `premium_collected`, `effective_cost_basis`. Money fields serialise as `Decimal` strings; `strike`, `expiration`, and `dte` are nullable.
- `PositionListItem` — renderer-side TypeScript row type mirroring the server response; `phase` and `status` are narrowed to `WheelPhase` / `WheelStatus` union literals after the refactor phase rather than bare `string`.
- `listPositions` — renderer fetch wrapper around the list endpoint, throwing `apiError(status, body)` on non-2xx. Replaced by an Electron IPC adapter in the current codebase.
- `usePositions` — TanStack Query hook keyed `['positions']` wrapping `listPositions`. Covered by page-level component tests via mocking rather than an isolated hook test.

## Source files

Plan-authored paths (FastAPI / Vite era — no longer present in the repo):

- `backend/app/api/schemas.py` — `PositionListItemResponse`
- `backend/app/api/routes/positions.py` — `GET /positions` handler, `_dte_sort_key` extracted during refactor
- `frontend/src/api/positions.ts` — `PositionListItem` type and `listPositions` wrapper
- `frontend/src/hooks/usePositions.ts`
- `frontend/src/components/PositionCard.tsx`
- `frontend/src/pages/PositionsListPage.tsx`
- `frontend/src/app.tsx` — route registration

Surviving artifacts at current Electron paths:

- `src/main/services/list-positions.ts`
- `src/renderer/src/hooks/usePositions.ts`
- `src/renderer/src/components/PositionCard.tsx`
- `src/renderer/src/pages/PositionsListPage.tsx`
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
