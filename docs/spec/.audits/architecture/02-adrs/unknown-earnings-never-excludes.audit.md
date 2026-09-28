---
page: docs/spec/architecture/02-adrs/unknown-earnings-never-excludes.md
audited_at: 2026-09-28
findings: 1
---

# Audit: unknown-earnings-never-excludes.md

## Verified (7)

- ✓ `earnings_in_window` `applies` guard is `criteria.earningsHandling === 'exclude' && ctx.earnings.status === 'found'` — `src/main/core/screener.ts:291-296`.
- ✓ `iv_rank_floor` `applies` guard passes an unknown IV rank — `screener.ts:285` (`ctx.ivRank !== null`).
- ✓ Past `found` dates read as `unavailable` via the shared `answersNextPrint` predicate — `src/main/services/earnings-dates.ts:132,145-156`.
- ✓ Predicate applied to both stored and fetched verdicts — `earnings-dates.ts:156` (stored) and `:277` (fetched).
- ✓ Stored NULL shallower than the horizon is not served — `earnings-dates.ts:123,147-156` (`checked_through >= horizon`).
- ✓ Missing store entry defaults to `unavailable` — `src/main/services/screener.ts:162-164`.
- ✓ Links `./earnings-tier-before-score.md`, `./earnings-four-state-lookup.md`, `./alert-evaluation-failure-isolation.md`, `../../features/us-70-earnings-in-window-warning.md` exist.

## Drift (0)

None.

## Unverifiable (1)

- ? "Unknown and unavailable produce a caution badge and a tier-1 ranking demotion" — delegated to `earnings-tier-before-score`; not re-audited here.

## Missing files (0)

None.
