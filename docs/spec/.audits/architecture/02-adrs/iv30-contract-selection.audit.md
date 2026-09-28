---
page: docs/spec/architecture/02-adrs/iv30-contract-selection.md
audited_at: 2026-09-28
findings: 8
---

# Audit: docs/spec/architecture/02-adrs/iv30-contract-selection.md

## Verified (7)

- ✓ Weekly candidates = Fridays in `[session+7, session+45]`; monthly = third Fridays in `[session+7, session+70]` — `src/main/core/iv30-selection.ts:19,22-23,60-93`.
- ✓ Closed Friday shifts to the prior session — `shiftToSession`, `iv30-selection.ts:48-58`.
- ✓ `selectExpirationPair`: DTE ≥ 7, largest ≤ 30 and smallest > 30; exactly 30 alone; one side → nearest alone with `far: null` — `iv30-selection.ts:99-114`.
- ✓ Strikes: floor/ceil at 0.5, 1, 2.5, 5, deduped, nearest first — `strikeCandidates`, `iv30-selection.ts:20,117-124`.
- ✓ Qualifying strike needs both legs `tradeCount ≥ 1` and both inverting; else next-nearest — `selectLeg`, `src/main/core/iv30.ts:22,118-146`.
- ✓ Weekly tier first then monthly; both fail → `no_tradeable_pair`; tier stored on the reading — `iv30.ts:25,181-195`; `expiration_tier` column in `migrations/016_create_iv30_history.sql`.
- ✓ Cited source files and feature page exist.

## Drift (0)

None.

## Unverifiable (1)

- ? Known limits (strike grids for <$10 / >$1000 names unverified; on-grid VWAP yields only `[200]`) — the latter is consistent with `strikeCandidates` dedupe, but "unverified" is a statement about testing coverage.

## Missing files (0)

None.
