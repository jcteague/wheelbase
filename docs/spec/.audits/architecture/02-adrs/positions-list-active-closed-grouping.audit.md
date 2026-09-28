---
page: docs/spec/architecture/02-adrs/positions-list-active-closed-grouping.md
audited_at: 2026-09-28
findings: 1
---

# Audit: positions-list-active-closed-grouping.md

## Verified (6)

- ✓ Two sections "Active" and "Closed" on the same page — `src/renderer/src/pages/PositionsListPage.tsx:255-272`.
- ✓ `activePositions` / `closedPositions` memoised via `useMemo`; tickers derived from active only — `PositionsListPage.tsx:161-167` (lines 12-17 of the component block).
- ✓ Table-row layout with `PriceCell`, `OptMidCell`, `UnrealizedPnlCell`, `TargetBadge` — `src/renderer/src/components/PositionCard.tsx:10-15, 120-140`.
- ✓ Status shown as plain text `{item.status}` — `PositionCard.tsx:128`.
- ✓ `closed = isClosed ?? item.status === 'CLOSED'` controls `data-testid="position-card-closed"` — `PositionCard.tsx:67, 92`.
- ✓ Closed rows get no quotes/snapshots (closed `PositionTable` passes none; `effectiveSnapshot = closed ? undefined : snapshot`) — `PositionsListPage.tsx:266-270`, `PositionCard.tsx:78`.

## Drift (1)

- ✗ Lines 7 and 9: closed rows "render at lowered opacity (~0.55)" and "The opacity nudge … remain[s]". No opacity is applied to closed rows: `PositionCard`'s `<tr>` className and `rowStyle` carry no opacity (`PositionCard.tsx:73-76, 91-102`), and no `opacity`/`0.55` rule for `position-card-closed` or `wb-position-row` exists in the renderer. Suggested fix: remove the opacity claim or restore the styling.

## Unverifiable (2)

- ? Rationale against a `/closed` route or tabs — design intent.
- ? Line 29 "market-status pill … appl[ies] only to active positions" — the pill is a page-header element, not per-row; loosely consistent.

## Missing files (0)

None.
