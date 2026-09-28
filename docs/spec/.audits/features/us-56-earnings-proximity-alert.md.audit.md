---
page: docs/spec/features/us-56-earnings-proximity-alert.md
audited_at: 2026-09-28
findings: 33
---

# Audit: docs/spec/features/us-56-earnings-proximity-alert.md

## Verified (22)

- ✓ `EARNINGS_PROXIMITY` in `RuleCode` union and `RULES`, urgency `medium` — `src/main/core/alerts.ts:17,272-287`
- ✓ `EARNINGS_PROXIMITY_MAX_DAYS = 10` — `src/main/core/alerts.ts:37`
- ✓ Predicate `daysToEarnings >= 0 && daysToEarnings <= 10 && daysToEarnings <= dte` — `src/main/core/alerts.ts:281-286`
- ✓ Skip reasons `missing_dte` → `missing_expiration` → `missing_earnings_date` in that order — `src/main/core/alerts.ts:276-280`, constants at lines 43,47,48
- ✓ `EarningsProximityInput = Pick<AlertEvaluationInput, 'daysToEarnings' | 'expiration'>` — `src/main/core/alerts.ts:87`
- ✓ Summary wording today / in 1 day / in N days `… before your {expiration} expiration` — `src/main/core/alerts.ts:185-189`
- ✓ Quick action `Review position` applied to all matches — `src/main/core/alerts.ts:328`
- ✓ `AlertEvaluationInput` has `daysToEarnings: number | null` and `expiration: string | null` — `src/main/core/alerts.ts:72-73`
- ✓ `daysToEarnings` computed in the service via `computeDte(...)` — `src/main/services/evaluate-alerts.ts:141`
- ✓ `computeDte` returns `null` (never NaN) for an unparseable date — `src/main/core/dte.ts`
- ✓ Exported injectable `FetchEarnings` seam — `src/main/services/evaluate-alerts.ts:~156-159`
- ✓ Third concurrent `fetchOrDegrade`, WARN `alert_evaluation_earnings_unavailable` — `src/main/services/evaluate-alerts.ts:224-229`
- ✓ 30-day horizon for this rule — `EARNINGS_HORIZON_DAYS = 30`, `src/main/services/evaluate-alerts.ts:33`
- ✓ Finnhub endpoint `https://finnhub.io/api/v1/calendar/earnings` — `src/main/integrations/finnhub-earnings.ts:9`
- ✓ Non-ISO `date` rows dropped via `isIsoDay` — `src/main/integrations/finnhub-earnings.ts:77-85`
- ✓ Per-ticker isolation, 5-minute failure backoff `EARNINGS_FAILURE_TTL_MS` — `src/main/integrations/finnhub-earnings.ts:12,143,196-206`
- ✓ Failure codes `auth_failed` / `rate_limited` / `network_error` / `unknown` and WARN `earnings_fetch_failed` — `src/main/integrations/finnhub-earnings.ts:94-115,204`
- ✓ WARN-once `earnings_fetch_no_api_key` — `src/main/integrations/finnhub-earnings.ts:180-184`
- ✓ DEBUG `earnings_no_event_in_window` — `src/main/integrations/finnhub-earnings.ts:153`
- ✓ `loadFinnhubApiKey()` reads `import.meta.env.MAIN_VITE_FINNHUB_API_KEY` with `process.env.FINNHUB_API_KEY` fallback — `src/main/integrations/finnhub-credentials.ts:1-4`; typed in `src/main/env.d.ts:2`
- ✓ Test fixtures `stubEarnings` / `inertEarnings` — `src/main/services/evaluate-alerts-test-utils.ts:203,212`; `LoggerLike` in `src/main/logger.ts:4`; `WHEELBASE_MOCK_EARNINGS` seam in `src/main/integrations/fake-earnings.ts:4`
- ✓ `describe('US-56 acceptance — EARNINGS_PROXIMITY')` with 4 AC tests — `src/main/services/evaluate-alerts.e2e.test.ts:516-593`; `earnings_date` table in `migrations/013_create_earnings_date.sql`

## Drift (5)

- ✗ The page names the batch fetcher `fetchNextEarnings(tickers, opts) → Promise<Record<string, EarningsLookup>>`. Grep finds no `fetchNextEarnings` in `src/`. The export is `fetchEarningsCalendar(...) → Promise<Record<string, EarningsCalendarRead>>`, where `EarningsCalendarRead = { status: 'read'; next; last } | { status: 'unavailable' }` (`src/main/integrations/finnhub-earnings.ts:21-23,170-173`). The four-state `EarningsLookup` (`found`/`none`/`unavailable`, `src/main/core/screener.ts:66-69`) is produced later by `services/earnings-dates.ts:251`.
- ✗ Lookback window is stated as 7 days ("`from = now − 7d`", `EARNINGS_LOOKBACK_DAYS (7)`). Code has `EARNINGS_LOOKBACK_DAYS = 30` (`src/main/integrations/finnhub-earnings.ts:13`, used at line 65).
- ✗ The page says selection "falls back to the most recent past event", so a just-passed date gives negative `daysToEarnings` and the alert resolves. The fetcher now returns `next` and `last` separately (`finnhub-earnings.ts:86-90`). The alert input reads only `next`: `nextLookup` maps `next === null` to `{ status: 'none' }` (`src/main/services/earnings-dates.ts:251`), and `earningsDateFor` uses only `status === 'found'` (`src/main/services/evaluate-alerts.ts:114-120`). A passed event with no upcoming one now gives `daysToEarnings = null`, so the rule skips and the open alert stays open instead of resolving. The page's resolution rationale, and its "accepted limitation" framing of the freeze as rare, no longer describe the code. Flag for human review; this may also be a behaviour regression.
- ✗ Error behaviour says a missing key returns `{}`. Code returns an entry for every ticker with `{ status: 'unavailable' }` (`src/main/integrations/finnhub-earnings.ts:185-190`). Also, an empty calendar is `{ status: 'read', next: null, last: null }` at the integration layer, not `{ status: 'none' }` (that mapping is in `earnings-dates.ts:251`).
- ✗ ADR rationale says in the present tense that "`MarketDataProvider` is the Massive vendor seam". Massive was retired (US-99), and `src/main/integrations/` has no Massive adapter (`ls | grep -i massive` is empty). Suggested fix: reword as history or say "the market-data vendor seam".

## Unverifiable (6)

- ? Vendor selection rationale (Massive Benzinga add-on pricing, Alpaca has no earnings endpoint, Nasdaq/Yahoo rejected, user decision 2026-07-04) — historical/narrative.
- ? "Mirroring the Massive credentials pattern" — historical comparison; the Massive credential module no longer exists.
- ? "~4k Finnhub calls per market day" uncached estimate — narrative.
- ? "Finnhub's free calendar has no confirmed-vs-projected distinction" — vendor claim.
- ? `FinnhubEarningsResponse` field list (`hour`, `quarter`, `epsEstimate`, …) — external vendor shape; code only types `{ date?: unknown }` (`finnhub-earnings.ts:37`).
- ? "As originally shipped" 12 h success cache / `fetchNextEarningsDates` — explicitly historical, not checked.

## Missing files (0)

All linked pages exist: `../domain/alerts.md`, `../domain/market-data.md`, `us-51-…`, `us-53-54-55-…`, `us-43-…`, `us-50-…`, `us-70-…`, `../schema/tables.md#earnings_date` (heading at line 676), `earnings-persisted-per-ticker.md`, `alert-evaluation-failure-isolation.md`.
