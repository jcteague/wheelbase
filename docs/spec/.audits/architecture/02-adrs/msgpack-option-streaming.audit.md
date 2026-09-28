---
page: docs/spec/architecture/02-adrs/msgpack-option-streaming.md
audited_at: 2026-09-28
findings: 3
---

# Audit: msgpack-option-streaming.md

## Verified (3)

- ✓ Status "Superseded — never shipped" — no `msgpack` / `decodeMulti` / `@msgpack/msgpack` reference anywhere in `src/`.
- ✓ `@msgpack/msgpack` `^3.1.3` still declared — `package.json:34`.
- ✓ No binary decode path: the live stream parses JSON text frames (`src/main/integrations/alpaca-market-data-mappers.ts:400-408`).

## Drift (1)

- ✗ "Current state" (line 23) says in the present tense that the live provider is **Massive** (`src/main/integrations/massive-market-data.ts`) streaming `AM` bars at `wss://delayed.massive.com/stocks`. Massive was retired by US-99: the factory builds `AlpacaMarketDataProvider` (`src/main/integrations/market-data-factory.ts:17-22`), streaming per-symbol `bars` on `wss://stream.data.alpaca.markets/v2/iex` (`alpaca-market-data.ts:56`). The "never shipped / no MessagePack" conclusion still holds. Suggested fix: update the current-state paragraph to Alpaca IEX JSON.

## Unverifiable (2)

- ? Why `decodeMulti()` over `decode()` and the `msgpack-lite` alternative — historical rationale for an unshipped design.
- ? "Alpaca's documentation referenced" `@msgpack/msgpack` — external claim.

## Missing files (2)

- ✗ `src/main/integrations/massive-market-data.ts` (cited as the live provider) does not exist.
- ✗ Source `plans/us-31/research.md` does not exist (`plans/us-31/` removed; durable source is `docs/spec/.extracts/us-31.md`). `plans/market-data-massive-migration/research.md` exists.
