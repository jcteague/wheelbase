# ADR: Delta-severity thresholds shift by 0.05 when DTE ≤ 7

<!-- generated:from us-34 -->

## Decision

`deltaSeverity(absDelta, instrument, dte)` shifts every threshold down by 0.05 when `dte ≤ 7`. Base thresholds:

- CSP: warning ≥ 0.30, danger > 0.45.
- CC: warning ≥ 0.35, danger > 0.50.

With the shift, a CSP at `|delta| = 0.41` and `dte = 5` becomes `danger` (the danger threshold drops to 0.40). The `DeltaGauge` label suffix flips from `DELTA` to `DELTA · TIGHT` when `dte ≤ 7`.

## Why

Gamma rises sharply near expiry, so the same delta represents materially higher assignment risk at 5 DTE than at 30 DTE. A constant threshold under-warns near expiration. The 0.05 shift was chosen to push the trader one severity tier earlier as expiry approaches without changing far-from-expiry behaviour.

## Alternatives considered

- **Constant thresholds at all DTEs** — under-warns near expiry; misses the gamma-risk story entirely.
- **Continuous gamma-adjusted score** — harder to communicate and test; the discrete 7-day shift is the simplest reading of the management heuristic.

## Source

- `plans/us-34/data-model.md`
- `plans/us-34/plan.md` (Area 1 test case `deltaSeverity — DTE-aware shift`)
- Feature page: `../../features/us-34-position-cockpit.md`
<!-- /generated -->
