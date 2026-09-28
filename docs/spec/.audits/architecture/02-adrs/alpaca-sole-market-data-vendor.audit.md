---
page: docs/spec/architecture/02-adrs/alpaca-sole-market-data-vendor.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/alpaca-sole-market-data-vendor.md

## Verified (9)

- ✓ `AlpacaMarketDataProvider` in `src/main/integrations/alpaca-market-data.ts` serves IEX snapshots (`STOCK_FEED = 'iex'`, `src/main/integrations/alpaca-market-data-mappers.ts:27,49-50`), the IEX websocket (`alpaca-market-data.ts:56`), indicative option snapshots/chains (`OPTION_FEED = 'indicative'`, mappers `:29,208-218`) and contracts-endpoint OI (mappers `:230`).
- ✓ Massive code removed — no `massive` / `Massive` in `src/`; no `massive-credentials.ts`.
- ✓ `feed=opra` is never requested (no `opra` feed constant in the mappers).
- ✓ `CredentialStatus.marketData` replaces `massive` — `src/main/services/settings.ts:12,168`.
- ✓ `settings:test-connection` payload accepts only `vendor: z.literal('alpaca')` — `src/main/schemas.ts:492`.
- ✓ `FakeMarketDataProvider` under `FAKE_MARKET_DATA=true` — `src/main/integrations/market-data-factory.ts:18`.
- ✓ 405 symbol-limit frame surfaced as a stream error code — `alpaca-market-data-mappers.ts:434` (`code === 405 → 'symbol_limit'`).
- ✓ `@msgpack/msgpack` still a dependency (`package.json:34`) with no import in `src/`.
- ✓ Supersession of `shared-massive-app-configuration` is recorded in both directions (that ADR carries the Superseded banner).

## Drift (1)

- ✗ Line 7 says "`feed=opra` and `feed=sip` are never requested." Since US-121 the adapter requests `feed=sip` for daily stock bars: `DAILY_STOCK_FEED = 'sip'` at `src/main/integrations/alpaca-market-data-mappers.ts:314`, set on `/v2/stocks/bars` at `:361-363` (comment: stock bars "come from the consolidated tape (SIP)"). Suggested fix: scope the claim to snapshots/stream, or note the US-121 SIP daily-bars exception (see `daily-bars-on-market-data-provider` / `iv30-from-daily-bar-vwap`).

## Unverifiable (3)

- ? Massive Starter returning `0.00 / 0.00` for every strike and the 2026-09-06 Alpaca probe results — historical observations.
- ? Pricing ($58/month, $398/mo, $30) — vendor facts.
- ? Free-plan limits (200 req/min, one websocket, 30 symbols) — vendor facts; not mechanically checked.

## Missing files (0)

- (none) — `../../.extracts/us-99.md`, `../../features/us-99-alpaca-market-data-provider.md`, `./shared-massive-app-configuration.md` exist.
