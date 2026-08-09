# Red Phase Results: US-65 Layer 2 — Screener Service

## Feature Context

- **Feature directory**: `plans/us-65/`
- **User story**: `docs/epics/08-stories/US-65-score-wheel-candidates.md`
- **Plan file**: `plans/us-65/plan.md` (Area 5), `plans/us-65/tasks.md` (Layer 2)
- **Data model**: `plans/us-65/data-model.md` § "Service types" + "Orchestration"

## Test Files Created/Modified

- `src/main/services/screener.test.ts` — new; orchestration, boundary degradation, and
  per-ticker failure isolation for `screenWatchlistCandidates`.

## Interfaces Under Test

Green phase must create exactly these in `src/main/services/screener.ts`:

```typescript
import type { ExclusionCode, ScoredCandidate, ScreeningCriteria } from '../core/screener'

export type ScreenerExclusionCode = ExclusionCode | 'no_options_listed' | 'data_unavailable'

export type ScreenerExclusion = {
  ticker: string
  code: ScreenerExclusionCode
  reason: string
}

export type ScreenerResults = {
  status: 'ok' | 'provider_unavailable'
  ranked: ScoredCandidate[]
  excluded: ScreenerExclusion[]
  quoteTimestamp: string | null
}

export async function screenWatchlistCandidates(
  provider: MarketDataProvider,
  db: Database.Database,
  opts?: { criteria?: ScreeningCriteria; currentDate?: Date }
): Promise<ScreenerResults>
```

Consumed (already green, unchanged by this layer):

- `pullWatchlistChains(provider, db, { window, currentDate })` — `./candidate-chains`
- `getLatestIvrByUnderlying(db, tickers): Map<string, IvrSnapshot>` — `./ivr-snapshots`
- `screenTicker(input, criteria, currentDate)`, `rankCandidates(results)`,
  `DEFAULT_SCREENING_CRITERIA` — `../core/screener`
- `provider.getStockQuotes(tickers): Promise<Map<string, StockQuote>>`

## Test Coverage Summary

### Chain pull + criteria plumbing

- [x] Pulls chains with the DTE window derived from the criteria and the supplied `currentDate`
- [x] Falls back to `DEFAULT_SCREENING_CRITERIA` when none are supplied (window 30–45)

### Provider outage

- [x] Short-circuits `provider_unavailable` to `{ ranked: [], excluded: [], quoteTimestamp: null }`
      without touching the IVR read or the quote fetch

### Ranking + IVR join

- [x] Ranks one row per ticker in yield-per-delta order (KO `0.7892` above AAPL `0.5285`)
- [x] Joins the latest IVR reading (value + `observedAt`) onto each ranked candidate
- [x] A ticker with no IVR snapshot still ranks, carrying `ivRank: null`
- [x] A failing IVR read degrades to an empty map, warns, and every candidate still ranks

### Price ceiling (conditional quote fetch)

- [x] Skips `getStockQuotes` entirely when `maxUnderlyingPrice` is `null`
- [x] Fetches quotes and excludes a ticker above the ceiling
      (`underlying $412.00 above $75.00 ceiling`)
- [x] A failing quote fetch degrades to an empty map, warns, and the ceiling does not fire

### Ticker-status → exclusion mapping

- [x] `no_options_listed` → `{ code: 'no_options_listed', reason: 'no options listed' }`
- [x] `data_unavailable` → `{ code: 'data_unavailable', reason: 'market data unavailable' }`
- [x] A ticker with zero survivors contributes one row carrying the engine's `excluded[0]`
      code/reason (`delta 0.42 outside 0.20–0.30`)
- [x] The excluded list keeps watchlist (chain) order

### Failure isolation + reporting

- [x] A screening throw is isolated to its own ticker: logged at **error**, dropped to
      `data_unavailable`, the other tickers still rank
- [x] `quoteTimestamp` is the newest `timestamp` across `ranked`
- [x] `quoteTimestamp` is `null` when nothing ranks
- [x] A single `logger.info` completion summary `{ status, rankedCount, excludedCount }`

## Test Design Assumptions

- **`pullWatchlistChains` is module-mocked.** Asserting "called with the DTE window derived
  from the criteria" requires a spy, and the ticker-status fixtures (`no_options_listed`,
  `data_unavailable`, outage) are far cleaner to script at that seam than through a
  provider stub. The Layer 4 integration tests exercise the real function end to end.
- **`getLatestIvrByUnderlying` is mocked as a pass-through** to the real implementation, so
  a seeded in-memory DB drives the join; only the degradation test swaps in a thrower.
- **IVR and quote lookups are expected to cover the `ok` tickers only** — the tickers being
  screened. `expect(getLatestIvrByUnderlying).toHaveBeenCalledWith(db, ['AAPL'])` pins this.
- **The engine throw is provoked with real-shaped bad data** (`bid: 'not-a-number'`, which
  blows up `Decimal` inside `computeStrikeMetrics`) rather than by mocking `screenTicker` —
  it keeps the pure engine unmocked and mirrors the provider garbage this guard exists for.
- **`IvrSnapshot { ivr, observedAt }` → `IvRank { value, observedAt }`.** The read path and
  the engine name the number differently; the service does the rename.
- Fixture arithmetic: strikes expire `2026-08-29` against a `currentDate` of `2026-07-23`,
  i.e. **37 DTE**. AAPL `2.70 / 180` → `0.0150` period, `0.1480` annualized, `0.5285`
  yield-per-delta at `0.28` delta. KO `1.20 / 60` at `0.25` delta → `0.7892`.
- Exclusion-reason strings are asserted verbatim, **en dash** (U+2013) included — US-66
  renders them as-is.

## Test Execution Results

```bash
pnpm test src/main/services/screener.test.ts

 ❯ main src/main/services/screener.test.ts (0 test)

 FAIL  main src/main/services/screener.test.ts [ src/main/services/screener.test.ts ]
 Error: Cannot find module '/src/main/services/screener' imported from
 '/Users/johnteague/my-stuff/wb-65-candidate-screening/src/main/services/screener.test.ts'
  ❯ src/main/services/screener.test.ts:12:1
     12| import { screenWatchlistCandidates } from './screener'

 Test Files  1 failed (1)
      Tests  no tests
```

## Verification

- ✅ The suite fails solely because `src/main/services/screener.ts` does not exist yet
- ✅ Every other import (`./candidate-chains`, `./ivr-snapshots`, `../core/screener`,
  `../test-utils`, `../logger`) resolves — no setup or fixture errors
- ✅ No syntax errors in the test file

## Handoff to Green Phase

To resume: run `/green us-65`. Green phase should:

1. Create `src/main/services/screener.ts` with exactly the interfaces above
2. Follow `plans/us-65/data-model.md` orchestration steps 1–7 (each boundary in its own
   `try/catch`, per the `alert-evaluation-failure-isolation` ADR)
3. Match `candidate-chains.ts`'s logging shape: `logger.debug` for the request and
   per-ticker outcomes, one `logger.info` on completion

## Notes

- `earningsDate` is `null` for every ticker — the US-70 seam. No test asserts an earnings
  exclusion at the service level; the engine already covers that filter.

---

# Red Phase Results: Layer 3 — `screener:results` IPC + Preload

## Feature Context

- **Feature directory**: `plans/us-65/`
- **User story**: `docs/epics/08-stories/US-65-score-wheel-candidates.md`
- **Plan file**: `plans/us-65/plan.md` (Area 6)
- **Contract**: `plans/us-65/contracts/screener-results.md`

## Test Files Created/Modified

- `src/main/ipc/screener.test.ts` — new; `ipcMain` mocked the same way
  `src/main/ipc/watchlist.test.ts` does, `../services/screener` stubbed at the module
  boundary so the handler is tested in isolation from the service.

## Interfaces Under Test

```typescript
// src/main/ipc/screener.ts
export function registerScreenerIpc(deps: {
  db: Database.Database
  getProvider: () => MarketDataProvider
}): void

// Channel: 'screener:results' — no payload
//   → { ok: true, status, ranked, excluded, quoteTimestamp }
//   → { ok: false, errors: [{ field: '__root__', code: 'internal_error', ... }] }
```

## Test Coverage Summary

### IPC Handler Tests (`src/main/ipc/screener.test.ts`)

- [x] `screener:results` is registered and returns
      `{ ok: true, status, ranked, excluded, quoteTimestamp }` from a stubbed
      `screenWatchlistCandidates`
- [x] The handler takes no payload and passes `getProvider()` + `db` straight through —
      exactly one service call, no branching (thin-handler rule)
- [x] A `provider_unavailable` screen is forwarded unchanged (`ranked: []`,
      `excluded: []`, `quoteTimestamp: null`) rather than mapped to an error envelope
- [x] A service throw returns
      `{ ok: false, errors: [{ field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }] }`
      and never rejects to the renderer

## Test Design Assumptions

- `db` and `provider` are opaque sentinels (`{} as Database.Database` /
  `{} as MarketDataProvider`) — the handler must not touch either, only forward them, so
  identity comparison in `toHaveBeenCalledWith` is the real assertion.
- The `provider_unavailable` case is asserted at the IPC layer even though it is a
  service concern: the contract says it is a **success** payload, and the cheapest way
  for that to regress is a handler that starts branching on `status`.
- `toEqual` (not `toMatchObject`) on the success envelope — an extra key leaking into
  the payload is a contract break US-66 would inherit.

## Test Execution Results

```bash
pnpm test src/main/ipc/screener.test.ts

FAIL  src/main/ipc/screener.test.ts > registerScreenerIpc > (all 4 tests)
Error: Cannot find module '/src/main/ipc/screener' imported from
 '/Users/johnteague/my-stuff/wb-65-candidate-screening/src/main/ipc/screener.test.ts'
  ❯ register src/main/ipc/screener.test.ts:80:37

 Test Files  1 failed (1)
      Tests  4 failed (4)
```

## Verification

- ✅ All four tests fail solely because `src/main/ipc/screener.ts` does not exist yet
- ✅ Every other import (`electron`, `../logger`, `../services/screener`,
  `../core/screener`, `../integrations/market-data-provider`) resolves — no setup,
  fixture, or type errors
- ✅ No syntax errors in the test file

## Handoff to Green Phase

To resume: run `/green us-65` (Layer 3). Green phase should:

1. Create `src/main/ipc/screener.ts` with `registerScreenerIpc({ db, getProvider })`
   wrapping a single `screenWatchlistCandidates(getProvider(), db)` call in
   `handleIpcCall('screener_results_error', ...)`. No Zod request schema — the channel
   takes no payload.
2. Register it in `src/main/index.ts` alongside `registerWatchlistIpc({ db })`, passing
   the same `getProvider` accessor `registerMarketDataHandlers` receives
   (`() => marketDataFactory.create()`).
3. Add `screener: { results: () => invoke('screener:results') }` to `src/preload/index.ts`
   and `IpcScoredCandidate` / `IpcScreenerExclusion` / `IpcScreenerResultsResult` plus the
   `screener` namespace to `src/preload/index.d.ts`.

## Notes

- The preload wiring (steps 2–3 above) has no test of its own at this layer — it is
  type-checked by `pnpm typecheck` and exercised end-to-end by US-66. The `.d.ts` types
  must mirror `ScoredCandidate` field-for-field rather than widening to `unknown`.

---

# Red Phase Results: US-65 Layer 4 — AC Integration Tests

## Feature Context

- **Feature directory**: `plans/us-65/`
- **User story**: `docs/epics/08-stories/US-65-score-wheel-candidates.md`
- **Plan file**: `plans/us-65/plan.md` (Area 7) · `plans/us-65/tasks.md` (Layer 4)

## Test Files Created

- `src/main/services/screener.integration.test.ts` — one `it()` per acceptance
  criterion, exercising the **real** `screenWatchlistCandidates` (real
  `pullWatchlistChains`, real `getLatestIvrByUnderlying`, real pure engine) against an
  in-memory SQLite DB with migrations applied and a scripted `MarketDataProvider`.

## Interfaces Under Test

No new interfaces. Layer 4 is AC coverage over what Layers 1–3 already export:

```typescript
// src/main/services/screener.ts
export function screenWatchlistCandidates(
  provider: MarketDataProvider,
  db: Database.Database,
  opts?: { criteria?: ScreeningCriteria; currentDate?: Date }
): Promise<ScreenerResults>
```

Only the module's own boundary — `../logger` — is mocked. Nothing else is stubbed.

## Test Coverage Summary

| AC  | Test name                                                    | Scenario driven                                                      |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| 1   | `premium yield is computed on capital secured`               | AAPL 37-DTE $180 put @ 2.70 → `0.0150` / `0.1480` / `18000.00`       |
| 2   | `rank is annualized yield per unit of delta`                 | TSLA 0.30Δ 30.0% vs MSFT 0.20Δ 24.0% → MSFT first, `1.2000`/`1.0000` |
| 3   | `a strike outside the delta band is excluded`                | AMD 0.42Δ with a fat yield → `delta 0.42 outside 0.20–0.30`          |
| 4   | `an illiquid strike is excluded`                             | KO OI 120 vs the 500 floor → `open interest 120 below 500`           |
| 5   | `a wide-spread strike is excluded`                           | AAPL 2.40/3.00 on a 2.70 mark → `spread 22% exceeds 10%`             |
| 6   | `a narrow absolute spread on a cheap option is not excluded` | XYZ 0.08/0.15 → ranks, `spreadAbsolute '0.07'`, no exclusion         |
| 7   | `missing IV rank does not exclude a candidate`               | IVR seeded for KO+AAPL, none for MSFT → MSFT ranks, `ivRank: null`   |
| 8   | `the best strike per ticker is selected`                     | AAPL 175/180/185 survivors → one row, the 175 at `0.5893`            |

## Test Design Assumptions

- **`CURRENT_DATE = 2026-07-23`.** The default 30–45 DTE window resolves to expirations
  in `[2026-08-22, 2026-09-06]`; `2026-08-29` is 37 DTE and `2026-08-28` is 36 DTE.
- **AC-2 numbers are exact by construction.** At strike `365.0000` and 36 DTE the
  annualized yield collapses to `mark / 36`, so a `10.80` mark is exactly 30.0% and an
  `8.64` mark is exactly 24.0% — no rounding slack in the `1.2000` / `1.0000` scores.
  Both quotes are internally consistent: `mid` equals `(bid + ask) / 2`.
- **AC-6's mark is `0.12`,** the 2dp HALF_UP rounding of the story's `0.115` mid — the
  adapter surfaces `mid` verbatim as `mark`, and `CandidateStrike.mark` is 2dp.
- **AC-3 seeds AMD** (not in the quickstart's default watchlist) because the story's
  scenario names it; each test seeds only the tickers its AC needs. AC-7 uses the
  quickstart seed shape: KO + AAPL with IVR rows, MSFT deliberately without one.
- Only the `getOptionChainSnapshot` and `getStockQuotes` members of
  `MarketDataProvider` are scripted; the default criteria leave `maxUnderlyingPrice`
  null, so the quote fetch is never reached.

## Test Execution Results

Unlike Layers 1–3, these tests **passed on first run** — by design. Layer 4 adds no
production code (`tasks.md`: _"No new production code beyond Layers 1–3"_), so an
already-green suite is the expected outcome; `/implement-plan` step 3d covers this case.

```bash
pnpm test src/main/services/screener.integration.test.ts

 ✓ src/main/services/screener.integration.test.ts (8 tests) 20ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
```

Because "fails for the right reason" was unavailable as a gate, each test was instead
**falsified against deliberate engine mutations** to prove it is not vacuous. All
mutations were reverted; `git diff src/main/core/screener.ts` is empty.

| Mutation to `src/main/core/screener.ts`                | Tests that failed      |
| ------------------------------------------------------ | ---------------------- |
| `DAYS_PER_YEAR` 365 → 360                              | AC-1, AC-2, AC-7, AC-8 |
| en dash → hyphen; OI floor → `< 0`; spread filter off  | AC-3, AC-4, AC-5       |
| spread `&&` → `\|\|` (kills the absolute escape hatch) | AC-6                   |

Every AC test failed under a mutation of exactly the behaviour it asserts — 8/8 covered.

## Verification

- ✅ No syntax, import, or fixture errors
- ✅ No production code touched (engine restored bit-for-bit after each mutation)
- ✅ Every test proven falsifiable against the behaviour it claims to cover

## Handoff to Green Phase

Green is a no-op for production code: confirm the suite is green and move to Refactor.
Refactor should check whether `candidate-chains.integration.test.ts`'s local `putQuote`
builder and this file's `chainStrike` builder are worth sharing.
