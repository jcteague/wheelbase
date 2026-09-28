# ADR: IV30 contract selection is generic over candidate expirations; no extrapolation

<!-- generated:from us-121 -->

## Decision

Selection lives in `src/main/core/iv30-selection.ts` and `computeIv30`:

- **Candidates.** Weekly = every Friday in `[session+7, session+45]`; monthly = third Fridays in
  `[session+7, session+70]`. A Friday that is an exchange closure shifts to the prior session.
- **Pair.** `selectExpirationPair` keeps candidates with DTE ≥ 7, then takes the largest ≤ 30 DTE
  and the smallest > 30 DTE. Exactly 30 → that expiration alone. One side only → the single nearest
  usable expiration alone (`far: null`). No extrapolation.
- **Strikes.** floor/ceil of the underlying VWAP at increments 0.5, 1, 2.5 and 5, deduplicated,
  nearest first.
- **Qualifying strike.** Both legs have a bar with `tradeCount ≥ 1` **and** both invert. An
  inversion failure (VWAP ≤ discounted intrinsic) disqualifies the strike like an untraded leg;
  the next-nearest is tried.
- **Tiers.** Weekly first; if either weekly expiration finds no qualifying strike, the monthly
  tier. Both fail → gap `no_tradeable_pair`. The tier used is stored on the reading.

## Why

- The near-expiry scenario outline speaks in listed expirations (3/31, 7/35), which only a
  candidate-list function can express and test directly.
- "A strike is usable when both legs traded and both price above intrinsic" is the smaller rule,
  and yields fewer gaps than "an inversion failure gaps the session" while keeping its intent.
- Negative-weight variance interpolation from a one-sided bracket is a spike shortcut, not a
  method; flat use of the nearest expiration is conservative and explicit.

## Alternatives considered

- **Hard-coded "two Fridays around D+30"** — cannot express the outline.
- **Gap on first inversion failure** — story-literal, more gaps, no upside.
- **Linear extrapolation** — produces a "30-day" number from no 30-day information.

## Known limits

- Strike grids for names under $10 or over $1000, and monthly-only names, are unverified; the
  failure mode is a gap and `n/a`.
- A VWAP exactly on the grid (e.g. `200.0000`) yields only `[200]`, with no neighbour fallback.

## Source

- [extract: us-121](../../.extracts/us-121.md) — ADR "Contract selection is generic over candidate expirations…"
- `src/main/core/iv30-selection.ts`, `src/main/core/iv30.ts`
- Feature page: [us-121](../../features/us-121-iv-rank-from-own-iv-history.md)
<!-- /generated -->
