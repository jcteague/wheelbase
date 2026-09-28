# ADR: Daily bars are two `MarketDataProvider` capabilities; the service owns the `end` rule

<!-- generated:from us-121 -->

## Decision

`MarketDataProvider` gains two capabilities:

- `getOptionDailyBars({ symbols, start, end? })` → `Map<occSymbol, DailyBar[]>` — a symbol with no
  bars is absent from the map (a miss, not an error).
- `getStockDailyBars({ symbol, start, end? })` → `DailyBar[]`, from the consolidated **SIP** feed.

`DailyBar = { date, vwap, close, volume, tradeCount }`, where `date` is the Eastern session day
(`etDateOf(bar.t)` — Alpaca stamps daily bars at midnight ET expressed in UTC). The IV-history
service takes only the slice `IvHistoryBarSource = Pick<MarketDataProvider, 'getOptionDailyBars' |
'getStockDailyBars'>`. Both are market facts and never touch `BrokerProvider`.

`AlpacaMarketDataProvider` hides the transport: 100 symbols per request, batches issued
sequentially, `next_page_token` followed through a shared `fetchPages` helper (also used by chain
snapshots and open interest), `feed=sip&adjustment=raw` for stocks, and `end` emitted **only when
the caller supplies one**.

**The service, not the adapter, guarantees "never name today as `end`".** `collectIvHistory`
omits `end` when the newest settled session is today, and otherwise passes that session's date.
Alpaca answers `403 OPRA agreement is not signed` when `end` is the current calendar day.

## Why

- CLAUDE.md's port rule: one capability, one port; the adapter hides how many calls it takes. The
  service reasons about sessions and symbols, not 100-symbol pages.
- The `end` rule is about the run's relationship to the trading day, which only the service
  (holding calendar and clock) knows. A "strip today" guard in the adapter would silently change a
  request instead of making the caller correct.

## Alternatives considered

- **A single `getDailyBars(kind, …)`** — two response shapes behind one name.
- **A separate `IvHistorySource` port** — a second market-data port for the same vendor and
  credentials is exactly the split US-116 undid.
- **Always omit `end`** — a backfill of historical sessions would pull hundreds of unwanted bars per
  symbol. **Clamp in the adapter** — hides the bug the rule exists to prevent.

## Source

- [extract: us-121](../../.extracts/us-121.md) — ADRs "Daily bars are two `MarketDataProvider` capabilities…", "The service, not the adapter, guarantees…"
- `plans/us-121/contracts/market-data-provider-daily-bars.md`
- `src/main/integrations/market-data-provider.ts`, `alpaca-market-data.ts`, `alpaca-market-data-mappers.ts`
- Related: [market-data-provider-interface](./market-data-provider-interface.md)
- Feature page: [us-121](../../features/us-121-iv-rank-from-own-iv-history.md)
<!-- /generated -->
