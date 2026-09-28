---
page: docs/spec/architecture/02-adrs/daily-bars-on-market-data-provider.md
audited_at: 2026-09-28
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/daily-bars-on-market-data-provider.md

## Verified (10)

- ✓ `getOptionDailyBars({ symbols } & DailyBarRange): Promise<Map<string, DailyBar[]>>` and `getStockDailyBars({ symbol } & DailyBarRange): Promise<DailyBar[]>` on `MarketDataProvider` — `src/main/integrations/market-data-provider.ts:140,142`.
- ✓ `DailyBarRange = { start, end? }` — `market-data-provider.ts:103-108`.
- ✓ `DailyBar = { date, vwap, close, volume, tradeCount }`, `date` the Eastern session day — `src/main/core/iv30.ts:28-34`; mapped with `etDateOf(new Date(raw.t))` — `src/main/integrations/alpaca-market-data-mappers.ts:370`.
- ✓ `IvHistoryBarSource = Pick<MarketDataProvider, 'getOptionDailyBars' | 'getStockDailyBars'>` — `market-data-provider.ts:160-162`; consumed by `src/main/services/iv-history.ts:28,51`.
- ✓ Not on `BrokerProvider` — no daily-bars method in `broker-provider.ts` / `alpaca-broker.ts`.
- ✓ 100 symbols per request, batches sequential — `OPTION_BARS_BATCH_SIZE = 100` (`alpaca-market-data-mappers.ts:315`), sequential loop at `src/main/integrations/alpaca-market-data.ts:257-272`.
- ✓ Shared `fetchPages` helper following `next_page_token`, also used for chain snapshots and contracts — `alpaca-market-data.ts:185,309,327-337,350`.
- ✓ Stocks request `feed=sip&adjustment=raw` — `alpaca-market-data-mappers.ts:314,361-363`.
- ✓ `end` emitted only when supplied — `if (range.end !== undefined) params.set('end', range.end)` at `alpaca-market-data-mappers.ts:340`.
- ✓ Service owns the "never name today" rule — `src/main/services/iv-history.ts:89-92` (`newest < etDateOf(now) ? { start, end: newest } : { start }`).

## Drift (0)

## Unverifiable (1)

- ? Alpaca returns `403 OPRA agreement is not signed` when `end` is today — vendor behaviour.

## Missing files (0)

- (none) — `../../.extracts/us-121.md`, `plans/us-121/contracts/market-data-provider-daily-bars.md`, the three cited source files, `./market-data-provider-interface.md`, and the US-121 feature page exist.
