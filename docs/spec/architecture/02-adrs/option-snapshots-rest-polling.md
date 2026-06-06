# ADR: REST polling for option snapshots, disabled when market closed

<!-- generated:from us-33 -->

## Decision

`useOptionSnapshots(legs, { session })` uses TanStack Query with `refetchInterval: session === 'closed' ? false : 60_000`, `staleTime: 30_000`, `refetchOnWindowFocus: true`, and `enabled: symbols.length > 0`. There is no streaming bridge for options.

## Why

Alpaca's option-snapshot REST endpoint returns Greeks; the option-quote streaming feed does not (see ADR [option-data-availability](./option-data-availability.md)). Until streaming carries Greeks, REST polling is simpler and sufficient. 60 s matches the cadence the story specifies and aligns with US-32's stock-quote rhythm; pausing entirely when `session === 'closed'` avoids wasted requests outside market hours.

## Alternatives considered

- **Stream option quotes via the existing WebSocket bridge** — the stream lacks Greeks, which US-33 and US-34 both depend on.
- **Match US-32's `staleTime: Infinity` + stream merge** — REST polling is simpler and ample at 60 s.

## Source

- `plans/us-33/research.md`
- `plans/us-33/plan.md`
- Feature page: `../../features/us-33-option-mid-pnl.md`
<!-- /generated -->
