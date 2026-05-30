# Research: US-39 (Massive Market Data) + US-31 rewrite + US-40 (Alpaca Broker)

This plan bundles three stories because they implement one architectural split together:

- **US-31 (rewrite)** — split the existing `MarketDataProvider` into `MarketDataProvider` + `BrokerProvider`
- **US-39** — implement `MassiveMarketDataProvider` against the new `MarketDataProvider`
- **US-40** — implement `AlpacaBrokerProvider` against the new `BrokerProvider`

The split is not optional: US-39 alone leaves `getActivities` / `getAccountInfo` / `getMarketStatus` orphaned, and US-40 alone leaves the renderer's market-data path dangling. They ship together.

---

## Existing Code That Is Affected

| File                                                    | Current role                                                                    | Action in this plan                                                                                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/integrations/market-data-provider.ts`         | Combined interface with quotes, options, activities, account, status, streaming | **Split.** Keep market-data half; move broker half to new `broker-provider.ts`.                                                                                                                    |
| `src/main/integrations/alpaca-market-data.ts`           | Concrete Alpaca impl of the combined interface                                  | **Retire as the market-data provider.** Extract broker-side methods into new `alpaca-broker.ts`. Delete or shrink the remainder.                                                                   |
| `src/main/integrations/alpaca-market-data.test.ts`      | Tests for the combined Alpaca impl                                              | **Split.** Market-data tests die (Alpaca no longer ships market data); broker-side tests migrate to `alpaca-broker.test.ts`.                                                                       |
| `src/main/integrations/alpaca-market-data.e2e.test.ts`  | Live-API smoke for Alpaca                                                       | **Split.** Broker-side stays; market-data side retired.                                                                                                                                            |
| `src/main/integrations/market-data-factory.ts`          | Wires Alpaca or Fake provider                                                   | **Rewrite.** Returns Massive (market data) and Alpaca-broker (broker) from separate factories.                                                                                                     |
| `src/main/integrations/market-data-factory.test.ts`     | Factory tests                                                                   | **Update** for two-vendor wiring.                                                                                                                                                                  |
| `src/main/integrations/fake-market-data.ts`             | Test double                                                                     | **Split** into `FakeMarketDataProvider` (no broker methods) and `FakeBrokerProvider`.                                                                                                              |
| `src/main/integrations/alpaca.ts`                       | Lazy client factory                                                             | **Keep** — both Massive and Alpaca-broker can ignore it or reuse the credential-loading pattern.                                                                                                   |
| `src/main/integrations/alpaca-stream-test-utils.ts`     | Streaming test helpers                                                          | **Keep** — until Massive streaming lands. Likely renamed when generic streaming utilities ship.                                                                                                    |
| `src/main/ipc/market-data.ts`                           | IPC handlers for stock/option/account/status                                    | **Split.** Stock + option quote channels stay on the market-data namespace and route to Massive; account/activities/market-status channels move to new `broker.ts` IPC and route to Alpaca-broker. |
| `src/renderer/src/api/positions.ts` (and similar hooks) | Consumes market-data IPC                                                        | **Audit & update** if any hook calls account-related channels — those move to broker namespace.                                                                                                    |

---

## Decisions

### Massive REST endpoints to use (US-39)

- **Decision:** `GET /v3/quotes/{ticker}/last` for stock NBBO; `GET /v3/snapshot/options/{underlying}/{contract}` for per-contract option snapshot; `GET /v3/snapshot/options/{underlying}` with filters for chain.
- **Rationale:** Confirmed available in Massive docs ([llms.txt](https://massive.com/docs/llms.txt)). Per-contract snapshot returns Greeks + IV directly. Chain endpoint supports `strike_price`, `expiration_date.gte/lte`, `contract_type`, `limit`, cursor pagination via `next_url`.
- **Alternatives considered:** Custom bars / aggregates — rejected as we need NBBO not OHLC; option Trades/Quotes endpoints — rejected as they don't include Greeks.

### Massive auth

- **Decision:** `Authorization: Bearer ${apiKey}` header on every request.
- **Rationale:** Massive docs offer both `?apiKey=` query and Authorization header; header keeps keys out of logs and URL captures. Same key for paper or live (Massive has no environment distinction).
- **Source:** [https://massive.com/docs/rest/quickstart#authenticate-your-request](https://massive.com/docs/rest/quickstart#authenticate-your-request)

### Massive HTTP client

- **Decision:** Platform `fetch` (Node 20+) directly. No SDK dependency.
- **Rationale:** Massive does not yet publish a Node SDK; manual fetch with a small typed wrapper is straightforward and matches the existing Alpaca integration boundary pattern. Keeps the dependency tree thin.

### WebSocket streaming for Massive

- **Decision:** Deferred to a follow-on story. `MassiveMarketDataProvider.supportsStreaming("stockQuotes")` and `supportsStreaming("optionQuotes")` return `true` but `stream()` throws `MarketDataError('streaming_unsupported')` until the follow-up lands.
- **Rationale:** REST polling meets Phase 2 needs; WebSocket auth (auth-message-after-connect) is non-trivial and orthogonal to the architectural split.
- **Alternative:** Implement streaming immediately — rejected to keep scope manageable.

### Greeks-may-be-missing handling

- **Decision:** `greeks` and `impliedVolatility` are typed as **optional** on `OptionSnapshot`. Adapter does not fabricate zeros.
- **Rationale:** Massive's chain snapshot may omit Greeks for deep ITM contracts. Existing consumers (US-34 Greeks panel) need to handle missing values cleanly anyway.
- **Migration concern:** Current `OptionSnapshot` type makes `greeks` required. This is a breaking change for renderer code that reads them. Plan calls out the renderer audit.

### Where `getMarketStatus` lives

- **Decision:** On `BrokerProvider` (Alpaca).
- **Rationale:** Alpaca already exposes a single, convenient `/v2/clock`. Massive's market-status endpoint is per-asset-class. Co-locating with broker keeps consumer code simple.
- **Alternative:** Move to MarketDataProvider — rejected; per-asset Massive endpoint is awkward and the trader's broker is the source of truth for "is my order venue open" anyway.

### Old `alpaca-market-data.ts` disposition

- **Decision:** Delete entirely after broker-side methods are extracted. No fallback Alpaca market-data path.
- **Rationale:** The user explicitly chose Massive for market data. A dual path doubles maintenance for no user benefit. If Massive credentials are missing, the UI surfaces a "Configure Massive" message (US-37) rather than silently falling back to Alpaca.

### `FakeMarketDataProvider` split

- **Decision:** Split into `FakeMarketDataProvider` (quotes / options / streaming) and `FakeBrokerProvider` (account / activities / market status). Both used in tests.
- **Rationale:** Mirrors the production split. Each fake can be wired independently in tests, matching real isolation.

### IPC channel naming

- **Decision:**
  - Market-data channels keep the `market-data:` prefix and route to Massive: `market-data:stock-quotes`, `market-data:option-snapshots`.
  - Broker channels get a new `broker:` prefix and route to Alpaca-broker: `broker:account`, `broker:activities`, `broker:market-status`.
- **Rationale:** Channel prefixes mirror provider boundaries so TanStack Query keys stay clean (`['market', ...]` vs `['broker', ...]`) and US-37's scoped invalidation works.

### Settings reload behaviour

- **Decision:** Factories cache provider instances and recreate them on credential change. No singleton state in the providers themselves.
- **Rationale:** Required by US-37's "removing Massive credentials disables market data" scenario without restarting the app.

---

## Open Items (Not Blockers)

- **Massive base URL** — confirm `https://api.massive.com` (not `https://api.polygon.io` legacy host). Test in `quickstart.md` step 1.
- **Massive rate limits** — unspecified in public docs index. Plan assumes generous limits and 429 retry; implementer should monitor in dev.
- **Renderer breaking change for missing Greeks** — audit step listed; if many components break, US-34's display story may need a parallel revision.

---

## References

- Massive REST docs index: [https://massive.com/docs/llms.txt](https://massive.com/docs/llms.txt)
- Option contract snapshot: [https://massive.com/docs/rest/options/snapshots/option-contract-snapshot.md](https://massive.com/docs/rest/options/snapshots/option-contract-snapshot.md)
- Option chain snapshot: [https://massive.com/docs/rest/options/snapshots/option-chain-snapshot.md](https://massive.com/docs/rest/options/snapshots/option-chain-snapshot.md)
- Auth: [https://massive.com/docs/rest/quickstart#authenticate-your-request](https://massive.com/docs/rest/quickstart#authenticate-your-request)
- Stories: `docs/epics/06-stories/US-31-market-data-provider-adapter.md`, `US-39-massive-market-data-provider.md`, `US-40-alpaca-broker-provider.md`
