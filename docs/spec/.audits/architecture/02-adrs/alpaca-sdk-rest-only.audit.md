---
page: docs/spec/architecture/02-adrs/alpaca-sdk-rest-only.md
audited_at: 2026-06-27
findings: 1
---

# Audit: alpaca-sdk-rest-only.md

## Verified (4)

- ✓ SDK version `@alpacahq/typescript-sdk: 0.0.32-preview` matches "(v0.0.32-preview)" — `package.json`.
- ✓ SDK calls isolated in `src/main/integrations/alpaca.ts` (createClient wrapper; header comment "Nothing outside this module imports @alpacahq/typescript-sdk") — `alpaca.ts:1-4`.
- ✓ REST methods `getAccount`, `getActivity`, `getClock` are used via the SDK client — `src/main/integrations/alpaca-broker.ts:156,177,199`.
- ✓ Streaming bypasses the SDK using raw `ws`: `import WebSocket from 'ws'` / `new WebSocket(...)` in the market-data provider — `src/main/integrations/massive-market-data.ts:3,268`. (No `ws`/`WebSocket`/streaming in `alpaca.ts` or `alpaca-broker.ts`, confirming the SDK path is REST-only.)

## Drift (1)

- ✗ Page lists `getStocksQuotesLatest` among the REST endpoints used (line 7), but `grep` finds no usage of `getStocksQuotesLatest` (or `getStocksSnapshots`) anywhere under `src/`. The Alpaca broker only calls `getAccount`/`getActivity`/`getClock`; market-data quotes come from the Massive WebSocket provider, not an Alpaca REST quotes call. Suggested fix: drop `getStocksQuotesLatest` from the "endpoints where it works" list, or cite the actual caller if it exists outside what was grepped.

## Unverifiable (2)

- ? Claims about SDK bugs (`getStocksSnapshots` wrong path, `getOptionsSnapshots` omits greeks, `getActivity` ignores query params, "WebSocket support is todo", "unmaintained", "Deno-to-Node transpile via dnt") — upstream-library narrative; not mechanically auditable against this repo.
- ? "Streaming has zero SDK support so the provider implements it from scratch" — the from-scratch `ws` streaming observed lives in `massive-market-data.ts` (Massive/Polygon-compatible), not an Alpaca streaming provider; whether this is the "provider" the ADR means is ambiguous. Flag for human review.

## Missing files (0)

None.
