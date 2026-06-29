---
page: docs/spec/architecture/02-adrs/option-data-availability.md
audited_at: 2026-06-29
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/option-data-availability.md

## Verified (10)

- ✓ `OptionSnapshot.greeks?` is optional and is a `{ delta, gamma, theta, vega }` object of 4-dp decimal strings — matches `src/main/integrations/market-data-provider.ts:43-48` (type) and `src/main/integrations/massive-market-data.ts:90-97` (`toFixed(4)` mapping, only set when `r.greeks !== null`).
- ✓ `OptionSnapshot.impliedVolatility?` is a separate optional **top-level** 4-dp decimal string, not nested under `greeks` — matches `market-data-provider.ts:49` (top-level optional `impliedVolatility?: string`) and `massive-market-data.ts:98-100` (`snap.impliedVolatility = ...toFixed(4)`, set only when `r.implied_volatility !== null`).
- ✓ Greeks/IV populated **only** from the Massive REST options-snapshot endpoint — mapping lives only in `mapSnapResult` (`massive-market-data.ts:77-102`), called from `getOptionSnapshot` (line 217) and `getOptionChainSnapshot` (lines 236, 245), both REST. No other code path sets these fields.
- ✓ Populated only when Massive returns them — the source `SnapResult.greeks` and `implied_volatility` are typed `... | null` (`massive-market-data.ts:42-43`) and guarded by null checks before assignment.
- ✓ No live option stream carries Greeks/IV — the only stream emitter is `emitTick` (`massive-market-data.ts:113-131`), which builds a `StockQuote` from `AM` bars and never sets greeks/IV; `tickSubject` is `Subject<StreamEvent<StockQuote>>` (line 107).
- ✓ `openInterest` and `volume` typed `number | null` and always `null` from the snapshot endpoint — `market-data-provider.ts:41-42` types them `number | null`; `mapSnapResult` hard-codes `openInterest: null, volume: null` (`massive-market-data.ts:86-87`).
- ✓ Stock snapshot is an **aggregate bar**, not a live quote — `StockSnapshotResult` is documented "aggregate bars, no live bid/ask" (`massive-market-data.ts:51-60`); REST fetch hits `/v2/snapshot/.../tickers/${ticker}` (line 190).
- ✓ `StockQuote.price`/`bid`/`ask` all carry the last-minute close — `getStockQuotes` sets all three to `price = new Decimal(min.c)` (`massive-market-data.ts:194-198`); stream path `emitTick` likewise sets all three to `new Decimal(msg.c)` (lines 114-118).
- ✓ Single JSON WebSocket carries aggregate-minute (`AM`) stock bars only — `WS_URL = 'wss://delayed.massive.com/stocks'` (line 17); subscribes to `'AM.*'` (line 286); only `ev === 'AM'` messages emit ticks (lines 294-296). No option feed subscription exists.
- ✓ Source references resolve — `src/main/integrations/market-data-provider.ts` and `src/main/integrations/massive-market-data.ts` both exist with the cited `StockQuote`/`OptionSnapshot` types and Massive REST mapping.

## Drift (0)

None.

## Unverifiable (1)

- ? "Massive (a Polygon-compatible delayed-data vendor)" and the "Why"/"Alternatives considered" narrative (derive volume from option bars, source OI elsewhere, treat bid/ask as a real spread) are design rationale, not mechanical code claims. Consistent with the code (no OI/volume/spread populated) but not directly auditable.

## Missing files (0)

- Linked feature page `../../features/us-31-market-data-provider-adapter.md` exists.
