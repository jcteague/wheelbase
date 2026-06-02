# ADR: Wide-spread and no-bid as pure renderer predicates

<!-- generated:from us-33 -->

## Decision

Two pure helpers live in `src/renderer/src/lib/option-display.ts`:

- `isWideSpread({ bid, ask, mid })` returns `true` when `mid > 0 && (ask − bid) / mid > 0.10`. When `mid === 0` the predicate returns `false` — the "no bid" indicator owns that case.
- `hasNoBid({ bid })` returns `true` when `Decimal(bid).isZero()` (so `'0'`, `'0.00'`, `'0.0000'` all match).

`WIDE_SPREAD_THRESHOLD = 0.1` is exported alongside the predicates.

## Why

The 10% threshold is fixed by the story (not configurable). Keeping the predicates pure and per-row with no React state makes them directly unit-testable and lets `OptMidCell` render the right state purely from inputs. The mid-zero / no-bid split keeps the two warning UIs from stomping on each other.

## Alternatives considered

- **Compute the predicates inside `OptMidCell`** — embeds rules inside a component that also handles layout; harder to test in isolation.
- **Server-side flags on the IPC payload** — the renderer already has bid/ask/mid; adding flags duplicates state.

## Source

- `plans/us-33/research.md`
- `plans/us-33/data-model.md`
- `plans/us-33/plan.md`
- Feature page: `../../features/us-33-option-mid-pnl.md`
<!-- /generated -->
