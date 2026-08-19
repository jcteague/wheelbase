# ADR: An unknown or unreadable earnings date never excludes a candidate

<!-- generated:from us-70 -->

## Decision

The `earnings_in_window` hard filter fires **only** on a `found` date that lands in the
holding window. Its `applies` guard requires
`criteria.earningsHandling === 'exclude' && ctx.earnings.status === 'found'`, so `unknown`
and `unavailable` produce a caution badge and a tier-1 ranking demotion but never an
exclusion — including in `exclude` mode.

The store follows the same principle from the other direction: a verdict that cannot answer
"when is the next print?" is never dressed up as one. A `found` date that has already
passed, and a stored NULL shallower than the caller's horizon, both read as `unavailable`
rather than being served as `clear`-producing knowledge.

## Why

Excluding on unknown fails closed on the _vendor_ rather than on the _risk_, and does it
invisibly. One free-tier coverage gap, an exhausted quota, or an expired API key would
silently empty the results table with no indication that the screener is broken rather than
the market — the trader would conclude there are no candidates today.

The existing `iv_rank_floor` filter already encodes exactly this principle in its own
`applies` guard: an unknown IV rank is a gap in the data, not a low reading, so it passes.
Keeping the two consistent means one rule for missing inputs across the whole filter
registry.

The complementary half matters just as much. The engine deliberately treats a past earnings
date as history rather than gap risk, and scores it `clear`. That is right for the print
that already happened, but a stored past date says nothing about the _next_ one — which,
earnings being quarterly, may land squarely inside a 30–45 DTE expiry. Serving it would
hand the ticker a rank number, no badge, and no exclusion. So "we have a date" is not
sufficient; it has to be a date that answers the question asked.

## Alternatives considered

- **Exclude on unknown in `exclude` mode as the "safe" reading** — rejected: it fails
  closed on the vendor, not on the risk, and the failure is invisible to the trader.
- **Rank unknown candidates normally instead of demoting them** — rejected separately; see
  `./earnings-tier-before-score.md`. Never excluding does not mean treating a gap as
  equivalent to a clean read.
- **Serve a stale-but-known past date rather than reporting `unavailable`** — rejected once
  it was clear the engine converts it to `clear`. Over-caution is the correct direction for
  a binary-event risk; a false `clear` is not.

## Source

- `src/main/core/screener.ts` — the `earnings_in_window` registry entry and its `applies`
  guard
- `src/main/services/earnings-dates.ts` — the shared "does this answer the next print?"
  predicate applied to both fetched and stored verdicts
- `src/main/services/screener.ts` — a missing store entry defaults to `unavailable`, never
  to "no earnings"
- Feature page: `../../features/us-70-earnings-in-window-warning.md`
- Related: `./earnings-tier-before-score.md`, `./earnings-four-state-lookup.md`,
`./alert-evaluation-failure-isolation.md`
<!-- /generated -->
