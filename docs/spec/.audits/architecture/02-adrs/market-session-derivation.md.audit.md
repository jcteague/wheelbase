---
page: docs/spec/architecture/02-adrs/market-session-derivation.md
audited_at: 2026-06-29
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/market-session-derivation.md

## Verified (11)

- ✓ `MarketStatus.session` is `regular | pre | post | closed` matches `src/main/integrations/broker-provider.ts:47` (`session: 'regular' | 'pre' | 'post' | 'closed'`)
- ✓ `deriveSession(isOpen, timestamp)` exists and takes the `is_open` boolean and clock timestamp — `src/main/integrations/alpaca-broker.ts:51`
- ✓ `deriveSession` does not consult a market calendar (no calendar fetch/param in the function body) — `src/main/integrations/alpaca-broker.ts:51-61`
- ✓ Hardcoded ET constants `PRE_MARKET_START_HOUR = 4`, `REGULAR_MARKET_START_HOUR = 9.5`, `REGULAR_MARKET_END_HOUR = 16`, `POST_MARKET_END_HOUR = 20` — `src/main/integrations/alpaca-broker.ts:38-41`
- ✓ Session derivation lives on `AlpacaBrokerProvider` implementing `BrokerProvider` — `src/main/integrations/alpaca-broker.ts:92` (`class AlpacaBrokerProvider implements BrokerProvider`)
- ✓ `getMarketStatus()` is declared on the `BrokerProvider` interface — `src/main/integrations/broker-provider.ts:53`
- ✓ `broker:market-status` IPC channel exists and calls `getProvider().getMarketStatus()` — `src/main/ipc/broker.ts:24-29`
- ✓ Provider derives session from `is_open` + clock timestamp (Alpaca `/v2/clock` returns `is_open`, `next_open`, `next_close`, `timestamp`; no `session` field) — `getMarketStatus` builds `session: deriveSession(clock.is_open, clock.timestamp)` from `getClock()` at `src/main/integrations/alpaca-broker.ts:196-209`
- ✓ Handler lives in `src/main/ipc/broker.ts` — confirmed (`registerBrokerHandlers`, channel registered at line 24)
- ✓ Renderer reads via `window.api.broker.marketStatus` preload bridge — `src/preload/index.ts:38` (`marketStatus: () => invoke('broker:market-status')` inside the `broker` namespace, line 35)
- ✓ There is **no** `market-data:market-status` channel — no such channel in `src/`; `src/main/ipc/market-data.test.ts:593` asserts `channels).not.toContain('market-data:market-status')`

## Drift (0)

_None._

## Unverifiable (1)

- ? "The Alpaca→Massive migration split account, market-status, and activities off the `MarketDataProvider` interface onto a dedicated `broker:*` namespace — the broker stays Alpaca while market data moved to Massive." The current `broker:*` namespace (account/activities/market-status) and the separate `market-data:*` channels are confirmed in code, but the historical migration narrative and the "market data moved to Massive" vendor claim are not mechanically verifiable from the source files audited. Flag for human review.

## Missing files (0)

- ✓ Feature page link `../../features/us-31-market-data-provider-adapter.md` resolves to `docs/spec/features/us-31-market-data-provider-adapter.md` (exists).
- Note: `## Source` lists `plans/us-31/research.md` and `plans/market-data-massive-migration/research.md`; per project memory the `plans/` dirs were deleted (extracts are the durable source), so these source references are stale but are not code-contract drift.
