---
page: docs/spec/architecture/02-adrs/iv-rank-window-252-before-anchor.md
audited_at: 2026-09-28
findings: 8
---

# Audit: docs/spec/architecture/02-adrs/iv-rank-window-252-before-anchor.md

## Verified (7)

- ✓ `RANK_WINDOW_SESSIONS = 252`, `MIN_WINDOW_COVERAGE = 200` — `src/main/core/iv-metrics.ts:3-4`.
- ✓ Anchor = latest stored reading (`selectAnchor`), window = 252 calendar sessions strictly before it — `src/main/services/iv-history-read.ts:25,31-35`.
- ✓ Coverage gate returns null below 200 → `insufficient` with coverage — `iv-metrics.ts:39`, `iv-history-read.ts:17,45`; surfaced as `insufficient_history` with `window`/`required` (`src/main/services/iv-rank-lookup.ts:48-54`).
- ✓ Formulae: low/high = window min/max, rank clamped to 0..100 and `null` when flat, percentile = count strictly below / window count, both `ROUND_HALF_UP` integers via Decimal — `iv-metrics.ts:41-56`.
- ✓ `observedAt` is the anchor row's `observed_at` (session close) — `iv-history-read.ts:56`; migration comment `migrations/016_create_iv30_history.sql` (`observed_at` = "ISO instant of the session's close").
- ✓ Flat window: `ivGate` returns `unknown('IV unavailable')` on `value === null` (`src/main/core/watchlist-signal.ts:85`); `usableIvRanks` drops it (`src/main/services/screener.ts:117`).
- ✓ Related ADRs and cited sources exist.

## Drift (0)

None.

## Unverifiable (1)

- ? Acceptance-scenario arithmetic (0.2475 → 25; 0.47 clamps to 100) — story examples, not traced to a specific test here.

## Missing files (0)

None.
