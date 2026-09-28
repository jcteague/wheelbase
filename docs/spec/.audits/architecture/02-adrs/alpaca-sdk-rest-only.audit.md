---
page: docs/spec/architecture/02-adrs/alpaca-sdk-rest-only.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/architecture/02-adrs/alpaca-sdk-rest-only.md

## Verified (6)

- ✓ `@alpacahq/typescript-sdk` pinned at `0.0.32-preview` — `package.json:60`.
- ✓ `src/main/integrations/alpaca-broker.ts` is the only non-test module importing the SDK — `alpaca-broker.ts:2` (grep of `src/`).
- ✓ Broker uses SDK `getAccount` and `getActivity` — `alpaca-broker.ts:129,150`.
- ✓ Market data uses raw `fetch` against `https://data.alpaca.markets` (`src/main/integrations/alpaca-market-data-mappers.ts:25`) for `/v2/stocks/snapshots` (:50) and `/v1beta1/options/snapshots…` (:213,218), plus the trading host's `/v2/options/contracts` (:230), with `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` headers (`src/main/integrations/alpaca-market-data.ts:93-94`); streams from `wss://stream.data.alpaca.markets/v2/iex` (`alpaca-market-data.ts:56`).
- ✓ Massive-era code gone — no `massive-market-data.ts` in `src/main/integrations/`.
- ✓ Settings probe calls `${ALPACA_TRADING_BASE_URLS[env]}/v2/account` — `src/main/services/settings-connections.ts:2,97`; host map in `src/main/integrations/alpaca-hosts.ts:5-6`.

## Drift (2)

- ✗ Line 22 says the broker uses the SDK for `getAccount`, `getClock`, and `getActivity`. `alpaca-broker.ts` has no `getClock` call; the market clock (and calendar) are now served by the market-data adapter over raw `fetch` — `${ALPACA_TRADING_BASE_URLS[environment]}/v2/clock` at `src/main/integrations/alpaca-market-data-mappers.ts:281` (and `/v2/calendar` at :289), matching CLAUDE.md's "market facts belong on `MarketDataProvider`". Suggested fix: drop `getClock` from the broker list and note the clock moved to the market-data adapter.
- ✗ Line 25 says `src/main/integrations/alpaca.ts` "remains `@deprecated`". The file does not exist (`ls src/main/integrations/` has no `alpaca.ts`; no `@deprecated` marker in the integrations directory). Suggested fix: remove the bullet or record the file's deletion.

## Unverifiable (2)

- ? SDK bug list (`getStocksSnapshots` wrong path, `getOptionsSnapshots` typing, `getActivity` ignoring params) — third-party behaviour.
- ? The market-data endpoint list is not exhaustive (US-121 added `/v1beta1/options/bars` and `/v2/stocks/bars`, `alpaca-market-data-mappers.ts:352,363`), but those are also raw `fetch`, consistent with the decision.

## Missing files (0)

- (none) — `docs/spec/.extracts/us-31.md`, `docs/spec/.extracts/us-99.md`, `plans/market-data-massive-migration/research.md`, `plans/us-99/contracts/alpaca-market-data.md`, and both feature pages exist.
