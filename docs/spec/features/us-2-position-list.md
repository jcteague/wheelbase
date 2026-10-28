# US-2: Position list

<!-- generated:from us-2,us-18 -->

## Summary

Renders every wheel the trader owns on a single positions list page, as a **card grid** in two sections, `Active` then `Closed`. Each card shows the ticker, phase badge, live underlying price, unrealized P&L, one leg block for the open option (strike, expiration, DTE, mark, credit), and a footer with the effective cost basis and premium collected to date; closed positions render muted at 50% opacity. Positions are sorted by DTE ascending with no-active-option positions (holding shares, closed wheels) placed last so the trader sees the nearest decision point first; the renderer keeps that order. An empty trader sees a "No positions yet" state with a CTA linking to the New Wheel form. No new schema or migration: every field is sourced from existing Phase 1 tables, with DTE computed at query time.

The list later grew into a ten-column table (`PositionRow`); [US-18](./us-18-position-cards.md) replaced it with the card grid, so the story's original "card" wording now matches the UI again.

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

DTE is computed server-side as `(expiration − today).days` so the renderer never does date arithmetic and sort order can be applied in the handler before serialising. Positions with no active open leg (holding shares, completed wheels) return `dte: null`, which the card renders as `—` (the original card rendered the literal string `Expired`). Sort key is `(dte is None, dte)` so `None`s land at the bottom while the live options sort ascending. The list is returned in pre-sorted order and the renderer trusts that order rather than re-sorting client-side.

The renderer wraps the endpoint behind a TanStack Query hook (`usePositions`). `PositionsListPage` splits the result into `ACTIVE` and `CLOSED` items (status filter, input order kept) and renders each section through `PositionsGrid`, a responsive grid (`repeat(auto-fill, minmax(min(400px,100%), 1fr))`, one column on a narrow window) that renders a `WheelCard` per wheel item and a `PmccCard` per PMCC item. The empty state is a "No positions yet" message with an "Open your first wheel →" link. Phase is rendered with the shared `PhaseBadge` (`variant="short"`), and money goes through the shared formatters in `src/renderer/src/lib/format.ts`. The card anatomy (header, P&L figure, leg block, action strip, footer) and its primitives are documented on [us-18 — Position cards](./us-18-position-cards.md).

A position with no active option leg shows a placeholder leg block instead of a countdown: a held-shares card reads `no option leg open — sell a covered call` with `—` DTE and mark; a closed card reads `wheel complete` (for `WHEEL_COMPLETE`) or `position closed`, with `—` for price, mark, DTE and P&L.

## Revisions

- **us-2** (original): shipped the list endpoint (DTE server-side, nulls-last sort) and one `PositionCard` per row with an empty state; the card later became a table row (`PositionRow`) as live-price and P&L columns were added.
- **us-18**: replaced the table with the `PositionsGrid` card grid (`WheelCard` / `PmccCard`); `PositionCard.tsx` (`PositionRow`), its cells and the `.wb-position-row*` CSS are deleted. Sections, sort order and the empty state are unchanged.

## Architecture decisions

- DTE is computed server-side in the list handler and returned as `dte: number | null`; the renderer never does date math. Centralises the logic, keeps the sort trivially expressible before serialisation, and lets `null` cleanly signal "no active option" instead of a negative integer.
- Active-leg selection eager-loads `position.legs` via `selectinload` and picks the latest open-action leg in application code; `O(2)` queries beats N+1 without the complexity of a window function at this scale.
- Latest cost-basis snapshot uses the same eager-load + in-memory `max(snapshot_at)` pattern. Snapshots are append-only, so the latest row is always authoritative → [domain/cost-basis.md](../domain/cost-basis.md)
- Closed / expired positions (no active open leg) serialise `strike`, `expiration`, and `dte` as `null`. The original renderer translated `null` DTE to the literal `Expired`; since [us-18](./us-18-position-cards.md) the card shows `—` DTE in a placeholder leg block instead.
- Sort order is `dte` ascending with `null`s last. Traders prioritise positions closest to expiration; positions without an active option are secondary.
- Phase badge originally shipped as a plain styled `<span>` (avoiding premature abstraction); it is now the shared `PhaseBadge` primitive → [architecture/03-design-system.md](../architecture/03-design-system.md)
- No schema migration required for US-2. All fields are sourced from existing Phase 1 tables (`positions`, `legs`, `cost_basis_snapshots`) or computed at query time → [schema/tables.md](../schema/tables.md)
- Renderer trusts the backend's sort order (`sortPositionsByDte` in `src/main/core/position-order.ts`, applied by `listPositions`) — `PositionsGrid` renders items in input order and never re-sorts client-side.
- The list is one card grid, not a table; wheel and PMCC cards share one set of position-card primitives → [ADR: position-card primitives shared across strategies](../architecture/02-adrs/position-card-primitives-shared-across-strategies.md)
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
- `src/main/core/position-order.ts` — `sortPositionsByDte` (DTE ascending, nulls last)
- `src/renderer/src/hooks/usePositions.ts`
- `src/renderer/src/pages/PositionsListPage.tsx` — `Active` / `Closed` sections, empty state
- `src/renderer/src/components/PositionsGrid.tsx` — [us-18] the card grid
- `src/renderer/src/components/position-card/WheelCard.tsx`, `PmccCard.tsx` — [us-18] one card per item
- `e2e/position-cards.spec.ts` — [us-18] card-grid e2e coverage

Deleted by us-18: `src/renderer/src/components/PositionCard.tsx` (`PositionRow`).

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
