# ADR: REST polling for option snapshots, disabled when market closed

<!-- generated:from us-33,market-data-massive-migration -->

## Decision

`useOptionSnapshots(legs, { session })` uses TanStack Query with `refetchInterval: session === 'closed' ? false : 60_000`, `staleTime: 30_000`, `refetchOnWindowFocus: true`, and `enabled: symbols.length > 0`. Option snapshots are read over REST against the Massive provider (`MassiveMarketDataProvider`) — there is no streaming bridge for options.

Massive serves option reads under `/v3/snapshot/options/{underlying}`:

- **Single contract:** `/v3/snapshot/options/{underlying}/{O:contract}` → `getOptionSnapshot(contractId)`
- **Chain:** `/v3/snapshot/options/{underlying}` filtered by `expiration_date.gte/lte`, `contract_type`, `strike_price.gte/lte` (and `limit`/`cursor`), paginated via `next_url` when no `limit` → `getOptionChainSnapshot(filter)`

These reach the renderer over three IPC channels on the `market-data:*` namespace: `market-data:option-snapshots` (bulk), `market-data:option-snapshot` (single), and `market-data:option-chain`.

## Why

Massive's option-snapshot REST reads return Greeks and IV; the streaming feed (a single JSON WebSocket carrying aggregate-minute stock frames only) carries no option data (see ADR [option-data-availability](./option-data-availability.md)). Until streaming carries Greeks, REST polling is simpler and sufficient. 60 s matches the cadence the story specifies and aligns with US-32's stock-quote rhythm; pausing entirely when `session === 'closed'` avoids wasted requests outside market hours.

## Alternatives considered

- **Stream option quotes via the WebSocket bridge** — the Massive socket carries only `AM` aggregate-minute stock frames, no option data or Greeks, which US-33 and US-34 both depend on.
- **Match US-32's `staleTime: Infinity` + stream merge** — REST polling is simpler and ample at 60 s.

## Source

- `plans/us-33/research.md`
- `plans/us-33/plan.md`
- `plans/market-data-massive-migration/research.md` (Massive REST paths; bulk/single/chain channels)
- Feature page: `../../features/us-33-option-mid-pnl.md`
- Feature page: `../../features/market-data-massive-migration.md`
<!-- /generated -->
