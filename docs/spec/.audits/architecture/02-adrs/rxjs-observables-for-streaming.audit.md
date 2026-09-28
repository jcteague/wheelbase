---
page: docs/spec/architecture/02-adrs/rxjs-observables-for-streaming.md
audited_at: 2026-09-28
findings: 3
---

# Audit: rxjs-observables-for-streaming.md

## Verified (5)

- ✓ `rxjs` is a dependency — `package.json:51` (`"rxjs": "^7.8.2"`).
- ✓ `stream(feed, symbols)` returns `Observable<StreamEvent<StockQuote | OptionSnapshot>>` on the port — `src/main/integrations/market-data-provider.ts:147-150`; implemented in `alpaca-market-data.ts:509-521` and `fake-market-data.ts:352`.
- ✓ REST methods `getStockQuotes`, `getMarketStatus` return `Promise` — `market-data-provider.ts:131,134`; `getActivities`/`getAccountInfo` return `Promise` on the broker port — `src/main/integrations/broker-provider.ts:47-48`.
- ✓ Errors flow through the Observable error channel as a `StreamError` — `alpaca-market-data.ts:494-501` (`failStream` calls `failing.error(streamError)`); `StreamError` type at `market-data-provider.ts:120-125`.
- ✓ Feature link `../../features/us-31-market-data-provider-adapter.md` exists.

## Drift (2)

- ✗ Page names a REST method `getOptionSnapshots` (line 7). The port has `getOptionSnapshot(contractId)` (singular) and `getOptionChainSnapshot(filter)` — `market-data-provider.ts:132-133`. Suggested fix: name the actual methods.
- ✗ Page says "teardown via `subscription.unsubscribe()` sends the WebSocket unsubscribe message" (line 7). The stream is `defer(() => tickSubject.pipe(filter(...)))` with no `finalize`/teardown hook (`alpaca-market-data.ts:1,518-520`); the `unsubscribe` frame is only sent by `reconcileSubscriptions` when a later `stream()` call passes a symbol set that drops symbols (`alpaca-market-data.ts:525-541`). Unsubscribing an RxJS subscription does not send anything to the socket. Suggested fix: describe the delta-reconcile-on-next-`stream()` behaviour.

## Unverifiable (1)

- ? Rationale about downstream operator use (`retry`, `shareReplay`, `debounceTime`) and native WICG Observable availability — narrative; not audited. Source `plans/us-31/research.md` is a historical plan artifact (plan dir no longer present, by design).

## Missing files (0)

None.
