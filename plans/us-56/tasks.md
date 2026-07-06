# US-56 — Earnings-Proximity Alert — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (no cross-area dependencies)

> These areas can be started immediately and run in parallel.

### Core Rule — EARNINGS_PROXIMITY in the pure registry

- [x] **[Red]** Write failing tests — `src/main/core/alerts.test.ts`
  - Extend the local `makeInput` factory defaults (`daysToEarnings: null`, `expiration: null`) so all existing tests stay green
  - New `describe('EARNINGS_PROXIMITY')` block, each case via `makeInput` overrides asserting on `evaluatePosition`'s `{ matches, skipped }`:
    - Matches at `daysToEarnings: 6, dte: 13, expiration: '2026-08-21'` with `ruleCode: 'EARNINGS_PROXIMITY'`, `urgency: 'medium'`, `quickAction: 'Review position'`, summary exactly `Earnings in 6 days before your 2026-08-21 expiration` (AC 1 values)
    - Boundary: matches at `daysToEarnings: 10` (inclusive upper bound) and `daysToEarnings: 0` (earnings today); matches when `daysToEarnings === dte` (earnings on expiration day)
    - Does not match at `daysToEarnings: 11` (AC 2 shape) and at `daysToEarnings: 13, dte: 19` (AC 2 exact values)
    - Does not match when earnings fall after expiration: `daysToEarnings: 8, dte: 5` (AC 3 values) — and no skip is recorded
    - Does not match for negative `daysToEarnings` (lookback event; earnings already passed) — no match and no skip, so an open alert resolves
    - Skips with reason `missing_earnings_date` when `daysToEarnings: null` (and records no match) — AC 4 core behavior
    - Skips with reason `missing_dte` when `daysToEarnings: 6, dte: null` (expiration comparison impossible)
    - Co-fires: `dte: 4, daysToEarnings: 2` yields both `EXPIRATION_IMMINENT` and `EARNINGS_PROXIMITY` matches
    - Phase-agnostic: matches identically for `phase: 'CSP_OPEN'` and `phase: 'CC_OPEN'`
  - Run `pnpm test src/main/core/alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/alerts.ts` _(depends on: Core Rule Red ✓)_
  - Add `'EARNINGS_PROXIMITY'` to the `RuleCode` union (leave `COVERED_CALL_BREACH` in the future-comment)
  - Add `daysToEarnings: number | null` and `expiration: string | null` to `AlertEvaluationInput`; add `EarningsProximityInput = Pick<AlertEvaluationInput, 'daysToEarnings' | 'expiration' | 'dte'>`
  - Add constants `EARNINGS_PROXIMITY_MAX_DAYS = 10` and `MISSING_EARNINGS_DATE = 'missing_earnings_date'`
  - Add `earningsProximitySummary(input: EarningsProximityInput)` returning `` `Earnings in ${daysToEarnings} days before your ${expiration} expiration` ``
  - Append the registry entry: `urgency: 'medium'`; `missingData` returning `'missing_dte'` when `dte === null`, else `MISSING_EARNINGS_DATE` when `daysToEarnings === null`, else `null`; `test` returning `daysToEarnings >= 0 && daysToEarnings <= EARNINGS_PROXIMITY_MAX_DAYS && daysToEarnings <= dte`
  - Run `pnpm test src/main/core/alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/alerts.ts` _(depends on: Core Rule Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Registry entry stays ordered after `STRIKE_PROXIMITY` (append-only per the registry ADR); null-guard style should match the existing `missingDteReason` helper — extract a shared guard only if it reads identically
  - No logging in this file (pure core)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Finnhub Earnings Integration

- [x] **[Red]** Write failing tests — `src/main/integrations/finnhub-earnings.test.ts`
  - Mock global `fetch` per the `barchart-ivr-scraper.test.ts` style; pinned `now` via opts; `clearEarningsCache()` in `beforeEach`
  - Test cases:
    - Happy path: one ticker, calendar with one upcoming event → `{ NVDA: '2026-08-14' }`; request URL contains `symbol=NVDA`, `from=` (now − 7 d), `to=` (now + 30 d), and `token=`
    - Event selection: past event + two upcoming events → picks the **earliest upcoming** date; only past events → picks the **most recent past** date
    - Empty `earningsCalendar` → ticker absent from result, and a second call within TTL issues **no** new fetch for that ticker (negative result cached)
    - Cache: second call for the same ticker within 12 h returns the cached date without a network call; `clearEarningsCache()` forces a refetch
    - Per-ticker failure isolation: two tickers where one fetch rejects (network error) → the healthy ticker's date is still returned, WARN `earnings_fetch_failed` logged for the bad one
    - HTTP 429 and 401 → ticker omitted, WARN with the mapped code, no throw out of the batch
    - Missing API key (loader returns `''`) → immediate `{}`, single WARN `earnings_fetch_no_api_key`, no fetch calls
  - Run `pnpm test src/main/integrations/finnhub-earnings.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/finnhub-credentials.ts` + `src/main/integrations/finnhub-earnings.ts` _(depends on: Finnhub Integration Red ✓)_
  - `loadFinnhubApiKey()`: `import.meta.env.MAIN_VITE_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY || ''` (mirrors `massive-credentials.ts`)
  - `fetchNextEarningsDates(tickers, { now = new Date(), logger = defaultLogger })`: dedupe/uppercase tickers; short-circuit `{}` on empty key (WARN once per process) or empty ticker list; per ticker — serve from module cache when `fetchedAt` within `EARNINGS_CACHE_TTL_MS` (12 h), else `GET https://finnhub.io/api/v1/calendar/earnings?symbol=&from=&to=&token=` with `from`/`to` built via date-fns `format(addDays(now, ±N), 'yyyy-MM-dd')` (`EARNINGS_LOOKBACK_DAYS = 7`, `EARNINGS_LOOKAHEAD_DAYS = 30`)
  - Selection: sort events by `date`; first with `date >= format(now, 'yyyy-MM-dd')`, else last past event; store `{ date, fetchedAt }` in the cache (date `null` when no events) and include only non-null dates in the returned record
  - Per-ticker `try/catch`: map failures to WARN `earnings_fetch_failed` with a code (`auth_failed` / `rate_limited` / `network_error` / `unknown`, reusing `isNetworkError` from `./integration-errors`), omit the ticker, never throw
  - Export `clearEarningsCache()` for tests
  - DEBUG logs for request dispatch and per-ticker outcome
  - Run `pnpm test src/main/integrations/finnhub-earnings.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/finnhub-earnings.ts` _(depends on: Finnhub Integration Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep retry logic out (v1 has none — the 60 s cadence retries naturally); confirm no duplication with `barchart-ivr-scraper.ts` worth extracting (backoff helpers stay local to IVR)
  - Check constant naming consistency (`*_DAYS`, `*_MS`) with the rest of `integrations/`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Service Wiring (depends on Layer 1)

> Start after **both** Layer 1 Green tasks are checked off.

### Service Wiring — earnings as a third boundary fetch in `evaluateAlerts`

**Requires:** Core Rule Green ✓, Finnhub Integration Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/evaluate-alerts.test.ts` _(depends on: Core Rule Green ✓, Finnhub Integration Green ✓)_
  - Add earnings stub support to `src/main/services/evaluate-alerts-test-utils.ts` (e.g. `earningsByTicker` option or standalone `stubEarnings(map)` returning a `fetchEarnings` fn; `inertProvider` scenarios pass a stub returning `{}`)
  - Test cases (seed via existing test-utils, injecting `now`, `provider`, and `fetchEarnings`):
    - Seeded CC_OPEN position with earnings 6 days out and expiration 13 days out produces an open `EARNINGS_PROXIMITY` row with `urgency: 'medium'` and the exact AC summary (asserts `toEvaluationInput` computes `daysToEarnings` via `computeDte` and passes raw `expiration` through)
    - `fetchEarnings` returning `{}` → no `EARNINGS_PROXIMITY` row, `skippedRuleCount` increments, DEBUG `alert_rule_skipped` logged with `reason: 'missing_earnings_date'`, and the position's DTE rules still evaluate/persist normally
    - `fetchEarnings` **throwing** → WARN `alert_evaluation_earnings_unavailable`, run completes, DTE rules unaffected (failure-isolation invariant; `fetchOrDegrade` path)
    - Keep-open on transient gap: run 1 fires the alert (earnings present); run 2 with `fetchEarnings` returning `{}` keeps the row **open** with preserved `triggered_at`
    - Resolution on passed earnings: run 1 fires; run 2 at a later `now` where the (lookback) earnings date is behind `now` → the row transitions to `resolved` with `resolved_at` set
    - Batch fetch called once per run with the deduped ticker set of evaluable rows, concurrently with the quote/snapshot fetches (assert single invocation and argument)
  - Run `pnpm test src/main/services/evaluate-alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/evaluate-alerts.ts` _(depends on: Service Wiring Red ✓)_
  - Extend `EvaluateAlertsInput` with `fetchEarnings?: (tickers: string[], opts?: { now?: Date }) => Promise<Record<string, string>>`, defaulting to `fetchNextEarningsDates` from `../integrations/finnhub-earnings`
  - Add the third member to the existing `Promise.all`: `fetchOrDegrade(() => fetchEarnings(tickers, { now }), {}, logger, 'alert_evaluation_earnings_unavailable')`
  - Extend `toEvaluationInput` signature with `earningsDateByTicker: Record<string, string>`; set `daysToEarnings: computeDte(earningsDateByTicker[row.ticker] ?? null, now)` and `expiration: row.expiration`
  - No change to `index.ts`, the scheduler registration, the persist phase, `alerts.ts` primitives, or `schemas.ts`
  - Run `pnpm test src/main/services/evaluate-alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/evaluate-alerts.ts` _(depends on: Service Wiring Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `toEvaluationInput` now takes several lookup maps — group them into one `marketContext` parameter object **only** if the call site reads worse than before; otherwise leave flat (no speculative abstraction)
  - Verify test-utils additions follow the existing `makeStockQuote`/`stubProvider` naming
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — E2E Tests (AC verification)

**Requires:** All Green tasks from Layers 1–2 ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `src/main/services/evaluate-alerts.e2e.test.ts` _(depends on: all Green tasks ✓)_ — tests passed immediately (implementation complete from Layers 1–2, as expected for the verification layer)
  - New `describe('US-56 acceptance', ...)` block, one `it()` per AC, names mirroring the Gherkin language (US-52/53-55 precedent). Each seeds a real in-memory DB via `makeTestDb()`, injects a pinned `now`, an inert market-data provider, and a stub `fetchEarnings`; asserts through `readAlertRows`. Add a fixed-date seed helper to `evaluate-alerts-test-utils.ts` if the pinned-date scenarios need one (AC dates are absolute: pin `now` per test rather than using `NOW`)
  - AC coverage:
    - AC-1: fires within 10 days and before expiration → `it('fires a medium-urgency EARNINGS_PROXIMITY alert when earnings are within 10 calendar days and before expiration')` — NVDA CC_OPEN, expiration `2026-08-21`, earnings `2026-08-14`, `now = 2026-08-08` → exactly one open `EARNINGS_PROXIMITY` row, `urgency: 'medium'`, summary exactly `Earnings in 6 days before your 2026-08-21 expiration`
    - AC-2: more than 10 days away → `it('does not fire when earnings are more than 10 days away')` — NVDA CC_OPEN, expiration `2026-08-27`, earnings `2026-08-21`, `now = 2026-08-08` → no `EARNINGS_PROXIMITY` row
    - AC-3: earnings after expiration → `it('does not fire when earnings occur after the option expires')` — NVDA CC_OPEN, expiration `2026-08-15`, earnings `2026-08-18`, `now = 2026-08-10` → no `EARNINGS_PROXIMITY` row; the co-firing `EXPIRATION_IMMINENT` row at 5 DTE is asserted present to pin co-existence
    - AC-4: missing earnings data → `it('skips the rule without failing the run when no earnings date is available')` — NVDA with an open option leg, `fetchEarnings` stub returns `{}` → no `EARNINGS_PROXIMITY` row, the run's other results persist (e.g. a DTE alert), and a DEBUG `alert_rule_skipped` log with `ruleCode: 'EARNINGS_PROXIMITY'`, `reason: 'missing_earnings_date'` was recorded (spy logger)
  - Run `pnpm test src/main/services/evaluate-alerts.e2e.test.ts` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - No production code expected — this area is verification. Any failure is fixed in the area that owns the defect (Core Rule / Finnhub Integration / Service Wiring)
  - Run `pnpm test src/main/services/evaluate-alerts.e2e.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consolidate any repeated pinned-date seeding into `evaluate-alerts-test-utils.ts` (as US-52 did); check for duplication with the US-53/54/55 scenario setup
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (see AC Audit in `plan.md`)
- [x] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean (1526 tests)
- [x] Run `/update-spec us-56` — capture the new rule row into `docs/spec/domain/alerts.md` (rules table, skip-reasons table, log-events list) and the Finnhub feed into `docs/spec/domain/market-data.md`
