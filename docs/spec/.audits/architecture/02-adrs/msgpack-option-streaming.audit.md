---
page: docs/spec/architecture/02-adrs/msgpack-option-streaming.md
audited_at: 2026-06-27
findings: 1
---

# Audit: msgpack-option-streaming.md

## Verified (0)

(No claim in the page could be confirmed against current src.)

## Drift (1)

- ✗ Page claims option WebSocket frames are decoded with `@msgpack/msgpack` using `decodeMulti()`. No `msgpack`, `decodeMulti`, or `@msgpack/msgpack` reference exists anywhere in `src/` (`grep -rn "msgpack\|decodeMulti" src/` returns nothing). The shipped market-data provider is **Massive**, which uses REST snapshots and an RxJS tick subject for streaming (`src/main/integrations/massive-market-data.ts:256-263`), not an Alpaca MessagePack option socket. The `@msgpack/msgpack` dependency does not appear to be used. Suggested fix: this ADR describes an Alpaca-streaming design that was not shipped; mark it superseded by the Massive provider or remove.

## Unverifiable (2)

- ? "Alpaca batches multiple packed objects per binary frame" and "naïve `decode()` throws RangeError" — Alpaca-behaviour narrative; not applicable to the shipped Massive provider and not checkable against src.
- ? "Stock frames stay on JSON; only the option socket uses MessagePack" — no such split exists in code; effectively drift but rooted in the unshipped Alpaca design.
