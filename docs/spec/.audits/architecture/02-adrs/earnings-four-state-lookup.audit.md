---
page: docs/spec/architecture/02-adrs/earnings-four-state-lookup.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/architecture/02-adrs/earnings-four-state-lookup.md

## Verified (8)

- ✓ `EarningsLookup = found(date) | none | unavailable` declared in `src/main/core/screener.ts:66-69`.
- ✓ `CandidateEarnings = clear | flagged(date, daysBeforeExpiry) | unknown | unavailable` — `src/main/core/screener.ts:79-83`.
- ✓ `ScoredCandidate.earnings: CandidateEarnings` replaces `earningsFlagged` — `screener.ts:116`; `earningsFlagged` absent (tests assert it: `src/main/ipc/screener.test.ts:188`, `src/renderer/src/api/screener.test.ts:132`).
- ✓ Mirrored as `IpcCandidateEarnings` (`src/preload/index.d.ts:502,528`) and `ScreenerCandidateEarnings` (`src/renderer/src/api/screener.ts:10,36`).
- ✓ `candidateEarnings` function in the engine — `screener.ts:210,484`.
- ✓ Engine imports nothing from `integrations/`, `db/` or `logger` — imports are `decimal.js`, `date-fns`, `./candidate-chain`, `./dte` (`screener.ts:5-8`).
- ✓ Outer layers import the union from the engine — `src/main/services/earnings-dates.ts:9`, `src/main/integrations/fake-earnings.ts:10`, `src/main/services/evaluate-alerts.ts:16`.
- ✓ Invariant "an entry for every requested ticker" — `fetchEarningsCalendar` maps every unique ticker to an entry (`src/main/integrations/finnhub-earnings.ts:170-198`), and `earnings-dates.ts:250-251` turns each into a `found`/`none` lookup.

## Drift (2)

- ✗ Lines 24 and 60 say `finnhub-earnings.ts` "imports and re-exports" `EarningsLookup` and exposes `fetchNextEarnings`. Neither is true: `finnhub-earnings.ts` does not reference `EarningsLookup`, declares its own `EarningsCalendarRead = read(next,last) | unavailable` (`finnhub-earnings.ts:21-23`), and exports `fetchEarningsCalendar` (`:170`). The lookup union is produced by the persisted store `src/main/services/earnings-dates.ts:250-251,301` (see `earnings-persisted-per-ticker`). Suggested fix: name `earnings-dates.ts` as the conforming layer and drop the re-export / `fetchNextEarnings` claims (README.md:147 repeats "the Finnhub module re-exports them").
- ✗ Line 25 cites as precedent that "`IvRank` lives in the engine and `services/ivr-snapshots.ts` conforms to it". `src/main/services/ivr-snapshots.ts` no longer exists (US-121 retired `ivr_snapshot`); the engine's own comment names `iv-rank-lookup` as the conforming module (`src/main/core/screener.ts:64`; `src/main/services/iv-rank-lookup.ts`). `IvRank` itself is still in the engine (`screener.ts:51`). Suggested fix: replace `services/ivr-snapshots.ts` with `services/iv-rank-lookup.ts`.

## Unverifiable (1)

- ? "The four states map one-to-one onto the acceptance criteria" — requires the Linear story.

## Missing files (0)

- (none) — `src/main/core/screener.ts`, `src/main/integrations/finnhub-earnings.ts`, `src/preload/index.d.ts`, `src/renderer/src/api/screener.ts`, `../../features/us-70-earnings-in-window-warning.md`, `../../contracts/ipc-handlers.md`, `./pure-core-engines.md` exist.
