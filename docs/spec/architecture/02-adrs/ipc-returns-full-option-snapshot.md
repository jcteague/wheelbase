# ADR: `market-data:option-snapshots` returns the full `OptionSnapshot` shape

<!-- generated:from us-33,market-data-massive-migration -->

## Decision

The `market-data:option-snapshots` IPC handler returns the full provider `OptionSnapshot` shape 1:1 rather than flattening it down to `bid`/`ask`/`mid`. The IPC layer does **not** strip fields (unlike the stock-quote path, which drops fields the renderer can't use).

The snapshot carries `bid`, `ask`, `mid`, `lastTrade`, `openInterest`, `volume`, `timestamp`, plus two analytics fields surfaced **at the top level**:

- `impliedVolatility?` — a top-level optional field on `OptionSnapshot` (it is **not** nested under `greeks`).
- `greeks?` — an optional object with 4-dp `delta` / `gamma` / `theta` / `vega`.

Both are optional: a snapshot with no analytics omits them entirely, and the renderer must remain robust to their absence.

## Why

The Greeks display (delta gauge, context strip) and IV readouts need `greeks` and `impliedVolatility`; shipping the full shape means the renderer reads them without a follow-up contract change. The data the provider already produces is cheap to forward and saves an iteration. Keeping `impliedVolatility` at the top level (rather than tucked inside `greeks`) lets the renderer read IV even when the Greeks block is absent.

## Alternatives considered

- **Flatten the IPC type to only `bid`/`ask`/`mid`** — would require an additive contract change later for the same upstream data.
- **Compute greeks per-call in a derived endpoint** — adds an indirection layer without a payoff.
- **Nest `impliedVolatility` under `greeks`** — superseded; IV is now a sibling top-level field so it survives when `greeks` is undefined.

## Source

- `src/main/integrations/market-data-provider.ts` (`OptionSnapshot` type — `greeks?`, top-level `impliedVolatility?`)
- `src/main/ipc/market-data.ts` (`market-data:option-snapshots` handler)
- Driven by: [us-33 — option mid-price & unrealized P&L](../../features/us-33-option-mid-pnl.md)
- Revised by: [market-data Alpaca→Massive migration](../../features/market-data-massive-migration.md)
<!-- /generated -->
