# ADR: `market-data:option-snapshots` returns the full `OptionSnapshot` shape

<!-- generated:from us-33,market-data-massive-migration -->

## Decision

The `market-data:option-snapshots` IPC handler returns `IpcOptionSnapshot` 1:1 with the provider's `OptionSnapshot` — including `greeks`, `lastTrade`, `openInterest`, and `volume`. The IPC layer does **not** strip fields (unlike `IpcStockQuote`, which drops `change`/`changePercent` because they're hardcoded to `0.00`).

## Why

US-34 needs `greeks` for the delta gauge and context strip; shipping the full shape from US-33 means the renderer reads greeks without a follow-up contract change. The data the provider already produces is cheap to forward and saves an iteration.

## Alternatives considered

- **Flatten the IPC type to only `bid`/`ask`/`mid` for US-33** — would require an additive contract change in US-34 for the same upstream data.
- **Compute greeks per-call in a derived endpoint** — adds an indirection layer without a payoff.

## Source

- `plans/us-33/contracts/market-data-option-snapshots.md`
- Feature page: `../../features/us-33-option-mid-pnl.md`
<!-- /generated -->
