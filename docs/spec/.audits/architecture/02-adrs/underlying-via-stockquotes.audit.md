---
page: docs/spec/architecture/02-adrs/underlying-via-stockquotes.md
audited_at: 2026-09-28
findings: 1
---

# Audit: underlying-via-stockquotes.md

## Verified (5)

- ✓ `PositionDetailPage` calls `useStockQuotes([ticker])` alongside `useOptionSnapshots` — `src/renderer/src/pages/PositionDetailPage.tsx:17-18,53-54`.
- ✓ `underlyingPrice = stockQuotesQuery.data?.[ticker]?.price ?? null` — `PositionDetailPage.tsx:55-57`.
- ✓ Threaded as a prop `PositionDetailPage` → `PositionDetailContent` → `PositionCockpit` — `PositionDetailPage.tsx:151`, `PositionDetailContent.tsx:20,53`, `PositionCockpit.tsx:27`.
- ✓ `OptionSnapshot` has no `underlyingPrice` field — `src/main/integrations/market-data-provider.ts:34-51` (grep for `underlyingPrice` in the port is empty).
- ✓ Feature link `../../features/us-34-position-cockpit.md` exists.

## Drift (0)

None.

## Unverifiable (1)

- ? "Alpaca's option-snapshot endpoint does not include the underlying price" — vendor fact, not checkable in code; `plans/us-34/research.md` is historical (dir not present, by design).

## Missing files (0)

None.
