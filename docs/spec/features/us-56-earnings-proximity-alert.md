# US-56: Earnings Proximity Alert

<!-- generated:from us-56 -->

## Summary

Adds the `EARNINGS_PROXIMITY` rule to the pure alert registry (see [alerts](../domain/alerts.md)): a medium-urgency alert fires when a position's next earnings event is within 10 calendar days **and** falls on or before the active leg's expiration. The earnings-date feed it depends on is a new Finnhub integration (free tier, one calendar query per ticker, 12 h in-module cache) consumed by `evaluateAlerts` as a third concurrent degradeable boundary fetch alongside stock quotes and option snapshots (see [market-data](../domain/market-data.md)). Missing earnings data skips the rule cleanly with a DEBUG log; no schema, IPC, or renderer change was needed — the [US-51 management queue](us-51-management-queue-dashboard.md) displays the new rule code transparently.

## Acceptance criteria

- Alert fires when earnings are within 10 calendar days and before expiration (NVDA CC_OPEN, expiration 2026-08-21, earnings 2026-08-14, today 2026-08-08 → medium-urgency EARNINGS_PROXIMITY, summary exactly `Earnings in 6 days before your 2026-08-21 expiration`)
- Alert does not fire when earnings are more than 10 days away (expiration 2026-08-27, earnings 2026-08-21, today 2026-08-08)
- Alert does not fire when earnings occur after the option expires (expiration 2026-08-15, earnings 2026-08-18, today 2026-08-10)
- Missing earnings data skips the rule without failing the run, and the engine records a debug log that the rule was skipped

Each AC has exactly one named e2e test in `src/main/services/evaluate-alerts.e2e.test.ts` (`describe('US-56 acceptance — EARNINGS_PROXIMITY')`).

## What was built

**Rule.** `EARNINGS_PROXIMITY` is a pure registry entry in `src/main/core/alerts.ts`, following the [alert rule registry pattern](../domain/alerts.md). Urgency `medium`, quick action `Review position`, phase-agnostic over any evaluable open short leg (`CSP_OPEN` or `CC_OPEN`), and it co-fires independently of the DTE/profit/proximity rules — no cross-rule suppression. Predicate:

```
daysToEarnings >= 0 && daysToEarnings <= EARNINGS_PROXIMITY_MAX_DAYS (10) && daysToEarnings <= dte
```

Comparing two `computeDte` results is equivalent to `earningsDate <= expirationDate` while reusing a single date-math path (date-fns, per the date-handling standard). Skip reasons: `missing_dte` when `dte === null`, `missing_expiration` when `expiration === null` (the summary interpolates it, so the guard covers every field the rule reads), `missing_earnings_date` when `daysToEarnings === null`. The summary helper is typed by a narrow `EarningsProximityInput` Pick-slice (`'daysToEarnings' | 'expiration'`), per the established helper-input convention. Wording adapts to the day count: `Earnings today …` at 0 days, `Earnings in 1 day …` at 1, plural `Earnings in {N} days …` otherwise (post-review fix — the original always-plural template rendered "Earnings in 1 days").

**Engine input.** `AlertEvaluationInput` gained `daysToEarnings: number | null` (precomputed in the service via the shared `computeDte(nextEarningsDate, now)` — the engine is pure and has no `now`) and `expiration: string | null` (raw leg expiration, needed by the summary template). "No earnings event", "feed failed", and "unparseable date" all flatten to `null → skip`, matching every existing rule input — `computeDte` returns `null` (never `NaN`) for a non-ISO date string, so a malformed feed date skips the rule instead of silently resolving a still-valid open alert.

**Earnings feed.** `src/main/integrations/finnhub-earnings.ts` exposes a batch `fetchNextEarningsDates(tickers) → Promise<Record<ticker, isoDate>>` against Finnhub's earnings-calendar endpoint, one request per ticker. It queries a window of 7 days back to 30 days forward, drops calendar rows whose `date` is not a `YYYY-MM-DD` string (unvalidated vendor JSON — a null/`TBD` row must not displace a valid event), and selects the earliest event with `date >= today`, falling back to the most recent past event — the lookback exists so a just-passed earnings date yields negative `daysToEarnings`, the predicate goes false, and an open alert resolves instead of freezing on a skip. A module-level per-ticker cache (12 h TTL for results, negative results cached too; failures cached for 5 min) keeps the 60 s evaluation cadence to roughly one Finnhub burst per half-day and stops a rate-limited ticker from being re-hammered on every scheduler run. Failures are isolated per ticker and never thrown to the batch caller.

**Boundary wiring.** `evaluateAlerts` (`src/main/services/evaluate-alerts.ts`) pre-fetches earnings dates as a third concurrent `fetchOrDegrade` via an injectable `FetchEarnings` seam owned and exported by the service. A whole-feed outage degrades to an empty record (WARN `alert_evaluation_earnings_unavailable`), per the [alert-evaluation-failure-isolation ADR](../architecture/02-adrs/alert-evaluation-failure-isolation.md).

**Credentials.** `loadFinnhubApiKey()` (`src/main/integrations/finnhub-credentials.ts`) reads `import.meta.env.MAIN_VITE_FINNHUB_API_KEY` with a `process.env.FINNHUB_API_KEY` runtime fallback, mirroring the Massive credentials pattern. A missing key logs one WARN and returns empty — the rule skips everywhere and every other rule is unaffected.

**Accepted limitations.** Post-earnings skip-freeze tail: if earnings pass, the next event is beyond the 30-day window, and the 7-day lookback has rolled off, the input goes null → skip and an open alert would freeze; in practice the lookback covers the resolution window. Finnhub's free calendar has no confirmed-vs-projected distinction — every returned date is treated as actionable. No Playwright e2e or `WHEELBASE_FAKE_EARNINGS` env seam in v1; AC coverage lives in the vitest e2e suite with an injected earnings stub, as [US-53/54/55](us-53-54-55-market-data-alert-rules.md) did.

## Architecture decisions

### Finnhub free tier as the earnings-date source

- **Decision:** Fetch next-earnings dates from Finnhub's earnings-calendar endpoint, one request per ticker, keyed free tier.
- **Why:** Official, keyed, free at this app's scale (single user, handful of tickers, 60 calls/min limit); JSON over HTTPS with query-param auth matching the existing Massive adapter conventions. Massive's own earnings data is a $99/mo Benzinga add-on; Alpaca has no earnings endpoint. Alternatives rejected: Nasdaq unofficial API (brittle; kept as fallback), Yahoo scraping (most brittle). User decision 2026-07-04.

### Standalone earnings integration module, not a `MarketDataProvider` method

- **Decision:** New `src/main/integrations/finnhub-earnings.ts`; **not** added to the `MarketDataProvider` type or the market-data factory.
- **Why:** `MarketDataProvider` is the Massive vendor seam — Massive cannot serve earnings on the current plan, so the method would force every provider (including the fake) to implement a capability the primary vendor lacks. The [Barchart IVR scraper (US-43)](us-43-barchart-ivr-scraper.md) is the precedent for a vendor-specific auxiliary feed in its own integration module. See [market-data](../domain/market-data.md).

### Transient per-run boundary fetch with an in-module TTL cache — no SQLite table, no collector job

- **Decision:** Third concurrent `fetchOrDegrade` in `evaluateAlerts`; module-level per-ticker cache with 12 h TTL (negative results cached too; failures cached with a 5 min TTL). No `earnings_snapshot` table, no scheduled job.
- **Why:** Matches the market-data invariant ("market data is transient — no SQLite rows") and the enrichment shape US-53/54/55 established. The IVR-style persisted snapshot exists because IVR needs _history_; earnings proximity needs only the _next_ date. Uncached per-run fetching would cost ~4k Finnhub calls per market day for near-static data.

### Query window spans 7 days back to 30 days forward; prefer the next upcoming event

- **Decision:** `from = now − 7d`, `to = now + 30d`; select the earliest event with `date >= today`, else the most recent past event.
- **Why:** 30-day lookahead comfortably covers the 10-day rule inside Finnhub's free-tier window. The 7-day lookback exists purely for alert resolution — a recent-past event produces negative `daysToEarnings` so the open alert resolves on the next run rather than freezing open on a skip. A tri-state "no event vs feed failed" input was rejected: AC 4 treats both uniformly as a skip.

### Engine input carries precomputed `daysToEarnings` plus raw `expiration`

- **Decision:** Day-count math happens at the service boundary (shared `computeDte`), exactly how `dte` already works; the engine stays pure with no `now`. The summary helper takes a narrow `EarningsProximityInput` slice.
- **Why:** Reuses one date-math code path — no ISO string comparisons, per the date-handling standard. See [alerts](../domain/alerts.md).

### Finnhub API key via env-var loader, mirroring Massive credentials

- **Decision:** `loadFinnhubApiKey()` with build-time env plus runtime fallback; missing key degrades to empty + one WARN.
- **Why:** Simplest existing precedent for a static per-install key — no settings UI, no encrypted storage, no migration. The app must remain fully functional without the key (failure-isolation ADR). Encrypted `credential_settings` + Settings UI can be promoted later.

### Rule shape — medium urgency, phase-agnostic, co-fires with existing rules

- **Decision:** `urgency: 'medium'`, quick action `Review position`, applies to `CSP_OPEN` and `CC_OPEN`, co-fires independently; constant `EARNINGS_PROXIMITY_MAX_DAYS = 10`.
- **Why:** Urgency and summary template come verbatim from the ACs; gap-risk applies to CSPs and CCs alike; co-firing follows the US-53/54/55 decision — orthogonal conditions, no AC asks for suppression.

## Contracts touched

### finnhub-earnings-calendar (external HTTP contract)

External vendor contract — no new IPC handler; the renderer reads new alerts through the existing `alerts:list` channel unchanged.

```typescript
// GET https://finnhub.io/api/v1/calendar/earnings
// One request per ticker; auth via `token` query param (Finnhub free tier).
interface FinnhubEarningsRequest {
  symbol: string // uppercased ticker, e.g. 'NVDA'
  from: string // 'YYYY-MM-DD' — now − EARNINGS_LOOKBACK_DAYS (7)
  to: string // 'YYYY-MM-DD' — now + EARNINGS_LOOKAHEAD_DAYS (30)
  token: string // loadFinnhubApiKey()
}

// HTTP 200
interface FinnhubEarningsResponse {
  earningsCalendar: Array<{
    date: string // 'YYYY-MM-DD' — the only field the story consumes
    symbol: string
    hour?: 'bmo' | 'amc' | 'dmh' | ''
    quarter?: number
    year?: number
    epsEstimate?: number | null
    epsActual?: number | null
  }>
}
// Empty earningsCalendar array = no events in the window (valid; cached as null → rule skips).

// Internal batch wrapper:
export async function fetchNextEarningsDates(
  tickers: string[],
  opts?: { now?: Date; logger?: LoggerLike }
): Promise<Record<string, string>> // ticker → selected event date; failed/eventless tickers absent
```

Error behavior (isolated per ticker, never thrown to the batch caller): missing key → `{}` + WARN `earnings_fetch_no_api_key` (once per process); 401/403 → WARN `earnings_fetch_failed` code `auth_failed`; 429 → `rate_limited`; network/other → `network_error` / `unknown`; empty calendar → DEBUG `earnings_no_event_in_window`, null cached. Any per-ticker failure is negatively cached for 5 minutes (`EARNINGS_FAILURE_TTL_MS`), so an exhausted rate limit backs off instead of refiring on every 60 s run. A whole-feed outage degrades to an empty record; `evaluateAlerts` additionally wraps the batch call in `fetchOrDegrade` (WARN `alert_evaluation_earnings_unavailable`).

### Schema

None. The story reuses the [US-50 `alerts` table](us-50-alert-engine.md) — `rule_code` is plain TEXT, so `'EARNINGS_PROXIMITY'` is just a new value under the existing partial unique open index. No migration.

## Source files

- `src/main/core/alerts.ts` — RuleCode union, input fields, `EarningsProximityInput`, constants, summary helper, registry entry
- `src/main/integrations/finnhub-earnings.ts` — batch fetcher with TTL cache and per-ticker isolation
- `src/main/integrations/finnhub-credentials.ts` — `loadFinnhubApiKey()`
- `src/main/services/evaluate-alerts.ts` — injectable `fetchEarnings`, third `fetchOrDegrade`, input mapping
- `src/main/services/evaluate-alerts-test-utils.ts` — `stubEarnings` / `inertEarnings` fixtures
- `src/main/services/evaluate-alerts.e2e.test.ts` — one named e2e test per AC (`describe('US-56 acceptance — EARNINGS_PROXIMITY')`)
- `src/main/logger.ts` — shared `LoggerLike` type
- `src/main/env.d.ts` — `MAIN_VITE_FINNHUB_API_KEY`
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
