# ADR: Earnings certainty is the outer ranking key; score never rescues a tier

<!-- generated:from us-70 -->

## Decision

Candidates sort by an earnings tier first, then by `yieldPerDelta`, then by ticker:

| Tier | Earnings status          |
| ---- | ------------------------ |
| 0    | `clear`                  |
| 1    | `unknown`, `unavailable` |
| 2    | `flagged` (in-window)    |

`earningsTier(a) - earningsTier(b)` is prepended to the comparator chain in
`rankCandidates`, and — equally importantly — to the survivor sort inside `screenTicker`.
Demoted rows (anything but `clear`) render `—` instead of a rank number.

`unknown` and `unavailable` deliberately share tier 1: the trader's next move is the same
for both — go look it up. Only the badge copy differs.

## Why

Pre-earnings IV inflation is exactly what lifts a risky candidate up a yield-per-delta
sort. The elevated premium _is_ the earnings risk being priced in, so allowing a high score
to outrank a clean candidate would surface the most dangerous rows first. Score must order
within a tier and never across one.

The approved US-66 mockup already showed this in its `earnings` state: NVDA at score 0.69
with an unknown date sits _below_ MSFT at 0.50, and both demoted rows carry `rank: null`.
The reasoning holds independently of the mockup.

Demoting `unavailable` is harmless during a full outage: every row lands in the same tier,
so relative order is unchanged and the trader still gets a usable ranked list.

**The tier is also needed inside a ticker, not just across tickers.** A chain is pulled
across the whole DTE window, so one ticker spans several expirations, and
`CandidateEarnings` is derived per strike against that strike's own expiry. A print falling
between two expiries leaves the earlier strike `clear` and the later one `flagged` — and the
flagged strike carries the richer premium, precisely because of the IV inflation above.
Sorting the survivors on score alone would therefore hand the ticker its riskiest expiry and
hide the clean one entirely. (US-70's plan initially asserted the opposite, on the
assumption that earnings status is constant within a ticker; it is not.)

Dropping the rank number on a demoted row is not cosmetic: a number would claim a standing
among the clean candidates that the tier explicitly denies. The score stays reachable
through the rank cell's tooltip.

## Alternatives considered

- **Demote only flagged candidates and rank unknown normally** — rejected: it contradicts
  the mockup, and an unknown date is precisely the case where an elevated premium might be
  unexplained earnings IV.
- **A score penalty multiplier instead of tiers** — rejected: unexplainable to the trader,
  and a large enough score still jumps the boundary.
- **Leave `screenTicker`'s best-strike pick on score alone** — rejected once it became clear
  that earnings status varies between a ticker's own expiries.

## Source

- `src/main/core/screener.ts` — `earningsTier`, `rankCandidates`, `screenTicker`
- `src/renderer/src/components/ScreenerResultsTable.tsx` — the demoted rank cell
- Feature pages: `../../features/us-70-earnings-in-window-warning.md`,
  `../../features/us-65-score-wheel-candidates.md`,
  `../../features/us-66-screener-results.md`
- Related: `./unknown-earnings-never-excludes.md`, `./earnings-four-state-lookup.md`
<!-- /generated -->
