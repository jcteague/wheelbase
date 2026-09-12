# ADR: A known earnings print invalidates an IV rank before the age tiers apply

<!-- generated:from us-98 -->

## Decision

If a print is known to have landed on a day **strictly after** the reading's session day
and at or before today (Eastern), the reading is `predates_earnings` and unusable —
however few sessions old it is. This override is evaluated _before_ time expiry, so an
earnings-invalid reading older than ten sessions keeps its explanatory state rather than
collapsing into "no reading".

The predicate is strictly _later day_. A print dated the same day as the reading's session
does not invalidate it, and does not become invalidating tomorrow.

Last-print knowledge is three-valued: `null` means a successful feed read established an
empty lookback; `undefined` means the knowledge is missing or the refresh was unavailable.
Both fall back to the time tiers alone.

## Context / Why

- A print resets the IV regime. A reading taken before it describes a world that no longer
  exists, so age is the wrong question entirely.
- Finnhub's calendar is **date-only**. A date cannot be ordered against a 16:00 close, so
  the same-day case is genuinely unknowable here — inventing a midnight timestamp would
  fabricate certainty. BMO/AMC resolution is out of scope.
- The absence of an override is **not** evidence of earnings safety. Migrated NULL
  `last_earnings` values are indistinguishable from checked-empty ones, so they mean "no
  known print" and never "checked, clear". The UI never displays a "current through
  earnings" affirmation.

## Consequences

- `predates_earnings` needs its own display treatment: a muted value plus a "predates
  earnings" caption, distinct from both a plain stale reading and an absent one.
- The earnings store had to learn history — see the `last_earnings` column on
  [`earnings_date`](../../schema/tables.md#earnings_date) — because the next-print date
  cannot serve as history for a ticker added after its print.
- An earnings-store failure degrades to the time tiers for that ticker only; other tickers
  and their ages are unaffected.

## Alternatives considered

- **Age-only assessment** — a stale high IVR reads as usable the morning after a print.
- **Fabricating a print instant** so the same-day case could be ordered — rejected as
  false precision.
- **A historical earnings-event table** — unneeded for a single last-print question, and
  it would miss tickers added after their print anyway.

## Sources

- [extract: us-98](../../.extracts/us-98.md) — ADRs "Earnings invalidation outranks the age tiers" and "Date-only earnings cannot order a same-session-day print"
- [feature: us-98-ivr-staleness-tiers](../../features/us-98-ivr-staleness-tiers.md)
- [ADR: Unknown earnings never excludes](./unknown-earnings-never-excludes.md)
<!-- /generated -->
