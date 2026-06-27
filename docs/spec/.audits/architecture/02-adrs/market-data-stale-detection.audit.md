---
page: docs/spec/architecture/02-adrs/market-data-stale-detection.md
audited_at: 2026-06-27
findings: 0
---

# Audit: market-data-stale-detection.md

## Verified (5)

- ✓ Staleness uses TanStack Query's `dataUpdatedAt`: `const age = now - query.dataUpdatedAt` (`src/renderer/src/hooks/useStockQuotes.ts:99`).
- ✓ Threshold of 5 minutes: `STALE_THRESHOLD_MS = 5 * 60 * 1000` (`useStockQuotes.ts:17`) — value-equivalent to the page's `300_000`.
- ✓ Stale when `age > STALE_THRESHOLD_MS` (`useStockQuotes.ts:100`), feeding `StaleDataBanner` (`src/renderer/src/components/StaleDataBanner.tsx`).
- ✓ Banner text "Prices may be delayed — last updated {minutesAgo}m ago" (`StaleDataBanner.tsx:20`).
- ✓ Combined `setStaleInfo({ stale, minutesAgo })` setState fires from the `dataUpdatedAt` effect (`useStockQuotes.ts:94-111`), with `minutesAgo = Math.floor(age / 60_000)`.

## Drift (0)

(minor: the page renders the banner text with a leading "⚠ "; the component's string in `StaleDataBanner.tsx:20` is "Prices may be delayed — …" — the warning glyph is likely supplied by surrounding JSX/icon, not the literal string. Not material drift.)

## Unverifiable (2)

- ? "`streamError != null` immediately forces both signals" and the precedence over the 5-min threshold are combined in `deriveMarketStatusDisplay`/page wiring (cross-ref `market-status-pill` ADR, not in this batch); the hook surfaces `streamError` but the precedence composition lives at the page — flag for human review.
- ? Deferred tech-debt note (minutesAgo won't tick without an interval) is narrative/known limitation, not mechanically auditable.

## Missing files (0)

- ✓ `../../features/us-32-live-position-prices.md` exists.

One-line: Audited market-data-stale-detection.md: 5 verified, 0 drift, 2 unverifiable, 0 missing.
