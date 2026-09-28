---
page: docs/spec/architecture/02-adrs/earnings-tier-before-score.md
audited_at: 2026-09-28
findings: 8
---

# Audit: docs/spec/architecture/02-adrs/earnings-tier-before-score.md

## Verified (5)

- ✓ `earningsTier` maps `clear`→0, `unknown`/`unavailable`→1, `flagged`→2 — `src/main/core/screener.ts:424-434`.
- ✓ Tier prepended to the comparator in `rankCandidates` (then yield-per-delta, then ticker) — `src/main/core/screener.ts:532-541`.
- ✓ Tier also prepended to the survivor sort inside `screenTicker` — `src/main/core/screener.ts:495`, `:512-518`.
- ✓ `yieldPerDelta` is the score field — `src/main/core/screener.ts:113,402`.
- ✓ Related ADRs and feature pages exist: `./unknown-earnings-never-excludes.md`, `./earnings-four-state-lookup.md`, `us-65-score-wheel-candidates.md`, `us-66-screener-results.md`, `us-70-earnings-in-window-warning.md`.

## Drift (1)

- ✗ Line 17 / 45-47: "Demoted rows (anything but `clear`) render `—` instead of a rank number" and "The score stays reachable through the rank cell's tooltip" describe a rank cell that no longer exists. The screener table was folded into the watchlist bench (commit `152aabf combined screener with watchlist`); `src/renderer/src/lib/bench.ts:17-18,73-80` carries a 1-based `rank`, but no `.tsx` in `src/renderer/src` renders `.rank` (grep empty). Suggested fix: update the consequence to the current bench surface, or mark it as historical.

## Unverifiable (1)

- ? Mockup reasoning (NVDA 0.69 below MSFT 0.50 in the US-66 mockup) — refers to a design artefact, not code.

## Missing files (1)

- ✗ Source list cites `src/renderer/src/components/ScreenerResultsTable.tsx` — file does not exist (deleted in `152aabf`).
