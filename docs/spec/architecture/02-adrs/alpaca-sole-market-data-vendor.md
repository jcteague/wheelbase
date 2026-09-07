# ADR: Alpaca's free data plan is the sole market-data vendor

<!-- generated:from us-99 -->

## Decision

`AlpacaMarketDataProvider` (`src/main/integrations/alpaca-market-data.ts`) serves the whole `MarketDataProvider` interface from Alpaca's free data plan — IEX stock snapshots, the IEX `bars` websocket, indicative option snapshots and chains, and open interest from the trading API's contracts endpoint. `MassiveMarketDataProvider`, `massive-credentials.ts`, the Massive Settings surface, and the `MASSIVE_API_KEY` / `MAIN_VITE_MASSIVE_API_KEY` configuration are deleted. `feed=opra` and `feed=sip` are never requested. The Alpaca keys the trader already saves in Settings are the only market-data credential.

This **supersedes** [shared-massive-app-configuration](./shared-massive-app-configuration.md): there is no shared, app-provided market-data credential any more, and market data is a consequence of the active broker environment.

## Context / Why

- Massive Starter cannot supply option quotes at any setting — every chain strike mapped to `0.00 / 0.00`, so the screener's `isTradeableStrike` rejected all of them and the results table read "No candidates match your criteria" with a wide-open delta band. Both Massive plans were also 15-minute delayed.
- Alpaca's free plan, probed on 2026-09-06 with the user's paper keys, covered every feed the app consumed from Massive, added real option bid/ask (two-sided on 110/140 AAPL puts, greeks on 105/140), and is real-time on IEX.
- Dropping Massive removes $58/month, a second vendor, a second secret, and the "shared app configuration" concept in Settings; the trader's single action becomes "Connect Alpaca".
- The original Alpaca → Massive move was caused by a bug in the first Alpaca provider (it defaulted to `feed=opra`, which 403s on every free account, and read `latest_quote` where Alpaca sends `latestQuote`), not by an Alpaca data gap.

## Alternatives considered

- **Composite (Massive stocks + Alpaca options)** — throwaway once Massive goes.
- **Massive Advanced ×2 ($398/mo)** — cost.
- **marketdata.app ($30)** — still a second vendor.
- **Keep Massive code as a dormant alternative** — unexercised code paths and a dead env var; the prior migration deleted the Alpaca provider the same way.

## Consequences

- Free-plan limits shape the adapter: 200 REST requests/min, one websocket connection, 30 streamed symbols, IEX (not SIP) stocks, indicative (not OPRA) options. A 405 symbol-limit frame is surfaced as a stream error, never truncated client-side.
- `CredentialStatus.marketData` replaces `massive`; `settings:test-connection` accepts only `{ vendor: 'alpaca', … }`. Settings, Positions, Screener and the LIVE-switch dialog name Alpaca as the market-data source.
- `FakeMarketDataProvider` under `FAKE_MARKET_DATA=true` is unchanged and remains the e2e path; the Alpaca adapter is pinned by recorded-fixture unit tests over a stubbed `fetch` and a mocked `ws`.
- `@msgpack/msgpack` remains an unused dependency (already unused; removal out of scope).

## Sources

- [extract: us-99](../../.extracts/us-99.md) — ADR "Alpaca's free data plan replaces Massive as the only market-data vendor"
- [feature: us-99-alpaca-market-data-provider](../../features/us-99-alpaca-market-data-provider.md)
<!-- /generated -->
