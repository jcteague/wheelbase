---
page: docs/spec/architecture/02-adrs/positions-list-active-closed-grouping.md
audited_at: 2026-06-27
findings: 1
---

# Audit: positions-list-active-closed-grouping.md

## Verified (6)

- ✓ Two sections Active / Closed on the same page (no separate route): `activePositions` and `closedPositions` rendered in one `PositionsListPage` (`src/renderer/src/pages/PositionsListPage.tsx:269,276-279`).
- ✓ `activePositions`/`closedPositions` derived via `useMemo` from the positions array (`src/renderer/src/pages/PositionsListPage.tsx:159-160`).
- ✓ Closed rows render at opacity ~0.55: `isClosed ? 'opacity-[0.55]' : ''` on the table (`src/renderer/src/pages/PositionsListPage.tsx:124`).
- ✓ `PositionCard` auto-detects closed via `closed = isClosed ?? item.status === 'CLOSED'` (`src/renderer/src/components/PositionCard.tsx:62`).
- ✓ `data-testid="position-card-closed"` marker controlled by closed state (`src/renderer/src/components/PositionCard.tsx:87`).
- ✓ Live-price/snapshot suppressed for closed rows: `effectiveSnapshot = closed ? undefined : snapshot` and `snapshot={isClosed ? undefined : ...}` (`PositionCard.tsx:74`, `PositionsListPage.tsx:146`); `tickers` memo derives from `activePositions` only (`PositionsListPage.tsx:163-164`).

## Drift (1)

- ✗ Decision describes the closed-row treatment as "a `WHEEL_COMPLETE` badge in the project green token, no pulse animation, and a 'Final P&L' value (green) in place of the live 'Premium' label." Current `PositionCard` shows no `WHEEL_COMPLETE` badge and no "Final P&L" label — grep for `WHEEL_COMPLETE` / `Final P&L` in `PositionCard.tsx` returns nothing. The card was restructured into a table-cell layout (`PriceCell`, `OptMidCell`, `UnrealizedPnlCell`, `TargetBadge`) and the closed state is now surfaced as a plain `{item.status}` text label (`src/renderer/src/components/PositionCard.tsx:115`). The opacity nudge and `position-card-closed` testid survive, but the specific badge/label copy in the ADR is stale. Suggested fix: update the page's closed-state visual description to match the current table layout.

## Unverifiable (0)

## Missing files (0)

- (All referenced files exist: `features/us-5-expire-csp.md`, `architecture/02-adrs/market-status-pill.md`, `.extracts/us-5.md`.)
