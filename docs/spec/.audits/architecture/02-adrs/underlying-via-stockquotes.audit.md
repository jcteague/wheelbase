---
page: docs/spec/architecture/02-adrs/underlying-via-stockquotes.md
audited_at: 2026-06-27
findings: 0
---

# Audit: underlying-via-stockquotes.md

## Verified (4)

- ✓ `PositionDetailPage` calls `useStockQuotes(...)` alongside `useOptionSnapshots` — `src/renderer/src/pages/PositionDetailPage.tsx:53-54` (`useOptionSnapshots(legSummaries)`, `useStockQuotes(data ? [data.position.ticker] : [])`).
- ✓ Derives `underlyingPrice = stockQuotesQuery.data?.[ticker]?.price ?? null` — `PositionDetailPage.tsx:55-56`.
- ✓ Threads `underlyingPrice` down as a prop on `PositionDetailContent` — `PositionDetailPage.tsx:151` (`underlyingPrice={underlyingPrice}`).
- ✓ `OptionSnapshot` is not extended with an underlying field — `grep -rn "underlyingPrice" src/main` returns no schema/type addition.

## Drift (0)

None.

## Unverifiable (1)

- ? "Alpaca's option-snapshot endpoint does not include the underlying price" — external-vendor narrative; not mechanically verifiable. (Note: live streaming has since moved to a Massive/Polygon provider, but this statement is about endpoint contents, flagged for human review.)

## Missing files (0)

None within src/ scope.
