---
page: docs/spec/architecture/02-adrs/market-session-derivation.md
audited_at: 2026-06-27
findings: 2
---

# Audit: market-session-derivation.md

## Verified (3)

- ✓ `MarketStatus.session` is one of `regular | pre | post | closed` — type at `src/main/integrations/broker-provider.ts:47`; `deriveSession` return type `src/main/integrations/alpaca-broker.ts:51`.
- ✓ Session is derived in the provider rather than pushed to callers — `deriveSession(clock.is_open, clock.timestamp)` is called inside `getMarketStatus` — `src/main/integrations/alpaca-broker.ts:204`.
- ✓ Alpaca `/v2/clock` returns `is_open`, `next_open`, `next_close` and these map onto `MarketStatus` — `src/main/integrations/alpaca-broker.ts:199-203`.

## Drift (1)

- ✗ Page (line 7) claims session is derived "by comparing the clock timestamp against **the calendar's** open/close times plus the known extended-hours windows". The implementation does NOT consult a calendar. `deriveSession(isOpen, timestamp)` takes only the boolean + timestamp and compares ET hours against hardcoded constants (`PRE_MARKET_START_HOUR`, `REGULAR_MARKET_START_HOUR`, `REGULAR_MARKET_END_HOUR`, `POST_MARKET_END_HOUR`) — `src/main/integrations/alpaca-broker.ts:51-61`. There is no calendar fetch/parameter. Suggested fix: drop "the calendar's open/close times" and describe the `is_open` + timestamp + hardcoded ET-window derivation.

## Unverifiable (1)

- ? Exact extended-hours windows "pre-market 4:00–9:30 AM ET, post-market 4:00–8:00 PM ET" — the constants exist (`alpaca-broker.ts:58-59`) but their numeric definitions were not read; the post-market "4:00 PM" start vs the page's "4:00 PM" is plausible but the page text reads "4:00–8:00 PM" which appears to be a typo for 16:00 start. Flag for human review.
