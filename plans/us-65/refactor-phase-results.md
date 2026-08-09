# Refactor Phase Results: US-65 Layer 2 — Screener Service

## Automated Simplification

- code-simplifier agent run: **passed** (all tests green after its changes; nothing reverted)
- Files processed: `src/main/services/screener.ts`

## Refactorings Performed

### 1. Type-level narrowing — `chainStatusExclusion` returns a real exclusion

**File**: `src/main/services/screener.ts` (code-simplifier)
**Before**: The function returned `ScreenerExclusion[]` purely so the caller could index
`[0]`. The `switch` needed a `default: return []` arm for the `ok` case, and the call site's
`chainStatusExclusion(chain)[0]` was typed `ScreenerExclusion` while being `undefined` at
runtime for an `ok` chain — safe only because the caller happened to guard first.
**After**: A named `type FailedChain = Exclude<TickerChainResult, { status: 'ok' }>` narrows
the parameter. The `switch` is exhaustive over the two failure statuses with no `default`,
so the return type is proven without an assertion, and the call site drops the index.
**Reason**: Moves a caller-enforced invariant into the type system, deleting the
maybe-`undefined` hazard rather than documenting it.

### 2. Extract builder — single `dataUnavailable(ticker)`

**File**: `src/main/services/screener.ts` (code-simplifier)
**Before**: A `DATA_UNAVAILABLE_REASON` string constant travelled without its `code`, so
`code: 'data_unavailable'` was retyped in two separate object literals (the chain-failure
path and `screenChain`'s catch). The pair could drift.
**After**: One `dataUnavailable(ticker)` builder returns the whole `ScreenerExclusion`; both
paths call it.
**Reason**: The trader sees one verdict regardless of which boundary broke — the code and
its wording belong in one place.

### 3. Object parameter — `screenChain(chain, ctx)`

**File**: `src/main/services/screener.ts` (code-simplifier)
**Before**: Five positional parameters, two of them `Map`s (`ivRanks`, `prices`), easy to
transpose at the call site.
**After**: A named `ScreenContext` type carrying `{ ivRanks, prices, criteria, currentDate }`.
**Reason**: Project convention — 3+ parameters take a single named options object.

### 4. Remove impossible-branch guard — `representativeExclusion`

**File**: `src/main/services/screener.ts` (manual)
**Before**: `const closest = screened.excluded[0]` followed by a
`closest === undefined ? [] : [...]` ternary. With `noUncheckedIndexedAccess` off, the index
is typed non-`undefined`, so the guard tests a condition the type system says cannot occur.
**After**: `screened.excluded.slice(0, 1).map(...)` — "take at most the first" stated
directly, no branch.
**Reason**: CLAUDE.md's "no error handling for impossible scenarios". The `slice` form is
honest at both the type and runtime level and drops a conditional.

### 5. Hoist loop-invariant context

**File**: `src/main/services/screener.ts` (manual)
**Before**: `chains.tickers.map((chain) => screenChain(chain, { ivRanks, prices, criteria, currentDate }))`
rebuilt the context object on every ticker, and the two boundary reads were separate `const`s
one line above their only use.
**After**: One annotated `const ctx: ScreenContext = { ivRanks: readIvRanks(...), prices: await readUnderlyingPrices(...), criteria, currentDate }`,
leaving `chains.tickers.map((chain) => screenChain(chain, ctx))`.
**Reason**: Names the invariant once and reduces the map body to its essential call.
Evaluation order (IVR read before quote fetch) is unchanged.

### 6. Considered and deliberately declined — sharing the degrade-to-empty helpers

**File**: `src/main/services/screener.ts`
`readIvRanks` and `readUnderlyingPrices` share a _shape_ (try → warn → empty `Map`) but not a
signature: one is sync over a DB handle, the other async over the provider **and** carries an
early return when `maxUnderlyingPrice === null`. `candidate-chains.ts` has no equivalent
helper to share with either. Unifying them would require a generic over sync/async plus a
caller-supplied log event — a wrapper costing more to read than the two explicit `try/catch`
blocks it replaces. Left explicit, as the task's "share only if the shape is literally the
same, otherwise leave both explicit" instruction anticipated.

## Test Execution Results

```bash
pnpm test

 Test Files  171 passed (171)
      Tests  1901 passed (1901)
```

Identical to the green-phase baseline — no regressions, no behaviour change.
`src/main/services/screener.test.ts`: 18/18 passing after every individual step.

## Quality Checks

- ✅ `pnpm test` passed (1901 tests, no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed (node + web)
- ✅ `pnpm format` run

## Architecture Verification

- ✅ `src/main/core/screener.ts` imports only `decimal.js`, `date-fns`, `./dte`, and a
  type-only `CandidateStrike` — no DB, provider, or logger
- ✅ No `@alpacahq` import anywhere outside `src/main/integrations/alpaca.ts`
- ✅ No `src/main/core/` engine imports `better-sqlite3`, the logger, or a service
- ✅ Boundary I/O (IVR read, quote fetch) degrades to empty + `logger.warn`; per-ticker
  screening stays in its own `try/catch` — `alert-evaluation-failure-isolation` ADR intact
- ✅ Exactly one `logger.info` completion summary on both exit paths
- ✅ `src/main/services/screener.ts` is 222 lines — under the 300-line file gate

## Files touched (production)

- `src/main/services/screener.ts`

## E2E coverage added or modified

None. US-65 has no renderer surface; AC coverage is the Layer 4 headless integration suite.

## Remaining Tech Debt

- [ ] None introduced by this layer.

## Notes

All refactorings were applied incrementally with `pnpm test` run after each change. Nothing
was reverted. Layers 3 (`screener:results` IPC + preload) and 4 (AC integration tests) remain
open — `ScreenerResults` is the shape the IPC contract wraps.

---

# Refactor Phase Results: Layer 3 — `screener:results` IPC + Preload

## Automated Simplification

- code-simplifier agent run: **passed** (no revert needed)
- Files processed: `src/main/ipc/screener.ts`, `src/main/ipc/screener.test.ts`,
  `src/preload/index.ts`, `src/preload/index.d.ts`, `src/main/index.ts`

The agent changed the test file and one comment; it made no production behaviour changes.

## Manual Refactorings Performed

### 1. Collapse two test helpers into one — `src/main/ipc/screener.test.ts`

**Before**: A `register()` helper returned the raw `ipcMain.handle` calls array, and a
separate `getRegisteredHandler(calls, channel)` looked the channel up — so every test read
`getRegisteredHandler(await register(), 'screener:results')` and the
`Array<[string, (...args: unknown[]) => unknown]>` cast was repeated three times. A missing
registration surfaced as `undefined`, making every assertion fail opaquely.
**After**: One `registerAndGetHandler()` returning the module's only handler, behind a
named `IpcHandler` alias; it throws `screener:results handler was not registered` when the
channel is absent, so the four `handler?.(null)` optional calls became plain `handler(null)`.
**Reason**: The two-helper split is worth it in `watchlist.test.ts`, which registers three
channels. This module registers one, so the lookup indirection bought nothing and cost a
diagnosable failure mode. Matches `src/main/ipc/ivr.test.ts`, the other single-channel
handler test.

### 2. Remove mutable `beforeEach` state — `src/main/ipc/screener.test.ts`

**Before**: `db`, `provider`, and `getProvider` were `let` bindings reassigned on every
test.
**After**: Module-level `const`s with a plain `getProvider` function; `beforeEach` is just
`vi.clearAllMocks()`.
**Reason**: All three are inert stubs the handler only forwards — nothing mutates them, so
per-test reconstruction implied an isolation concern that does not exist.

### 3. Drop a redundant mock reset — `src/main/ipc/screener.test.ts`

**Before**: `screenWatchlistCandidates.mockReset()` alongside `vi.clearAllMocks()`.
**After**: `vi.clearAllMocks()` only.
**Reason**: Every test sets its own `mockResolvedValue`/`mockRejectedValue`, and
`clearAllMocks` already clears the call history `toHaveBeenCalledTimes(1)` depends on.

### 4. De-duplicate the outage fixture — `src/main/ipc/screener.test.ts`

**Before**: The `provider_unavailable` payload was written as an object literal twice
inside one test — once as the mock's resolved value, once in the expectation.
**After**: An `OUTAGE_RESULTS` fixture alongside `SAMPLE_RESULTS`; both payload assertions
read `toEqual({ ok: true, ...FIXTURE })`.
**Reason**: This states the handler's actual contract — the envelope wraps the service
result unchanged — instead of re-listing fields that could silently drift from the fixture.
Pass-through is the whole behaviour of a thin handler, so asserting pass-through is the
right assertion.

### 5. Fix an unresolvable comment path — `src/main/ipc/screener.ts`

**Before**: `// No payload, so no Zod request schema — see contracts/screener-results.md.`
**After**: `// ... see plans/us-65/contracts/screener-results.md.`
**Reason**: The relative path did not resolve from the handler's location, so the pointer
justifying the missing Zod schema was unfollowable.

## Architecture Verification

- ✅ **Thin handler**: `registerScreenerIpc` is one `ipcMain.handle` wrapping
  `handleIpcCall('screener_results_error', () => screenWatchlistCandidates(getProvider(), db))`
  — no branching, no orchestration, no business logic. Correctly no Zod schema for a
  payload-less channel. 21 lines including imports and comments.
- ✅ **Pure engine intact**: `src/main/core/screener.ts` still imports only `decimal.js`,
  `date-fns`, `./candidate-chain` (type-only), and `./dte` — no logger, DB, or provider.
- ✅ **Type mirroring exact**: `IpcScoredCandidate` matches `ScoredCandidate`
  field-for-field in the same order with the same nullability (`openInterest`, `volume`,
  `ivRank` nullable); `IpcIvRank` matches `IvRank`; `IpcScreenerExclusion` carries the full
  9-code union (7 `ExclusionCode` members + `no_options_listed` + `data_unavailable`),
  which is exactly `ScreenerExclusionCode`. Nothing widened to `unknown`.
- ✅ **Channel registered exactly once** across `src/main/ipc/` and `src/preload/`.
- ✅ `src/preload/index.ts` and `src/main/index.ts` additions already matched surrounding
  style — left unchanged.

## Test Execution Results

```bash
pnpm test

 Test Files  172 passed (172)
      Tests  1905 passed (1905)
```

## Quality Checks

- ✅ `pnpm test` passed (no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed (node + web)
- ✅ `pnpm format` clean

## Files touched (production)

- `src/main/ipc/screener.ts` (comment path fix only)

`src/main/index.ts`, `src/preload/index.ts`, and `src/preload/index.d.ts` were reviewed and
needed no refactoring.

## E2E coverage added or modified

None. US-65 has no renderer surface; AC coverage is Layer 4's headless integration suite.

## Remaining Tech Debt

- [ ] `IpcScoredCandidate` / `IpcScreenerExclusion` structurally restate the main-process
      types. The preload `.d.ts` is ambient and cannot import from `src/main`, so this is
      inherent to the existing preload pattern — every namespace does the same. Drift is
      caught by review, not the compiler.
- [ ] Criteria are not configurable over the channel yet; the service falls back to
      `DEFAULT_SCREENING_CRITERIA`. US-67 persists overrides via the existing `criteria`
      option seam.

## Notes

Kept the per-field `// 4dp` / `// null → render "n/a"` annotations in `index.d.ts` — they
carry precision and rendering information the renderer cannot recover from the type alone,
and which is not present on the upstream `ScoredCandidate`.

---

# Refactor Phase Results: US-65 Layer 4 — AC Integration Tests

## Automated Simplification

- `code-simplifier` agent run: **passed** (8/8 tests green before and after)
- Files processed: `src/main/services/screener.integration.test.ts` (296 → 273 lines)

Changes it made:

1. **Lifted `delta` out of the `greeks` object** in the `chainStrike` factory. Only
   `quote.greeks?.delta` is read by `toCandidateStrikes` — `gamma`/`theta`/`vega` are
   dropped before the engine sees them — so seven call sites were re-declaring three
   filler numbers just to vary delta, implying they mattered. Delta is now a top-level
   override; the other greeks are fixed with a comment saying why.
2. **Dropped the unused `getStockQuotes` stub** from `scriptChains`. No scenario sets
   `maxUnderlyingPrice`, so `readUnderlyingPrices` early-returns and the stub was never
   reached. Now matches the sibling `scriptProvider`, which scripts only what it needs.
3. **Removed an incidental `openInterest: 800`** from the cheap-option scenario — the
   factory default of 1500 already clears the 500 floor, and that test is about spread.
   The deliberate `openInterest: 120` in the illiquidity test is untouched.
4. **Replaced optional-chained lookups with destructuring** in the missing-IV-rank and
   best-strike tests (`const [msft, ko] = result.ranked`). A `?.` on a missing candidate
   silently weakens an assertion; the rank-order assertion was hoisted above it so the
   destructuring is safe. Same facts asserted, no optionals.

It explicitly declined to hoist the repeated KO/MSFT/TSLA strike definitions into
module-level fixtures the way `screener.test.ts` does with `AAPL_OK`/`KO_OK` — each
`it()` reading as a self-contained AC scenario is worth more here than ~15 lines saved.
Agreed and kept.

## Manual Refactorings Performed

### 1. Remove Duplication — shared `seedWatchlist` test helper

**Files**: `src/main/test-utils.ts`, `src/main/services/screener.integration.test.ts`,
`src/main/services/candidate-chains.integration.test.ts`,
`src/main/services/candidate-chains.test.ts`
**Before**: three byte-identical copies of the same five-line helper across three test
files.
**After**: one exported `seedWatchlist(db, tickers)` in `src/main/test-utils.ts`; the
three call sites import it and dropped their now-orphaned `better-sqlite3` and
`addWatchlistEntry` imports.
**Reason**: exact duplication with a name three authors had already agreed on — the
clearest possible extraction signal, and `test-utils.ts` is already the shared seam for
`makeTestDb`.

### 2. Remove Duplication — shared `seedIvr` test helper

**Files**: `src/main/test-utils.ts`, `src/main/services/screener.integration.test.ts`,
`src/main/services/screener.test.ts`
**Before**: the same `INSERT INTO ivr_snapshot` seeder written twice.
**After**: one exported `seedIvr(db, rows)` plus a labelled tuple type
`IvrSeedRow = [underlying, observedAt, ivr]`, so the positional call sites now get
parameter hints at the call site.
**Reason**: same duplication argument; the labelled tuple is a free readability win over
the previous bare `Array<[string, string, string]>`.

`ivr-snapshots.test.ts` and `ivr-collector.test.ts` keep their own inserters — those
write `source`/`ivp`/`iv30` and exist to exercise the collector's full column set, so
folding them in would mean widening the shared helper for no caller.

### 3. Decision — quote builders deliberately **not** shared

**Files considered**: `candidate-chains.integration.test.ts` (`putQuote`),
`candidate-chains.test.ts` (`putQuote`), `core/candidate-chain.test.ts` (`chainQuote`),
`screener.integration.test.ts` (`chainStrike`)
**Decision**: leave all four in place.
**Reason**: the tasks file asked to check for a compatible builder to reuse. There isn't
one. They share a type (`Partial<OptionChainQuote>` in, `OptionChainQuote` out) but not a
concept: US-64's defaults are a _representative_ quote whose exact values its tests
assert (`bid '2.11'`, `mark '2.14'`, strike 190, expiry 2026-09-05), while US-65's are a
quote _tuned to clear every screening filter_ (strike 180, expiry 37 DTE, 0.28 delta).
Merging them would force every US-64 assertion to read its expected values out of another
file, or reduce the shared builder to `Object.assign` with no defaults worth having.
Different defaults, different intent — the duplication is superficial.

## Architecture Verification

- ✅ `src/main/core/screener.ts` imports only `decimal.js`, `date-fns`, and type-only /
  pure siblings (`./candidate-chain`, `./dte`) — no DB, provider, or `logger` import
- ✅ No production code changed in this layer (Layer 4 is test-only, per the plan)
- ✅ Engine restored bit-for-bit after every mutation probe (`git diff` empty)

## Test Execution Results

```bash
pnpm test

 Test Files  173 passed (173)
      Tests  1913 passed (1913)
```

Falsification re-run after the simplification (assertion style changed in two tests), to
confirm the suite is still non-vacuous — identical coverage pattern to the Red phase:

| Mutation to `src/main/core/screener.ts`               | Tests that failed      |
| ----------------------------------------------------- | ---------------------- |
| `DAYS_PER_YEAR` 365 → 360                             | AC-1, AC-2, AC-7, AC-8 |
| en dash → hyphen; OI floor → `< 0`; spread filter off | AC-3, AC-4, AC-5       |
| spread `&&` → `\|\|`                                  | AC-6                   |

## Quality Checks

- ✅ `pnpm test` passed (1913 tests, no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed (node + web)
- ✅ `pnpm format` passed (no files rewritten)

## Files touched (production)

None — Layer 4 changed test files and `src/main/test-utils.ts` only.

## E2E coverage added or modified

None. US-65 has no renderer surface (the table is US-66), so Playwright `_electron` does
not apply; AC coverage is the headless
`src/main/services/screener.integration.test.ts` (8 scenarios, one per AC).

## Remaining Tech Debt

None introduced by this layer.
