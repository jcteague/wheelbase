# ADR: Derive `session` client-side from clock + calendar

<!-- generated:from us-31 -->

## Decision

`MarketStatus.session` is one of `regular | pre | post | closed`, derived in the provider by comparing the clock timestamp against the calendar's open/close times plus the known extended-hours windows (pre-market 4:00–9:30 AM ET, post-market 4:00–8:00 PM ET). Alpaca's `/v2/clock` only returns `is_open` (boolean), `next_open`, and `next_close`.

## Why

The acceptance criterion requires `session` as one of four enum values. Alpaca doesn't ship that field, so the provider derives it once from inputs Alpaca does ship (`is_open` + clock timestamp + calendar) rather than forcing every caller to do the math.

## Alternatives considered

- **Return only `is_open` boolean** — insufficient for the AC; every caller would re-derive the same enum.

## Source

- `plans/us-31/research.md`
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->
