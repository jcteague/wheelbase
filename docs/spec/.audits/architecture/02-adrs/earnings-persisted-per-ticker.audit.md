---
page: docs/spec/architecture/02-adrs/earnings-persisted-per-ticker.md
audited_at: 2026-09-28
findings: 12
---

# Audit: docs/spec/architecture/02-adrs/earnings-persisted-per-ticker.md

## Verified (9)

- ✓ `migrations/013_create_earnings_date.sql` creates `earnings_date` with `ticker` PRIMARY KEY, nullable `next_earnings`, `checked_through`, `checked_at`, `source` (default `'finnhub'`).
- ✓ Read/written through `src/main/services/earnings-dates.ts`; `getEarnings` exported at `:297`.
- ✓ Upsert via `ON CONFLICT (ticker) DO UPDATE` — `src/main/services/earnings-dates.ts:23`.
- ✓ Finnhub integration keeps only a 5-minute failure backoff: `EARNINGS_FAILURE_TTL_MS = 5 * 60 * 1000` and `failureBackoff` Map — `src/main/integrations/finnhub-earnings.ts:12,44`; no success cache found.
- ✓ `unavailable` produced at read time, a failed fetch writes no row — `src/main/services/earnings-dates.ts:4,220,245`.
- ✓ A NULL shallower than the caller's horizon is re-fetched — `needsRefresh` rule 2, `src/main/services/earnings-dates.ts:122`.
- ✓ Explicit minimum refresh interval, short for passed/near-term, weekly otherwise — `refreshIntervalHours`, `src/main/services/earnings-dates.ts:109-115` (`NEAR_EARNINGS_DAYS = 14` at `:52`).
- ✓ ~30-day alert horizon (`EARNINGS_HORIZON_DAYS = 30`, `src/main/services/evaluate-alerts.ts:33`) and ~90-day screener read (`dteMax` + `LOOKAHEAD_BUFFER_DAYS = 45`, `src/main/services/earnings-horizon.ts:25,31`).
- ✓ Linked files exist: `src/main/integrations/finnhub-earnings.ts`, `docs/spec/features/us-70-earnings-in-window-warning.md`, `docs/spec/schema/tables.md`, `docs/spec/schema/migrations.md`, `docs/spec/domain/market-data.md`, `docs/spec/domain/alerts.md`.

## Drift (1)

- ✗ Lines 44-48 ("Why this differs from the Barchart IVR feed") describe `ivr_snapshot` in the present tense as a live time series keyed `(underlying, observed_at)` and state "Both auxiliary feeds persist". The Barchart feed is retired and the table is gone: `migrations/016_create_iv30_history.sql:55` runs `DROP TABLE ivr_snapshot`; IV history now lives in `iv30_reading` (US-121). The alternative on line 54 ("mirroring `ivr_snapshot`") is fine as history. Suggested fix: reframe the paragraph as past context ("the then-current Barchart `ivr_snapshot`…") or point at the US-121 IV30 history instead.

## Unverifiable (2)

- ? Line 31-32: "The watchlist already ships an unimplemented `post_earnings_only` entry condition" — true when written, but the condition is now implemented (`earningsGate`, `src/main/core/watchlist-signal.ts:127-128,148`). Rationale-at-decision-time; flag for a light wording touch rather than treating as drift.
- ? Finnhub 60 calls/minute free-tier ceiling and restart hit-rate reasoning — external/narrative.

## Missing files (0)

None.
