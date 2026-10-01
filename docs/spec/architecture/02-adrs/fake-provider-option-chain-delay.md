# ADR: Test-only option-chain delay in the fake market-data provider

<!-- generated:from us-101 -->

## Decision

`FakeMarketDataProvider.getOptionChainSnapshot` waits `FAKE_OPTION_CHAIN_DELAY_MS` milliseconds (default 0) after its `maybeThrow()` fault check. The value is read through the file's `parseEnv<number>` seam, not a bare `process.env` lookup. The delay does **not** apply to `getOptionSnapshot` or `getStockQuotes`.

## Context / Why

- Without it, the e2e check for the `Loading call contracts…` notice is a race: the fake answers before the notice renders.

## Alternatives considered

- **Assert the loading state only in a component test.** Rejected: the AC scenario is end-to-end.
- **Put a fixed 2-second delay on every fixture.** Rejected: it slows every spec to cover one.

## Consequences

- Only the loading-notice spec sets the variable. Every other spec sees an instant chain.
- It joins the fake provider's other env-driven e2e seams. The delay applies after fault injection, so a spec can combine it with a programmed failure.

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
<!-- /generated -->
