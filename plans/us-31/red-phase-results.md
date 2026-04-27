# Red Phase Results: US-31 — Market Data Provider Adapter (Layer 4 E2E)

## Feature Context

- **Feature directory**: `plans/us-31/`
- **User story**: `docs/epics/06-stories/US-31-market-data-provider-adapter.md`
- **Plan file**: `plans/us-31/plan.md`

## Test Files Created

- `src/main/integrations/alpaca-market-data.e2e.test.ts` — 16 AC-driven integration tests via factory

## Interfaces Under Test

```typescript
// src/main/integrations/market-data-factory.ts
export function createMarketDataProvider(config: MarketDataConfig): MarketDataProvider

// MarketDataProvider methods exercised end-to-end:
getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>
getOptionSnapshots(contractIds: string[]): Promise<Map<string, OptionSnapshot>>
getActivities(filter: ActivityFilter): Promise<BrokerActivity[]>
getAccountInfo(): Promise<AccountInfo>
getMarketStatus(): Promise<MarketStatus>
supportsStreaming(feed: DataFeed): boolean
connect(): Promise<void>
disconnect(): Promise<void>
stream(feed: DataFeed, symbols: string[]): Observable<StreamEvent<StockQuote | OptionSnapshot>>
```

## Test Coverage Summary (16 tests, 1 per AC)

| AC    | Test Name                                                  | Status |
| ----- | ---------------------------------------------------------- | ------ |
| AC-1  | returns stock quotes as map with 2dp prices                | ✅     |
| AC-2  | returns option snapshots with greeks and computed mid      | ✅     |
| AC-3  | returns activities sorted by transactionTime desc          | ✅     |
| AC-4  | returns account info with paper environment                | ✅     |
| AC-5  | returns market status with session type                    | ✅     |
| AC-6  | supports streaming for all three feeds                     | ✅     |
| AC-7  | streams stock quotes via Observable                        | ✅     |
| AC-8  | streams option quotes decoded from MessagePack             | ✅     |
| AC-9  | stops events after Observable unsubscribe                  | ✅     |
| AC-10 | closes sockets and completes Observables on disconnect     | ✅     |
| AC-11 | authenticates with paper credentials                       | ✅     |
| AC-12 | throws MarketDataError auth_failed on 401                  | ✅     |
| AC-13 | throws MarketDataError network_error on connection failure | ✅     |
| AC-14 | emits StreamError on unexpected WebSocket close            | ✅     |
| AC-15 | omits unknown tickers without error                        | ✅     |
| AC-16 | throws MarketDataError streaming_unsupported               | ✅     |

## Test Execution Results

```
 ✓ src/main/integrations/alpaca-market-data.e2e.test.ts (16 tests) 14ms

 Test Files  1 passed (1)
       Tests  16 passed (16)
```

## Note on Red Phase Outcome

All 16 tests passed immediately. Per the plan, this is expected: "These are test-only — no production code is written in this area. All production code was built in areas 1–3." The e2e tests confirm all 16 ACs are satisfied by the existing implementation.

## Handoff to Refactor Phase

Run `/refactor` on `src/main/integrations/alpaca-market-data.e2e.test.ts`:

- Share WebSocket simulation helpers with Area 4 tests (extract to test-utils if duplicated)
- Ensure each test is self-contained and doesn't depend on execution order
- Run `pnpm test && pnpm lint && pnpm typecheck`
