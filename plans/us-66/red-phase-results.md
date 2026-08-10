# Red Phase Results: US-66 Layer 5 — E2E Tests

## Feature Context

- **Feature directory**: `plans/us-66/`
- **User story**: `docs/epics/08-stories/US-66-display-ranked-results.md`
- **Plan file**: `plans/us-66/plan.md` (area 7), `plans/us-66/tasks.md` (Layer 5)
- **Research ADR for the fixtures**: `plans/us-66/research.md` — "E2E fixtures reproduce AC
  numbers through the real engine"

## Test Files Created/Modified

- `e2e/screener-helpers.ts` — OCC put-fixture builder, launch/seed plumbing, row queries
- `e2e/screener-results.spec.ts` — one `it()` per AC bullet (six tests)

## Interfaces Under Test

No new production interfaces. Layer 5 exercises what Layers 1–4 already shipped, through
the real app:

```typescript
// e2e/screener-helpers.ts (test-only) — export surface after the refactor phase;
// fixture construction and seeding are module-local, since only the spec's entry
// points need to be reachable.
export const QUOTE_TIMESTAMP: string
export const RANKED_PUTS: PutFixtureSpec[] // KO, AAPL, MSFT — in expected rank order
export const RANKED_IVR: Record<string, number> // { KO: 38, AAPL: 44 } — MSFT absent
export const TSLA_PUT: PutFixtureSpec // the excluded fixture
export type PutFixtureSpec
export type ScreenerLaunchOpts // { fixtures?, ivr?, marketStatus?, marketDataError? }
export function launchScreener(
  dbPath: string,
  opts?: ScreenerLaunchOpts
): Promise<{ app: ElectronApplication; page: Page }>
export function rankedTickers(page: Page): Promise<string[]>
export function rowCells(page: Page, ticker: string): Promise<string[]>
export function rowScore(page: Page, ticker: string): Promise<string | null>
```

Contract the specs bind to (all pre-existing): `screener-row-<ticker>` rows carrying
`data-yield-per-delta`, `screener-excluded-toggle` / `screener-excluded-row-<ticker>`,
`screener-unavailable`, `screener-empty`, `screener-stale-badge`,
`screener-stale-caption`, `market-status-pill`.

## Test Coverage Summary — one test per AC bullet

| AC scenario (Gherkin)                              | `it()`                                                  | Key assertion                                                                |
| -------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Background: pill reads LIVE                        | asserted inside `results are ranked by yield-per-delta` | `market-status-pill` has text `LIVE`                                         |
| Results are ranked by yield-per-delta              | `results are ranked by yield-per-delta`                 | row order `KO, AAPL, MSFT`; scores `0.71 / 0.53 / 0.50`; 12 non-empty cells  |
| A row shows the metrics for its recommended strike | `a row shows the metrics for its recommended strike`    | AAPL cells `$180.00 $2.70 1.5% 14.8%/yr 0.28 44 4,200 $0.06 (2%) 37d`        |
| IV rank unavailable is shown, not blank            | `IV rank unavailable is shown, not blank`               | MSFT IVR cell exactly `n/a`; rank badge `3`                                  |
| Excluded candidates are listed with a reason       | `excluded candidates are listed with a reason`          | `Excluded (1)`; row text exactly `TSLAspread 22% exceeds 10%`; no ranked row |
| Provider outage is distinguished from no results   | `provider outage is distinguished from no results`      | `screener-unavailable` + Retry button; `screener-empty` and table absent     |
| Stale marks are flagged                            | `stale marks are flagged`                               | pill `CLOSED`; `screener-stale-badge` visible; caption `Quoted HH:mm:ss`     |

## Test Design Assumptions

- **Fixtures drive the engine, nothing is stubbed.** Put chains come from
  `WHEELBASE_MOCK_OPTION_SNAPSHOTS` (OCC-keyed, parsed by `FakeMarketDataProvider` into
  strike/expiration/type), so the AC's rendered strings are produced by the real US-65
  scorer. `mid` is stated explicitly on each fixture because `toCandidateStrikes` maps
  `mid → mark`; it is not derived from bid/ask.
- **Expirations are relative** (`localDate(+37)` / `localDate(+44)`), never hardcoded
  dates — DTE, not the calendar date, is the invariant the AC pins.
- **TSLA's 22% spread is exact** (0.66 on a 3.00 mark) so the engine's round-up-2dp
  formatter emits the AC's literal `spread 22% exceeds 10%`.
- **IVR seeding goes through the real collector**, which reads its targets from open
  positions — so `seedIvr` first creates a throwaway active CSP per ticker. Those
  positions are inert here: the screener reads only the watchlist. MSFT gets no outcome,
  which is what makes its `n/a` cell real rather than asserted against a stub.
- **The stale quote time is computed, not hardcoded** —
  `format(parseISO(QUOTE_TIMESTAMP), 'HH:mm:ss')` — because `fmtQuoteTime` renders in
  local time and the suite must pass in any timezone (project date-handling rule).
- **`bail: 1` in `vitest.e2e.config.ts`** stops the run at the first failure; use
  `--bail=0` when you want to see every failing test in one pass.

## Test Execution Results

Layer 5 is written after Layers 1–4 Green, so — as `tasks.md` states for the e2e Green
step ("No production code expected") — there is no missing implementation for these tests
to fail against. All six passed on the first run:

```bash
pnpm test:e2e e2e/screener-results.spec.ts --bail=0

 ✓ e2e/screener-results.spec.ts > US-66 > results are ranked by yield-per-delta 6571ms
 ✓ e2e/screener-results.spec.ts > US-66 > a row shows the metrics for its recommended strike 951ms
 ✓ e2e/screener-results.spec.ts > US-66 > IV rank unavailable is shown, not blank 821ms
 ✓ e2e/screener-results.spec.ts > US-66 > excluded candidates are listed with a reason 821ms
 ✓ e2e/screener-results.spec.ts > US-66 > provider outage is distinguished from no results 799ms
 ✓ e2e/screener-results.spec.ts > US-66 > stale marks are flagged 824ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### Negative check — proving the assertions are live

A green-on-first-run test proves nothing on its own, so a throwaway copy of the spec with
every expected value flipped was run and then deleted. All six failed, each against the
real rendered value — which is in every case exactly the string the AC pins:

```
× results are ranked by yield-per-delta
  → expected [ 'KO', 'AAPL', 'MSFT' ] to deeply equal [ 'MSFT', 'AAPL', 'KO' ]
× a row shows the metrics for its recommended strike
  → expected '0.53' to be '9.99'
× IV rank unavailable is shown, not blank
  → expected 'n/a' to be 'BLANK'
× excluded candidates are listed with a reason
  → expected 'TSLAspread 22% exceeds 10%' to be 'TSLAspread 99% exceeds 10%'
× provider outage is distinguished from no results
  → expected '⚠Market data unavailableMassive could…' to contain 'No candidates match your criteria'
× stale marks are flagged
  → expected 'Quoted 15:00:02 · after-hours option …' to contain 'Quoted 00:00:00'

 Tests  6 failed (6)
```

## Verification

- ✅ No syntax, import, or fixture errors in either new file
- ✅ Every assertion demonstrably binds to real rendered output (negative check above)
- ✅ Each of the six AC bullets has exactly one named test
- ⚠️ Tests did not fail on first run — expected for this layer, since Layer 5 verifies
  Layers 1–4 end-to-end and the plan budgets no production code for its Green step

## Handoff to Green Phase

Nothing to implement. Green is a confirmation run of `pnpm test:e2e`; Refactor then
tidies the helpers (shared launch/seed plumbing, fixture-math comments pointing at the
research ADR).
