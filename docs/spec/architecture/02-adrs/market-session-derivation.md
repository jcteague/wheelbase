# ADR: Derive `session` client-side from clock + calendar

<!-- generated:from us-31,market-data-massive-migration -->

## Decision

`MarketStatus.session` is one of `regular | pre | post | closed`, derived in the provider by comparing the clock timestamp against hardcoded ET session boundaries: regular 9:30 AM–4:00 PM, pre-market 4:00–9:30 AM, post-market 4:00–8:00 PM ET. The broker's `/v2/clock` only returns `is_open` (boolean), `next_open`, and `next_close`.

## Current state

`deriveSession(isOpen, timestamp)` in `src/main/integrations/alpaca-broker.ts` takes only the `is_open` boolean and the clock timestamp — it does **not** consult a market calendar. It converts the timestamp to ET hours and compares against hardcoded constants (`PRE_MARKET_START_HOUR = 4`, `REGULAR_MARKET_START_HOUR = 9.5`, `REGULAR_MARKET_END_HOUR = 16`, `POST_MARKET_END_HOUR = 20`). There is no calendar fetch or parameter, so the original "compare against the calendar's open/close times" framing is superseded by the boolean-plus-timestamp-plus-hardcoded-windows derivation. (Holidays and half-days are therefore not handled here — the trade-off the calendar approach would have addressed.)

## Why

The acceptance criterion requires `session` as one of four enum values. The broker doesn't ship that field, so the provider derives it once from the inputs it does ship (`is_open` + clock timestamp, compared against hardcoded ET windows) rather than forcing every caller to do the math.

## Alternatives considered

- **Return only `is_open` boolean** — insufficient for the AC; every caller would re-derive the same enum.

## Source

- `plans/us-31/research.md`
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->
