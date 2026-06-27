---
page: docs/spec/features/us-39-massive-market-data-provider.md
audited_at: 2026-06-27
findings: 3
---

# Audit: us-39-massive-market-data-provider.md

## Verified (12)

- ✓ All 14 listed source files exist.
- ✓ `MassiveMarketDataProvider implements MarketDataProvider` — `src/main/integrations/massive-market-data.ts:104`.
- ✓ `AlpacaBrokerProvider implements BrokerProvider` — `src/main/integrations/alpaca-broker.ts:92`.
- ✓ `BrokerProvider` interface exposes `getAccountInfo()`, `getActivities(filter)`, `getMarketStatus()` — `src/main/integrations/broker-provider.ts:50-53`.
- ✓ `market-data:stock-quotes`, `market-data:option-snapshot` (singular), `market-data:option-chain` handlers registered — `src/main/ipc/market-data.ts:29,59,67`.
- ✓ `broker:activities` and `broker:market-status` handlers registered — `src/main/ipc/broker.ts:16,24`.
- ✓ Old `AlpacaMarketDataProvider` class is gone — no matches anywhere in `src/`.
- ✓ Bearer auth via built-in `fetch` (`this.authedUrl(url)`) — `src/main/integrations/massive-market-data.ts:149`.

## Drift (3)

- ✗ Page (lines 29, 56–58) claims streaming is "declared but deferred": `supportsStreaming('stockQuotes')`/`('optionQuotes')` return `true` and `stream()` **throws** `MarketDataError` with `code: 'streaming_unsupported'` (AC-9). In current code, `supportsStreaming()` takes **no argument** and returns `true` unconditionally (`massive-market-data.ts:252`), and `stream()` is **fully implemented** — it returns an Observable over a tick subject and `connect()` opens a real WebSocket (`massive-market-data.ts:256-264, 266+`). Streaming was implemented in a later story; the US-39 page is stale on this point. Suggested fix: update the streaming AC/decision to reflect that streaming now works (or note it as superseded).
- ✗ Page (lines 129, 131) names the broker channel `broker:account-info`, but the registered channel is `broker:account` — `src/main/ipc/broker.ts:9` and `src/preload/index.ts:36`. Suggested fix: rename in page to `broker:account`.
- ✗ Page (lines 44, 76–78) claims the bulk `market-data:option-snapshots` endpoint "was replaced" / the old path "deleted". The bulk channel still exists and is registered (`src/main/ipc/market-data.ts:52`) and exposed in preload as `getOptionSnapshots` (`src/preload/index.ts:32`); it also retains test coverage. The singular + chain channels were _added_ alongside it, not as a replacement. Suggested fix: state that the bulk endpoint was retained and singular/chain were added.

## Unverifiable (1)

- ? Page narrative about "no fabricated zeros" for optional Greeks and the rejected-alternatives rationale is design prose; the optional-typing intent is plausible but not mechanically asserted here.

## Missing files (0)
