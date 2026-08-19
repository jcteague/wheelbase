# ADR: Model earnings as a four-state union, not a nullable date and a boolean

<!-- generated:from us-70 -->

## Decision

Two unions, declared in the pure engine `src/main/core/screener.ts`:

- `EarningsLookup` — what a calendar knows about one ticker: `found` (with a date),
  `none` (read successfully, no event in the window), `unavailable` (could not read).
- `CandidateEarnings` — what the engine decided for one candidate: `clear`, `flagged`
  (with `date` and `daysBeforeExpiry`), `unknown`, `unavailable`.

`ScoredCandidate.earningsFlagged: boolean` is **replaced** by
`ScoredCandidate.earnings: CandidateEarnings`, and the same shape is mirrored across the
IPC boundary (`IpcCandidateEarnings`) and the renderer adapter
(`ScreenerCandidateEarnings`).

**Invariant:** the feed returns an entry for **every** requested ticker. A missing key is
never a valid outcome.

**The engine owns the types; the integration conforms.** `src/main/core/screener.ts` must
import nothing from `integrations/`, `db/`, or `logger`, so the union is declared there and
`finnhub-earnings.ts` imports and re-exports it. This follows the existing precedent where
`IvRank` lives in the engine and `services/ivr-snapshots.ts` conforms to it — the engine
declares what it needs and outer layers satisfy it.

## Why

The previous feed returned `Record<string, string>` and **omitted the ticker for both a
null date and a caught error**, collapsing the two states that have to render differently.
On a free-tier vendor with real coverage gaps, "we could not check" silently reading as
"there is no earnings risk" is a clean bill of health the data does not support — the exact
silent pass US-70 exists to prevent.

A boolean flag on the candidate cannot carry the third and fourth states at all. And the
four states map one-to-one onto the acceptance criteria, which is the strongest signal the
shape is right rather than merely convenient.

`daysBeforeExpiry` travels on the `flagged` variant so the renderer never redoes date math
and cannot form a second opinion about gap risk.

## Alternatives considered

- **A parallel `unavailableTickers: Set<string>` beside the record** — rejected: two
  sources of truth for one fact, and easy to read one and forget the other.
- **Keep the boolean and thread status separately through the service** — rejected: both
  the badge and the ranking sort need the status on the row itself.
- **Declare `EarningsLookup` in the integration module** (as the plan's data model
  originally specified) — rejected: it would put an `integrations/` import in the pure
  engine, which the architecture rules forbid. The two constraints were mutually exclusive
  and the purity rule won.
- **Keep `earningsFlagged` alongside the new field for compatibility** — rejected: it had
  exactly one reader, which never rendered it, so carrying both would leave dead surface
  behind.

## Source

- `src/main/core/screener.ts` — `EarningsLookup`, `CandidateEarnings`, `candidateEarnings`
- `src/main/integrations/finnhub-earnings.ts` — `fetchNextEarnings`, re-export
- `src/preload/index.d.ts`, `src/renderer/src/api/screener.ts` — the mirrored shapes
- Feature page: `../../features/us-70-earnings-in-window-warning.md`
- Contracts: `../../contracts/ipc-handlers.md`
- Related: `./pure-core-engines.md`
<!-- /generated -->
