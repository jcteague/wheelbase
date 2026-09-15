# ADR: Derive `session` client-side from clock + calendar

<!-- generated:from us-31,market-data-massive-migration,us-116 -->

## Decision

`MarketStatus.session` is one of `regular | pre | post | closed`, derived client-side by comparing the broker clock's timestamp against hardcoded ET session boundaries: regular 9:30 AM–4:00 PM, pre-market 4:00–9:30 AM, post-market 4:00–8:00 PM ET. The broker's `/v2/clock` only ships `is_open` (boolean), `next_open`, and `next_close` — there is no `session` field, so the provider derives one rather than forcing every caller to re-do the math.

This is a **market-data** concern. [US-116] Market clock/session derivation lives on the `MarketDataProvider` interface (served by `AlpacaMarketDataProvider` in `src/main/integrations/alpaca-market-data.ts`, with `deriveSession` / `parseOffsetMinutes` in `alpaca-market-data-mappers.ts`) on the `market-data:market-status` IPC channel. "Is the exchange open right now" is a fact about the **market**, not about the trader's account, so it does not belong behind an optional broker relationship. There is **no** `broker:market-status` channel.

Historically this sat on `BrokerProvider`: the Alpaca→Massive migration split account, market-status and activities onto a `broker:*` namespace because Massive had no clock endpoint. US-99 retired Massive, and US-116 moved both market facts back onto the market-data port — Alpaca serves `/v2/clock` from the same trading host and key pair the provider already uses for open interest.

## Current state

`deriveSession(isOpen, timestamp)` in `src/main/integrations/alpaca-broker.ts` takes only the `is_open` boolean and the clock timestamp — it does **not** consult a market calendar. It converts the timestamp to ET hours and compares against hardcoded constants (`PRE_MARKET_START_HOUR = 4`, `REGULAR_MARKET_START_HOUR = 9.5`, `REGULAR_MARKET_END_HOUR = 16`, `POST_MARKET_END_HOUR = 20`). There is no calendar fetch or parameter, so the original us-31 "compare against the calendar's open/close times" framing is superseded by this boolean-plus-timestamp-plus-hardcoded-windows derivation. (Holidays and half-days are therefore not handled here — the trade-off the calendar approach would have addressed.)

The renderer reads market status through `window.api.broker.marketStatus` (preload bridge in `src/preload/index.ts`); the handler lives in `src/main/ipc/broker.ts`.

## Why

The acceptance criterion requires `session` as one of four enum values. The broker clock doesn't ship that field, so the provider derives it once from the inputs it does ship (`is_open` + clock timestamp, compared against hardcoded ET windows) rather than forcing every caller to do the math. Keeping it on the `BrokerProvider` interface (not `MarketDataProvider`) reflects that market data and broker are distinct vendors with distinct lifecycles — the clock comes from the broker (Alpaca), while quotes/snapshots come from Massive.

## Alternatives considered

- **Return only `is_open` boolean** — insufficient for the AC; every caller would re-derive the same enum.
- **Keep market status on `BrokerProvider` / a `broker:market-status` channel** — rejected by US-116: it gated a market fact on an optional broker relationship, leaving the market-status pill dead on any journal-only install.

## Source

- `plans/us-31/research.md`
- `plans/market-data-massive-migration/research.md`
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->
