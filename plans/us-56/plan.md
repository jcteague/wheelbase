---
story: us-56
kind: feature
parent: null
topics: [alerts, market-data]
status: planned
---

# Implementation Plan: US-56 — Earnings-Proximity Alert

## Summary

Add the `EARNINGS_PROXIMITY` rule to the pure alert registry — firing medium-urgency when a position's next earnings event is within 10 calendar days **and** on/before the active leg's expiration — and build the earnings-date feed it depends on: a new Finnhub integration (free tier, per-ticker calendar query, 12 h in-module cache) consumed by `evaluateAlerts` as a third concurrent degradeable boundary fetch. Done means all four AC scenarios pass as named e2e tests, missing earnings data skips cleanly with a DEBUG log, and no schema, IPC, or renderer change is needed (the US-51 queue displays the new rule code transparently).

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** `docs/epics/07-stories/US-56-earnings-proximity-alert.md`
- **Research & Design Decisions:** `plans/us-56/research.md`
- **Data Model & Selection Logic:** `plans/us-56/data-model.md`
- **API Contract(s):** `plans/us-56/contracts/finnhub-earnings-calendar.md`
- **Quickstart & Verification:** `plans/us-56/quickstart.md`

(No mockup exists — no renderer work; the queue treatment is covered by the US-51 dashboard.)

## Prerequisites

Already in place, all reused as-is:

- Alert engine + registry with per-rule `missingData` skips (`src/main/core/alerts.ts`, US-50/53-55); `EARNINGS_PROXIMITY` is reserved in a comment there.
- Async `evaluateAlerts` with concurrent `fetchOrDegrade` boundary fetches, per-position isolation, compute-then-persist transaction, skipped-keys keep-open set (`src/main/services/evaluate-alerts.ts`).
- `alerts` table with partial unique open index — new rule codes need no migration; `AlertRecord.ruleCode` is plain `string` — no schema change in `src/main/schemas.ts`.
- `computeDte` calendar-day helper (`src/main/core/dte.ts`), env-key loader precedent (`src/main/integrations/massive-credentials.ts`), auxiliary-feed precedent (`barchart-ivr-scraper.ts`).
- Alert-evaluation scheduler job registered in `src/main/index.ts` — unchanged (the new fetcher is a default parameter inside the service).

## Implementation Areas

### 1. Core rule — EARNINGS_PROXIMITY in the pure registry

**Files to create or modify:**

- `src/main/core/alerts.ts` — extend `RuleCode` union and `AlertEvaluationInput`; add `EarningsProximityInput` slice, constants, summary helper, and the registry entry
- `src/main/core/alerts.test.ts` — new `describe('EARNINGS_PROXIMITY')` block; extend the local `makeInput` factory defaults (`daysToEarnings: null`, `expiration: null`) so all existing tests stay green

**Red — tests to write** (in `src/main/core/alerts.test.ts`, each via `makeInput` overrides asserting on `evaluatePosition`'s `{ matches, skipped }`):

- Matches at `daysToEarnings: 6, dte: 13, expiration: '2026-08-21'` with `ruleCode: 'EARNINGS_PROXIMITY'`, `urgency: 'medium'`, `quickAction: 'Review position'`, and summary exactly `Earnings in 6 days before your 2026-08-21 expiration` (AC 1 values)
- Boundary: matches at `daysToEarnings: 10` (inclusive upper bound) and at `daysToEarnings: 0` (earnings today); matches when `daysToEarnings === dte` (earnings on expiration day)
- Does not match at `daysToEarnings: 11` (AC 2 shape) and at `daysToEarnings: 13, dte: 19` (AC 2 exact values)
- Does not match when earnings fall after expiration: `daysToEarnings: 8, dte: 5` (AC 3 values) — and no skip is recorded
- Does not match for negative `daysToEarnings` (lookback event; earnings already passed) — no match and no skip, so an open alert resolves
- Skips with reason `missing_earnings_date` when `daysToEarnings: null` (and records no match) — AC 4 core behavior
- Skips with reason `missing_dte` when `daysToEarnings: 6, dte: null` (expiration comparison impossible)
- Co-fires: input with `dte: 4, daysToEarnings: 2` yields both `EXPIRATION_IMMINENT` and `EARNINGS_PROXIMITY` matches
- Phase-agnostic: matches identically for `phase: 'CSP_OPEN'` and `phase: 'CC_OPEN'`

**Green — implementation** (all in `src/main/core/alerts.ts`, per `data-model.md`):

- Add `'EARNINGS_PROXIMITY'` to the `RuleCode` union (leave `COVERED_CALL_BREACH` in the future-comment)
- Add `daysToEarnings: number | null` and `expiration: string | null` to `AlertEvaluationInput`; add `EarningsProximityInput = Pick<AlertEvaluationInput, 'daysToEarnings' | 'expiration' | 'dte'>`
- Add constants `EARNINGS_PROXIMITY_MAX_DAYS = 10` and `MISSING_EARNINGS_DATE = 'missing_earnings_date'`
- Add `earningsProximitySummary(input: EarningsProximityInput)` returning `` `Earnings in ${daysToEarnings} days before your ${expiration} expiration` ``
- Append the registry entry: `urgency: 'medium'`; `missingData` returning `'missing_dte'` when `dte === null`, else `MISSING_EARNINGS_DATE` when `daysToEarnings === null`, else `null`; `test` returning `daysToEarnings >= 0 && daysToEarnings <= EARNINGS_PROXIMITY_MAX_DAYS && daysToEarnings <= dte`

**Refactor — cleanup to consider:**

- Keep the registry entry ordered after `STRIKE_PROXIMITY` (append-only per the registry ADR); check the null-guard style matches the existing `missingDteReason` helper — extract a shared guard only if it reads identically
- No logging in this file (pure core)

**Acceptance criteria covered:**

- Predicate-level truth of all four scenarios: "alert fires when earnings within 10 days and before expiration" (incl. exact summary), "does not fire when more than 10 days away", "does not fire when earnings occur after the option expires", and the skip half of "missing earnings data skips the rule"

### 2. Finnhub earnings integration

**Files to create or modify:**

- `src/main/integrations/finnhub-credentials.ts` — new: `loadFinnhubApiKey()` mirroring `massive-credentials.ts`
- `src/main/integrations/finnhub-earnings.ts` — new: `fetchNextEarningsDates(tickers, opts?)` batch fetcher with per-ticker isolation, event selection, and TTL cache; exports `clearEarningsCache()` for tests
- `src/main/integrations/finnhub-earnings.test.ts` — new integration test suite (mock global `fetch`, pinned `now` via opts)

**Red — tests to write** (in `src/main/integrations/finnhub-earnings.test.ts`, mocking `fetch` per the `barchart-ivr-scraper.test.ts` style; `clearEarningsCache()` in `beforeEach`):

- Happy path: one ticker, calendar with one upcoming event → `{ NVDA: '2026-08-14' }`; request URL contains `symbol=NVDA`, `from=` (now − 7 d), `to=` (now + 30 d), and `token=`
- Event selection: calendar containing a past event and two upcoming events → picks the **earliest upcoming** date; calendar containing only past events → picks the **most recent past** date
- Empty `earningsCalendar` → ticker absent from result, and a second call within TTL issues **no** new fetch for that ticker (negative result cached)
- Cache: second call for the same ticker within 12 h returns the cached date without a network call; `clearEarningsCache()` forces a refetch
- Per-ticker failure isolation: two tickers where one fetch rejects (network error) → the healthy ticker's date is still returned, WARN `earnings_fetch_failed` logged for the bad one
- HTTP 429 and 401 → ticker omitted, WARN with the mapped code, no throw out of the batch
- Missing API key (loader returns `''`) → immediate `{}`, single WARN `earnings_fetch_no_api_key`, no fetch calls

**Green — implementation** (per `contracts/finnhub-earnings-calendar.md`):

- `loadFinnhubApiKey()`: `import.meta.env.MAIN_VITE_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY || ''`
- `fetchNextEarningsDates(tickers, { now = new Date(), logger = defaultLogger })`: dedupe/uppercase tickers; short-circuit `{}` on empty key (WARN once per process) or empty ticker list; per ticker — serve from module cache when `fetchedAt` within `EARNINGS_CACHE_TTL_MS` (12 h), else `GET https://finnhub.io/api/v1/calendar/earnings?symbol=&from=&to=&token=` with `from`/`to` built via date-fns `format(addDays(now, ±N), 'yyyy-MM-dd')` (`EARNINGS_LOOKBACK_DAYS = 7`, `EARNINGS_LOOKAHEAD_DAYS = 30`)
- Selection: sort events by `date`; first with `date >= format(now, 'yyyy-MM-dd')`, else last past event; store `{ date, fetchedAt }` in the cache (date `null` when no events) and include only non-null dates in the returned record
- Per-ticker `try/catch`: map failures to WARN `earnings_fetch_failed` with a code (`auth_failed` / `rate_limited` / `network_error` / `unknown`, reusing `isNetworkError` from `./integration-errors`), omit the ticker, never throw
- DEBUG logs for request dispatch and per-ticker outcome (logging standards: DEBUG for API requests/responses)

**Refactor — cleanup to consider:**

- Keep retry logic out (v1 has none — the 60 s cadence retries naturally); confirm no duplication with `barchart-ivr-scraper.ts` worth extracting (backoff helpers stay local to IVR)
- Check constant naming consistency (`*_DAYS`, `*_MS`) with the rest of `integrations/`

**Acceptance criteria covered:**

- Enables the Background ("the alert engine evaluates positions with earnings-date data") and the data half of AC 4 — a feed failure yields an empty record, which downstream becomes a skip, not a run failure

### 3. Service wiring — earnings as a third boundary fetch in `evaluateAlerts`

**Files to create or modify:**

- `src/main/services/evaluate-alerts.ts` — add injectable `fetchEarnings` (default: real Finnhub batch), third concurrent `fetchOrDegrade`, and the two new `toEvaluationInput` fields
- `src/main/services/evaluate-alerts-test-utils.ts` — add earnings stub support (e.g. `earningsByTicker` option on `stubProvider`-style helpers or a standalone `stubEarnings(map)` returning a `fetchEarnings` fn; `inertProvider` scenarios pass a stub returning `{}`)
- `src/main/services/evaluate-alerts.test.ts` — service-level wiring tests

**Red — tests to write** (in `src/main/services/evaluate-alerts.test.ts`, seeding via existing test-utils and injecting `now`, `provider`, and `fetchEarnings`):

- A seeded CC_OPEN position with earnings 6 days out and expiration 13 days out produces an open `EARNINGS_PROXIMITY` row with `urgency: 'medium'` and the exact AC summary (asserts `toEvaluationInput` computes `daysToEarnings` via `computeDte` and passes raw `expiration` through)
- `fetchEarnings` returning `{}` (no data) → no `EARNINGS_PROXIMITY` row, `skippedRuleCount` increments, DEBUG `alert_rule_skipped` logged with `reason: 'missing_earnings_date'`, and the position's DTE rules still evaluate/persist normally
- `fetchEarnings` **throwing** → WARN `alert_evaluation_earnings_unavailable`, run completes, DTE rules unaffected (failure-isolation invariant; `fetchOrDegrade` path)
- Keep-open on transient gap: run 1 fires the alert (earnings present); run 2 with `fetchEarnings` returning `{}` keeps the row **open** with preserved `triggered_at` (skipped key joins the keep-open set — not resolved, not re-triggered)
- Resolution on passed earnings: run 1 fires; run 2 at a later `now` where the (lookback) earnings date is behind `now` → the row transitions to `resolved` with `resolved_at` set
- The batch fetch is called once per run with the deduped ticker set of evaluable rows, concurrently with the quote/snapshot fetches (assert single invocation and argument)

**Green — implementation** (all in `src/main/services/evaluate-alerts.ts`):

- Extend `EvaluateAlertsInput` with `fetchEarnings?: (tickers: string[], opts?: { now?: Date }) => Promise<Record<string, string>>`, defaulting to `fetchNextEarningsDates` from `../integrations/finnhub-earnings`
- Add the third member to the existing `Promise.all`: `fetchOrDegrade(() => fetchEarnings(tickers, { now }), {}, logger, 'alert_evaluation_earnings_unavailable')`
- Extend `toEvaluationInput` signature with `earningsDateByTicker: Record<string, string>`; set `daysToEarnings: computeDte(earningsDateByTicker[row.ticker] ?? null, now)` and `expiration: row.expiration`
- No change to `index.ts`, the scheduler registration, the persist phase, `alerts.ts` primitives, or `schemas.ts`

**Refactor — cleanup to consider:**

- `toEvaluationInput` now takes several lookup maps — consider grouping them into one `marketContext` parameter object **only** if the call site reads worse than before; otherwise leave flat (no speculative abstraction)
- Verify test-utils additions follow the existing `makeStockQuote`/`stubProvider` naming

**Acceptance criteria covered:**

- Service half of AC 1 (row persisted with correct urgency/summary), AC 4 in full ("skips the rule **without failing the run**" + "records a debug log that the rule was skipped"), plus the lifecycle behaviors implied by the Background (keep-open on gap, resolve on passing)

### 4. E2e Tests

**Files to create or modify:**

- `src/main/services/evaluate-alerts.e2e.test.ts` — new `describe('US-56 acceptance', ...)` block, one `it()` per AC, names mirroring the Gherkin language (this is the AC-driven layer, matching the US-52/53-55 precedent)
- `src/main/services/evaluate-alerts-test-utils.ts` — reuse; add a fixed-date seed helper if the pinned-date scenarios need one (AC dates are absolute: pin `now` per test rather than using `NOW`)

**Red — tests to write** (each seeds a real in-memory DB via `makeTestDb()`, injects a pinned `now`, an inert market-data provider, and a stub `fetchEarnings`; asserts through `readAlertRows`):

- `it('fires a medium-urgency EARNINGS_PROXIMITY alert when earnings are within 10 calendar days and before expiration')` — NVDA CC_OPEN, expiration `2026-08-21`, earnings `2026-08-14`, `now = 2026-08-08` → exactly one open `EARNINGS_PROXIMITY` row, `urgency: 'medium'`, summary exactly `Earnings in 6 days before your 2026-08-21 expiration` **(AC 1)**
- `it('does not fire when earnings are more than 10 days away')` — NVDA CC_OPEN, expiration `2026-08-27`, earnings `2026-08-21`, `now = 2026-08-08` → no `EARNINGS_PROXIMITY` row **(AC 2)**
- `it('does not fire when earnings occur after the option expires')` — NVDA CC_OPEN, expiration `2026-08-15`, earnings `2026-08-18`, `now = 2026-08-10` → no `EARNINGS_PROXIMITY` row (the co-firing `EXPIRATION_IMMINENT` row at 5 DTE is expected and asserted present to pin co-existence) **(AC 3)**
- `it('skips the rule without failing the run when no earnings date is available')` — NVDA with an open option leg, `fetchEarnings` stub returns `{}` → no `EARNINGS_PROXIMITY` row, the run's other results persist (e.g. a DTE alert), and a DEBUG `alert_rule_skipped` log with `ruleCode: 'EARNINGS_PROXIMITY'`, `reason: 'missing_earnings_date'` was recorded (spy logger) **(AC 4)**

**Green — implementation:**

- No production code — this area is verification. Any failure here is fixed in the area that owns the defect (1–3)

**Refactor — cleanup to consider:**

- Consolidate any repeated pinned-date seeding into `evaluate-alerts-test-utils.ts` (as US-52 did with its e2e helper consolidation); check for duplication with the US-53/54/55 scenario setup

**Acceptance criteria covered:**

- All four US-56 Gherkin scenarios, one named e2e test each (AC audit below)

## AC Audit

| AC (Gherkin scenario)                                                                                       | E2e test (Area 4)                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Alert fires when earnings are within 10 calendar days and before expiration (medium urgency, exact summary) | `fires a medium-urgency EARNINGS_PROXIMITY alert when earnings are within 10 calendar days and before expiration` |
| Alert does not fire when earnings are more than 10 days away                                                | `does not fire when earnings are more than 10 days away`                                                          |
| Alert does not fire when earnings occur after the option expires                                            | `does not fire when earnings occur after the option expires`                                                      |
| Missing earnings data skips the rule without failing the run (+ debug log)                                  | `skips the rule without failing the run when no earnings date is available`                                       |

All four ACs have exactly one named e2e test; no AC is uncovered and none are lumped together.

## Post-completion

Run the full checklist (`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format`), then `/update-spec us-56` so the new rule row lands in `docs/spec/domain/alerts.md` (rules table, skip-reasons table, log-events list) and the Finnhub feed is captured under `docs/spec/domain/market-data.md` before the plan docs age out.
