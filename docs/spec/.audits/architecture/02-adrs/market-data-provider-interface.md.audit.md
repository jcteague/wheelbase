---
page: docs/spec/architecture/02-adrs/market-data-provider-interface.md
audited_at: 2026-06-29
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/market-data-provider-interface.md

## Verified (19)

- ✓ `MarketDataProvider` is declared as a TypeScript `type`, not an `interface` — `src/main/integrations/market-data-provider.ts:84` (`export type MarketDataProvider = {`).
- ✓ `getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>` — `market-data-provider.ts:85`.
- ✓ `getOptionSnapshot(contractId: string): Promise<OptionSnapshot>` — `market-data-provider.ts:86`.
- ✓ `getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionSnapshot[]>` — `market-data-provider.ts:87`.
- ✓ `OptionChainFilter` carries `underlying` plus optional `expirationFrom/To`, `type`, `strikeFrom/To`, `limit`, `cursor` — `market-data-provider.ts:53-62`.
- ✓ `supportsStreaming(feed)`, `connect(feeds?)`, `disconnect()` present — `market-data-provider.ts:88-90`.
- ✓ `stream(feed, symbols): Observable<StreamEvent<StockQuote | OptionSnapshot>>` returns an RxJS `Observable` (`import type { Observable } from 'rxjs'`) — `market-data-provider.ts:1,91-94`.
- ✓ Factory is the object `marketDataFactory` in `src/main/integrations/market-data-factory.ts`, not a `createMarketDataProvider(config)` function — `market-data-factory.ts:28`.
- ✓ Factory methods: `configure({ loadMassiveApiKey })` resets cache, `create()` (cached), `recreate()` (resets cache, returns `void`), `disconnect()` — `market-data-factory.ts:29-42`. Note: `configure` takes the full `{ loadMassiveApiKey }` config object as the ADR states.
- ✓ `create()` returns `FakeMarketDataProvider` when `process.env.FAKE_MARKET_DATA === 'true'` — `market-data-factory.ts:14-15`.
- ✓ Otherwise returns `MassiveMarketDataProvider` when the key loader yields a key — `market-data-factory.ts:17-19`; class in `src/main/integrations/massive-market-data.ts:104`.
- ✓ Otherwise throws `"Market data provider not configured. Set MASSIVE_API_KEY or FAKE_MARKET_DATA=true."` — `market-data-factory.ts:21-23`.
- ✓ No `config.provider` union and no `'alpaca'` branch in the factory — confirmed by reading `market-data-factory.ts` in full.
- ✓ `loadMassiveApiKey` in `src/main/integrations/massive-credentials.ts` prefers `MAIN_VITE_MASSIVE_API_KEY` and falls back to `process.env.MASSIVE_API_KEY` — `massive-credentials.ts:4`.
- ✓ `MassiveMarketDataConfig = { apiKey: string }` — `massive-market-data.ts:20`.
- ✓ Base URL `https://api.massive.com` over global `fetch`, key as `?apiKey=` query param, no SDK — `massive-market-data.ts:16,139-143,149`.
- ✓ Single JSON WebSocket `wss://delayed.massive.com/stocks` with `{action:'auth',params:<apiKey>}` then `{action:'subscribe',params:'AM.*'}` — `massive-market-data.ts:17,272,286`.
- ✓ `BrokerProvider` / `AlpacaBrokerProvider` exist on the broker layer — `src/main/integrations/broker-provider.ts:50`, `src/main/integrations/alpaca-broker.ts:92`.
- ✓ Feature page `../../features/us-31-market-data-provider-adapter.md` exists — `docs/spec/features/us-31-market-data-provider-adapter.md`.

## Drift (0)

None.

## Unverifiable (2)

- ? "Account info, market status/clock, and broker activities ... moved to `BrokerProvider`": partially verifiable. The broker layer does own these via the `broker:*` IPC namespace (`broker:account`, `broker:activities`, `broker:market-status` in `src/main/ipc/broker.ts:9,16,24`), and the market-data namespace explicitly asserts it does NOT register them (`src/main/ipc/market-data.test.ts:584,593`). The narrative migration framing itself ("moved to") is historical and not mechanically verifiable, but the end-state is confirmed.
- ? The "Why" / "Alternatives considered" sections are design rationale (e.g. "makes integration tests trivial", "models request/response vs. push correctly") — narrative, not auditable.

## Missing files (0)

None. All cited source files exist: `market-data-factory.ts`, `massive-market-data.ts`, `massive-credentials.ts`, `market-data-provider.ts` (all in `src/main/integrations/`).

## Note

- The ADR claims "there is no `market-data:market-status` channel." A grep confirms no such channel is registered; the only matches are in `broker.ts` (`broker:market-status`) and a negative-assertion test in `market-data.test.ts:593` (`expect(channels).not.toContain('market-data:market-status')`). Claim holds.
