---
page: docs/spec/architecture/02-adrs/earnings-invalidates-ivr-before-expiry.md
audited_at: 2026-09-28
findings: 9
---

# Audit: docs/spec/architecture/02-adrs/earnings-invalidates-ivr-before-expiry.md

## Verified (8)

- ✓ `predates_earnings` state exists and outranks the age tiers — `src/main/core/ivr-freshness.ts:20` (type), `:104-107` (override evaluated before `tierForAge`).
- ✓ Strictly-later-day predicate, bounded by today (ET): `lastEarnings <= today && lastEarnings > observationSessionDate` — `src/main/core/ivr-freshness.ts:92`. Same-day print does not invalidate.
- ✓ Three-valued last-print knowledge (`string | null | undefined`); `null` and `undefined` both fall back to the time tiers — `src/main/core/ivr-freshness.ts:57`, `:90`.
- ✓ An earnings-invalid reading older than ten sessions keeps its state: override is applied regardless of `ageTradingDays` (`src/main/core/ivr-freshness.ts:105-107`; `STALE_MAX_AGE = 10` at `:13`).
- ✓ Distinct display treatment with a "Predates earnings" caption — `src/renderer/src/lib/ivr-tooltip.ts:11`, `src/renderer/src/components/ReadingNote.tsx:53-57`, `src/renderer/src/components/FreshnessRing.tsx:18,35`.
- ✓ `last_earnings` column on `earnings_date` — `migrations/014_add_last_earnings.sql:1`; read/written in `src/main/services/earnings-dates.ts:15,21,25`.
- ✓ Earnings-store failure degrades per ticker: `last` is `undefined` for an unavailable ticker (`src/main/services/earnings-dates.ts:289`) and is passed per ticker into the lookup (`src/main/services/screener.ts:106`, `src/main/services/iv-rank-lookup.ts:77`).
- ✓ Linked files exist: `docs/spec/.extracts/us-98.md`, `docs/spec/features/us-98-ivr-staleness-tiers.md`, `./unknown-earnings-never-excludes.md`, `docs/spec/schema/tables.md#earnings_date` (heading at line 676).

## Drift (0)

None.

## Unverifiable (1)

- ? "The UI never displays a 'current through earnings' affirmation" and "muted value" styling — negative/visual claims; `IvrCell.tsx:24` colours the state `text-wb-gold`, whether that reads as "muted" is a design judgement. Flag for human review.

## Missing files (0)

None.
