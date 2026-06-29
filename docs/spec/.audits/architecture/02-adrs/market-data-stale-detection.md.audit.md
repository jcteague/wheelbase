---
page: docs/spec/architecture/02-adrs/market-data-stale-detection.md
audited_at: 2026-06-29
findings: 2
---

# Audit: docs/spec/architecture/02-adrs/market-data-stale-detection.md

## Verified (8)

- ✓ `STALE_THRESHOLD_MS = 5 * 60 * 1000` (= `300_000`) matches `src/renderer/src/hooks/useStockQuotes.ts:17`.
- ✓ Stale condition `Date.now() - dataUpdatedAt > 5 * 60 * 1000` matches the effect at `src/renderer/src/hooks/useStockQuotes.ts:98-100` (`age = now - query.dataUpdatedAt`, `age > STALE_THRESHOLD_MS`).
- ✓ A non-null `streamError` forces staleness immediately without waiting for the threshold: `stale: staleInfo.stale || streamError !== null` at `src/renderer/src/hooks/useStockQuotes.ts:117`.
- ✓ `StaleDataBanner` exists at `src/renderer/src/components/StaleDataBanner.tsx:8` and the banner text reads `⚠ Prices may be delayed — last updated {minutesAgo}m ago` (`StaleDataBanner.tsx:19-20`).
- ✓ Market-status pill is forced to `DELAYED` when stale: `deriveMarketStatusDisplay` returns `'DELAYED'` when `stale` is true (`src/renderer/src/lib/market-status.ts:22`); `'DELAYED'` is a valid `MarketStatusDisplay` (`src/renderer/src/components/MarketStatusPill.tsx:3`).
- ✓ The page combines `streamError`/`dataUpdatedAt` via `deriveMarketStatusDisplay`: `PositionsListPage.tsx:189` calls `deriveMarketStatusDisplay(statusQuery.data?.session, stale)`.
- ✓ The hook emits a single combined `setStaleInfo({ stale, minutesAgo })` setState: `src/renderer/src/hooks/useStockQuotes.ts:102-106` and `94`.
- ✓ Referenced files/extracts all exist: `docs/spec/.extracts/us-32.md`, `docs/spec/.extracts/market-data-massive-migration.md`, `docs/spec/features/us-32-live-position-prices.md`, `docs/spec/architecture/02-adrs/market-status-pill.md`.

## Drift (2)

- ✗ Page (Consequences, line 28) claims the staleness setState is "marked with `// eslint-disable-next-line react-hooks/set-state-in-effect`". No such comment exists in `src/renderer/src/hooks/useStockQuotes.ts` (grep for `set-state-in-effect` and `eslint-disable` returns nothing). The effect now uses a functional `setStaleInfo((prev) => ...)` updater (`useStockQuotes.ts:102-106`) that no-ops when unchanged, so the eslint-disable is no longer present. Suggested fix: remove the eslint-disable reference from the ADR.

- ✗ Page (Consequences, line 29) describes a known limitation: "the `minutesAgo` counter won't tick forward without an interval refresh. Tracked as deferred tech debt: a periodic 30 s tick would fix it but is out of scope for US-32." The code has since implemented exactly that fix: `STALE_POLL_INTERVAL_MS = 30 * 1000` (`useStockQuotes.ts:18`) and `setInterval(evaluate, STALE_POLL_INTERVAL_MS)` re-evaluates staleness every 30 s (`useStockQuotes.ts:109`). The deferred tech-debt note is stale. Suggested fix: update the ADR to state the 30 s periodic tick is now implemented (and update the test-coverage note at line 30, which describes the pre-interval behavior).

## Unverifiable (0)

(none)

## Missing files (0)

(none)
