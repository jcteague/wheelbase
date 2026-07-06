# Green Phase Results: US-56 — Earnings-Proximity Alert

## Feature Context

- **Feature directory**: `plans/us-56/`
- **User story**: `docs/epics/07-stories/US-56-earnings-proximity-alert.md`
- **Plan file**: `plans/us-56/plan.md`
- **Red phase results**: `plans/us-56/red-phase-results.md`

## Files touched (production)

- `src/main/core/alerts.ts` — `EARNINGS_PROXIMITY` RuleCode, two new `AlertEvaluationInput` fields, `EarningsProximityInput` slice, constants, summary helper, registry entry appended after `STRIKE_PROXIMITY`
- `src/main/integrations/finnhub-credentials.ts` — new `loadFinnhubApiKey()` (mirrors `massive-credentials.ts`)
- `src/main/integrations/finnhub-earnings.ts` — new batch fetcher: 7 d-back/30 d-forward window, earliest-upcoming-else-latest-past selection, 12 h module cache (`clearEarningsCache()` for tests), per-ticker isolation, WARN/DEBUG events per the contract
- `src/main/services/evaluate-alerts.ts` — injectable `fetchEarnings` (default `fetchNextEarningsDates`), third `fetchOrDegrade` in the `Promise.all` (`alert_evaluation_earnings_unavailable`), `toEvaluationInput` maps `daysToEarnings` via `computeDte` + `expiration` passthrough
- `src/main/env.d.ts` — `MAIN_VITE_FINNHUB_API_KEY` on `ImportMetaEnv`

No change to `index.ts`, scheduler registration, persist phase, or `schemas.ts` (as planned).

## E2E coverage added or modified

- `src/main/services/evaluate-alerts.e2e.test.ts` — `US-56 acceptance — EARNINGS_PROXIMITY`, 4 scenarios (one per AC)

## Key Design Decisions

- **`makeInput` inert default (45, not null)** — a `null` default would have made every existing "no skips" core test fail; follows the factory's inert-defaults pattern.
- **Existing service tests inject `inertEarnings()`** where they assert exact skip counts; a `vi.mock` guard in both service test files keeps un-injected calls off the network regardless of shell env.
- **Behavior-change ripple accepted**: two pre-existing exact-count assertions updated (core missing-dte test gains a third skip entry; service isolation test 3 → 4 skips) — direct consequences of the new rule, not regressions.

## Test Execution Results

Full suite after Green: **1526 passed / 0 failed** (138 files). Quality gates: `pnpm lint` ✅, `pnpm typecheck` ✅, `pnpm format` applied.

## Known Limitations / Tech Debt

- Summary always reads `days` (e.g. "Earnings in 1 days") — consistent with the existing `Expires in {dte} days` template; documented in research.md.
- No confirmed-vs-projected earnings distinction (Finnhub free tier has none).
- No retry logic in the fetcher (deliberate — the 60 s cadence retries naturally).
