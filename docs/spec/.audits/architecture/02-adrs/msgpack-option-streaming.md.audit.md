---
page: docs/spec/architecture/02-adrs/msgpack-option-streaming.md
audited_at: 2026-06-29
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/msgpack-option-streaming.md

## Verified (7)

- ✓ Page claims `@msgpack/msgpack` is a declared dependency in `package.json` at `^3.1.3`. Confirmed: `package.json:34` — `"@msgpack/msgpack": "^3.1.3"`.
- ✓ Page claims `@msgpack/msgpack` is "no longer imported anywhere in `src/`" and that no `msgpack`, `decodeMulti`, or `@msgpack/msgpack` reference exists in current source. Confirmed: `grep -rn "@msgpack/msgpack\|msgpack\|decodeMulti" src/` returns no matches.
- ✓ Page claims the live market-data provider is Massive at `src/main/integrations/massive-market-data.ts`. Confirmed: file exists.
- ✓ Page claims it streams over a single JSON WebSocket at `wss://delayed.massive.com/stocks`. Confirmed: `massive-market-data.ts:17` — `const WS_URL = 'wss://delayed.massive.com/stocks'`; only one `new WebSocket(...)` call exists in the file (`massive-market-data.ts:268`), so there is no second option socket.
- ✓ Page claims option data is served via REST snapshots (`/v3/snapshot/options/...`). Confirmed: `massive-market-data.ts:215` and `:232` build `${BASE_URL}/v3/snapshot/options/...` URLs.
- ✓ Page claims the stream carries aggregate-minute `AM` bars. Confirmed: `massive-market-data.ts:25` (`ev: 'AM'`) and `:294` (`else if (msg.ev === 'AM')`).
- ✓ Page claims no OPRA feed / no binary/MessagePack decode path. Confirmed: no `OPRA`/`opra`, `msgpack`, or `decodeMulti` reference anywhere in `src/`.

## Drift (0)

None.

## Unverifiable (2)

- ? "Status: Superseded — never shipped." Historical/process claim about an Alpaca design that predates current source; not mechanically verifiable beyond confirming the absence of any msgpack/option-socket code (which is confirmed above). Consistent with code reality.
- ? The entire "Decision (as originally specified)" / "Why" / "Alternatives considered" sections describe a design that never reached `src/` (Alpaca `decodeMulti()`, `msgpack-lite` comparison). These are retained-for-history narrative claims with no current code to verify against; flagged as expected given the Superseded status.

## Missing files (0)

- ✓ Link to `../../features/us-31-market-data-provider-adapter.md` resolves — `docs/spec/features/us-31-market-data-provider-adapter.md` exists.
- ✓ Link to `../../features/market-data-massive-migration.md` resolves — `docs/spec/features/market-data-massive-migration.md` exists.
