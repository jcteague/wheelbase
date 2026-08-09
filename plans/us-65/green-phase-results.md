# Green Phase Results: US-65 Layer 2 — Screener Service

## Feature Context

- **Feature directory**: `plans/us-65/`
- **User story**: `docs/epics/08-stories/US-65-score-wheel-candidates.md`
- **Plan file**: `plans/us-65/plan.md` (Area 5)
- **Red phase results**: `plans/us-65/red-phase-results.md`

## Files touched (production)

- `src/main/services/screener.ts` — new; orchestrates the chain pull, the IVR join, the
  conditional underlying-quote fetch, per-ticker screening, and the cross-ticker rank.

No other production file was modified. `candidate-chains.ts`, `ivr-snapshots.ts`, and
`core/screener.ts` are consumed unchanged.

## E2E coverage added or modified

None. US-65 has no renderer surface; AC coverage is the Layer 4 headless integration
suite (`src/main/services/screener.integration.test.ts`), still to be written.

## Public Interfaces Implemented

```typescript
// src/main/services/screener.ts
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

## Implementation Summary

### Approach

`screenWatchlistCandidates` follows `data-model.md`'s orchestration steps 1–7 as a
straight-line pipeline with each boundary wrapped separately:

1. `pullWatchlistChains` with `{ window: { min: dteMin, max: dteMax }, currentDate }`.
2. A `provider_unavailable` chain result short-circuits before any further I/O.
3. `readIvRanks` — `getLatestIvrByUnderlying` in a `try/catch`, renaming
   `IvrSnapshot { ivr, observedAt }` to the engine's `IvRank { value, observedAt }`;
   a throw degrades to an empty map + `logger.warn`.
4. `readUnderlyingPrices` — returns an empty map immediately when
   `maxUnderlyingPrice === null` (no provider call at all); otherwise
   `provider.getStockQuotes` in a `try/catch` degrading the same way.
5. `earningsDate: null` for every ticker — the US-70 seam.
6. `screenChain` per ticker: non-`ok` statuses map straight to an exclusion; `ok`
   tickers run `screenTicker` inside their **own** `try/catch`, so one malformed quote
   drops that ticker to `data_unavailable` and leaves the rest untouched.
7. `rankCandidates` over the screened results, then `newestTimestamp` over the ranked
   list for `quoteTimestamp`.

### Key Design Decisions

- **IVR and quote lookups cover only the `ok` tickers.** A ticker whose chain never
  arrived has nothing to join onto, so requesting it would be wasted I/O.
- **`TickerOutcome` is a two-case union** (`{ screened }` | `{ exclusion }`) rather than
  two parallel arrays. One `map` over `chains.tickers` preserves watchlist order for the
  excluded list for free, without a second correlation pass.
- **`newestTimestamp` compares via `date-fns` `compareAsc(parseISO(...))`**, not string
  ordering — provider timestamps are only guaranteed to be ISO, not to share an offset,
  and the project's Date Handling rule bans lexical timestamp comparison.
- **`complete()` wraps the return** so both exit paths (outage short-circuit and the
  normal path) emit exactly one `logger.info` summary, matching
  `candidate-chains.ts`'s shape.
- **The engine is never mocked in tests**; the failure-isolation path is provoked with a
  non-numeric `bid`, which is what provider garbage actually looks like.

### Deviations from Plan

None. Types and orchestration match `data-model.md` exactly.

## Test Execution Results

```bash
pnpm test src/main/services/screener.test.ts

 ✓ main src/main/services/screener.test.ts (18 tests) 32ms

 Test Files  1 passed (1)
      Tests  18 passed (18)
```

```bash
pnpm test

 Test Files  171 passed (171)
      Tests  1901 passed (1901)
```

## Quality Checks

- ✅ `pnpm test` passed (1901 tests, no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed
- ✅ `pnpm format` run

## Known Limitations / Tech Debt

Primary input for the refactor phase:

- **`chainStatusExclusion` returns an array purely so `screenChain` can index `[0]`.**
  That indexing is typed as `ScreenerExclusion` but is `undefined` for an `ok` chain —
  safe only because the caller guards `chain.status !== 'ok'` first. It should return a
  plain `ScreenerExclusion` for the two failure statuses, with the `ok` case excluded at
  the type level (the tasks file explicitly calls for "a small named function, not an
  inline switch").
- **`DATA_UNAVAILABLE_REASON` is shared but its `code` is repeated** in two object
  literals (`chainStatusExclusion` and `screenChain`'s catch). One named builder would
  keep the pair together.
- **The degrade-to-empty helpers are duplicated in shape** (`readIvRanks` /
  `readUnderlyingPrices` — try, warn, return empty `Map`). The refactor task asks for an
  explicit comparison against `candidate-chains.ts`'s equivalents before deciding whether
  to share; the sync/async split may make sharing not worth it.
- **`screenChain` takes five positional parameters.** A small context object
  (`{ ivRanks, prices, criteria, currentDate }`) would read better at the call site.

## Handoff to Refactor Phase

To resume: run `/refactor us-65`. Refactor phase should:

1. Read this file to find the implementation file and the tech debt above
2. Run `pnpm test` to confirm the baseline is green before touching anything
3. Focus on `src/main/services/screener.ts` and the four items under "Known Limitations"

## Notes

- Layer 3 (`screener:results` IPC + preload) and Layer 4 (AC integration tests) are still
  open. `ScreenerResults` is the shape the IPC contract in
  `plans/us-65/contracts/screener-results.md` wraps.

---

# Green Phase Results: Layer 3 — `screener:results` IPC + Preload

## Feature Context

- **Feature directory**: `plans/us-65/`
- **User story**: `docs/epics/08-stories/US-65-score-wheel-candidates.md`
- **Plan file**: `plans/us-65/plan.md` (Area 6)
- **Contract**: `plans/us-65/contracts/screener-results.md`
- **Red phase results**: `plans/us-65/red-phase-results.md` (Layer 3 section)

## Files touched (production)

- `src/main/ipc/screener.ts` — **new**; `registerScreenerIpc({ db, getProvider })`
  registering the `screener:results` channel
- `src/main/index.ts` — registers `registerScreenerIpc` alongside `registerWatchlistIpc`,
  passing the same provider accessor `registerMarketDataHandlers` receives
- `src/preload/index.ts` — adds the `screener: { results }` namespace to the bridged API
- `src/preload/index.d.ts` — adds `IpcIvRank`, `IpcScoredCandidate`,
  `IpcScreenerExclusion`, `IpcScreenerResultsResult`, and the `screener` namespace on
  `Window.api`

## E2E coverage added or modified

None. US-65 has no renderer surface (the table is US-66); AC coverage runs headlessly in
Layer 4's `src/main/services/screener.integration.test.ts`.

## Public Interfaces Implemented

```typescript
// src/main/ipc/screener.ts
export function registerScreenerIpc(deps: {
  db: Database.Database
  getProvider: () => MarketDataProvider
}): void

// IPC channel — no payload
// 'screener:results'
//   → { ok: true, status: 'ok' | 'provider_unavailable',
//       ranked: ScoredCandidate[], excluded: ScreenerExclusion[],
//       quoteTimestamp: string | null }
//   → { ok: false, errors: [{ field: '__root__', code: 'internal_error', ... }] }

// src/preload/index.ts
window.api.screener.results(): Promise<IpcScreenerResultsResult>
```

## Implementation Summary

### Approach

The handler is a one-liner by contract: `handleIpcCall` wrapping a single
`screenWatchlistCandidates(getProvider(), db)` call. `screenWatchlistCandidates` already
returns exactly the four success fields, so the service result is spread into the
envelope directly rather than re-projected — a field-by-field remap here would be
business logic in a handler file and a second place for the contract to drift.

### Key Design Decisions

- **No Zod request schema.** The channel takes no payload, so there is nothing to parse;
  adding a `z.void()` schema would be ceremony without a guard. Noted in a comment
  pointing at the contract so the omission reads as deliberate.
- **`getProvider` is called inside the handler, not at registration.** Matches
  `registerMarketDataHandlers` — the market-data factory can be recreated at runtime when
  credentials change, so resolving the provider per invocation is what keeps a saved API
  key taking effect without a restart.
- **`provider_unavailable` stays `ok: true`.** It is a modelled state, not an error; the
  handler does not branch on `status` at all.
- **`.d.ts` types mirror the engine field-for-field** rather than widening to `unknown`,
  so US-66 gets real completions and a rename in `core/screener.ts` surfaces as a
  typecheck failure here.

### Deviations from Plan

None.

## Test Execution Results

```bash
pnpm test src/main/ipc/screener.test.ts
 ✓ src/main/ipc/screener.test.ts (4 tests)
 Test Files  1 passed (1)
      Tests  4 passed (4)

pnpm test
 Test Files  172 passed (172)
      Tests  1905 passed (1905)
```

## Quality Checks

- ✅ `pnpm test` passed (1905 tests, no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed (node + web projects)

## Known Limitations / Tech Debt

- `IpcScoredCandidate` / `IpcScreenerExclusion` restate `ScoredCandidate` /
  `ScreenerExclusion` structurally — the preload `.d.ts` is ambient and cannot import
  from `src/main`, so this duplication is inherent to the existing preload pattern (every
  other namespace does the same). A drift here is caught by review, not by the compiler.
- Criteria are not yet configurable over the channel — `screenWatchlistCandidates` falls
  back to `DEFAULT_SCREENING_CRITERIA`. US-67 persists overrides; the service already
  accepts a `criteria` option as the seam.

## Handoff to Refactor Phase

To resume: run `/refactor us-65` (Layer 3). Refactor phase should:

1. Verify `src/main/ipc/screener.ts` contains no business logic (thin-handler rule)
2. Verify the preload `.d.ts` types mirror `ScoredCandidate` field-for-field rather than
   widening to `unknown`
3. Run `pnpm test && pnpm lint && pnpm typecheck`

## Notes

- The preload wiring has no unit test of its own; it is guarded by `pnpm typecheck` and
  will be exercised end-to-end when US-66 calls `window.api.screener.results()`.

---

# Green Phase Results: US-65 Layer 4 — AC Integration Tests

## Outcome

**No production code was written or changed.** Layer 4 is AC coverage over the
already-shipped Layers 1–3 (`tasks.md`: _"No new production code beyond Layers 1–3;
build the seeding/scripting harness and fix whatever full-scenario runs surface"_).
Running the eight AC scenarios end to end through the real chain pull, real IVR read and
real engine surfaced nothing to fix — every expected value came out exactly as the
story's Gherkin specifies.

## Files Changed

- `src/main/services/screener.integration.test.ts` — test-only (created in Red)

## Verification

```bash
pnpm test src/main/services/screener.integration.test.ts

 ✓ src/main/services/screener.integration.test.ts (8 tests) 25ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
```

The suite's non-vacuousness is evidenced by the mutation table in
`red-phase-results.md` (Layer 4 section) — all 8 ACs fail when the behaviour they assert
is broken.

## Handoff to Refactor Phase

Tidy the harness only: evaluate sharing the `chainStrike` / `putQuote` quote builders
with `candidate-chains.integration.test.ts`.
