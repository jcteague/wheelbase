# Refactor Phase Results: US-121 — IV rank from our own IV history

Refactors are run per layer in the main conversation (`/implement-plan`), after each layer's
Red/Green agents finish.

## Layer 1 — Areas 1, 2, 4, 5, 6, 8

### Automated simplification

- code-simplifier: passed (189/189 Layer 1 tests green afterwards)
- `iv30-selection.ts`: `toIsoDay` and `isThirdFriday` are now module-level function declarations; `getDate` is read once
- `iv-metrics.ts`: `roundHalfUp` and `clampPercent` are now function declarations
- The other six files were already clean, so nothing changed there

### Manual refactorings

1. **Plan-gap fix: calendar read lookahead 50 → 70 days** (`trading-calendar-store.ts`). Monthly
   IV30 candidates reach +70 days (`iv30-selection.ts`), and the far monthly can sit ~58 days
   out. With a 50-day read, holiday-shifting past +50 had no calendar evidence. Done test-first:
   the expected `lastDay` changed, failed, then passed. The session bound for the "ancient
   snapshot" case went from <330 to <340 (470 days of weekdays is 337 sessions).
2. **Comment** — `core/screener.ts` `IvRank.value` said "1dp"; it is now an integer rank.
3. **Reuse check** — the task asked for a shared `roundHalfUp`. No equivalent exists in
   `services/screener.ts` or anywhere else under `src/main`, so the local helper in `iv-metrics.ts` stays.
4. Area 2's single `shiftToSession` helper already serves both weekly and monthly enumeration,
   via `fridayCandidates`.

### Quality checks

- Layer 1 test files: 7 files, 189 tests, all green
- eslint clean on every Layer 1 production file
- The full suite is **not** green between layers. This is expected: the dropped `ivr_snapshot`
  (Area 6) and the new reading shape (Area 5) break `ivr-collector`, `ivr-on-demand`,
  `ivr-snapshots`, `screener` (legacy `seedIvr` cases), `watchlist-snapshot`, `ipc/test-ivr` and
  `ipc/screener.test.ts`. All of these are rewritten in Area 11.

### Files touched (production)

- `src/main/services/trading-calendar-store.ts`
- `src/main/core/iv30-selection.ts`
- `src/main/core/iv-metrics.ts`
- `src/main/core/screener.ts`

## Layer 2 — Area 3 (IV30 engine)

1. **`SessionProbePlan` carries `underlying` and `strikes`.** Before, the engine recovered the
   ticker by parsing the tier's first OCC symbol and re-derived strikes from the underlying VWAP.
   That duplicated `planSessionProbe`'s work and silently assumed both used the same price. A test
   pinning the new fields was written first.
2. **Removed `iv30Of(inputs) as number`.** The strike walk now returns `{ leg, point }` with the IV
   it inverted, and `computeIv30` interpolates those points directly. That removes the cast and the
   second inversion of every winning strike. `iv30FromInputs` still shares `expirationIv` +
   `interpolateTotalVariance`, so there is still one arithmetic path.

## Layer 2 — Areas 7 (daily bars) and 12 (renderer)

1. **Extracted `fetchPages<Page>`** in `alpaca-market-data.ts`. Chain snapshots, open interest and
   daily bars each had their own `do…while (next_page_token)` loop. Daily bars made the third copy,
   which is where the plan said extraction earns its name. The chain's "explicit limit → one page"
   rule is the `followPages` option. Three `apiFetch(...) as X` casts are now one. The 384
   integration tests are unchanged and green.
2. **code-simplifier:** in `IvrCell`, the absence branch is now an early return and the title is
   computed once. In `SettingsPage`, message selection is now an if/else. In `ReadingNote`, the
   flat-range case is a guard. In the fake, `isThirdFriday` is now a function declaration.
3. **Checked:** `isUsableIvrState` is still the renderer's single copy of the usability rule. The
   `value === null` check in `ReadingNote` only chooses the flat-range note.
4. **Deferred to Area 11:** `ivRankAbsence` is optional on the renderer row and candidate types,
   with a `not_collected` fallback in `IvrCell` and `ReadingNote`, because the preload types don't
   carry the field yet. Area 11 makes it required and deletes both fallbacks.
5. **Area 12 plan deviation (accepted):** the range/percentile line appears once, at the end of
   `ivrTooltipCopy`'s body. The plan's extra tooltip `<span>` would have printed it twice.

## Layer 3/4 — Areas 9 (IV-history service) and 10 (run state)

1. **Split the read path into `iv-history-read.ts`** (`readIvMetricsByUnderlying`, `IvMetricsRead`),
   with its tests in `iv-history-read.test.ts`. The Green agent had already moved SQL into
   `iv-history-store.ts`, but `iv-history.ts` was still 350 lines. Collection and reading are
   separate responsibilities, and the read module imports no market-data port, so "reading IV
   metrics makes no market-data request" now holds by construction. `iv-history.ts` is 279 lines.
2. **`inputsOf` returns `null` for a half-written far set.** It used to fill missing `far_*`
   columns with `''`/`0`, so the recompute failed only because `Number('')` became strike 0 and
   happened not to invert. `recomputeIvHistory` now counts that row as `unrecomputable` on
   purpose. A characterization test pins it, and its `far_expiration` precondition is now selected
   so the check can actually fail.
3. **Area 10:** no refactor needed. It is four closures over one `Map` with `settle` as a switch,
   and the type is exported for Area 11 to import.

### Notes carried forward

- `recomputeIvHistory` takes an optional `logger`, a deviation from data-model §3, because the
  required WARN needs one.
- `collectIvHistory` returns `failed` (WARN `iv_history_calendar_unavailable`) when the calendar
  cannot place `now`. This case is not in the plan.
- `insufficient` coverage counts window sessions only, so 60 stored rows including the anchor
  give coverage 59. The e2e "young history" fixture must seed 61 rows to show "covers 60".
- A gap row can only be replaced through `persistIvHistory`: `collectIvHistory` never re-probes
  a gapped session.

## Layer 5 — Area 11 (rewire collector / on-demand / read path; retire Barchart)

1. **`ivHistoryDeps(...)` extraction considered and rejected.** Both callers build the same
   six-field `CollectIvHistoryInput` literal, but their lifecycles around it differ:
   - on-demand marks `pending` synchronously before its calendar `await`
   - the batch rethrows `SqliteError` and marks remaining targets on `no_market_data`

   A helper would save one line and hide which ordering each path depends on.

2. **code-simplifier:**
   - removed the unreachable `absence = null` default in `ReadingNote`, since the prop is required
   - re-wrapped an over-long header line in `watchlist-snapshot.ts`
3. **Barchart retired.** The only remaining `barchart-ivr-scraper|fake-ivr|WHEELBASE_FAKE_IVR|ivr_snapshot|IVRResult`
   references under `src/` are the migration 007/016 tests and the two tests asserting their absence.
4. The full suite is green again: 227 files, 3323 tests; lint and typecheck are clean.

### Advisory (not applied)

- `WatchlistSnapshotRow` / `ScreenerCandidate` carry `ivRank` and `ivRankAbsence` as two nullable
  fields, so the IPC types can represent "both null", which the contract rules out. The main process
  has the discriminated union (`IvRankLookup`); flattening it at the IPC boundary loses the
  invariant, and `IvrCell` / `ReadingNote` now render a defensive "neither" case. Carrying the
  union through preload and the renderer would restore the invariant, but it touches every fixture
  builder, so the decision is left to the user.
- `_test:trading-session-count` keeps a pre-existing `.get() as { count: number }` cast, carried
  over unchanged from the deleted `test-ivr.ts`.

## Layer 6 — Area 13 (e2e harness) and a product fix it surfaced

1. **Bug fix (test-first): the card stayed on "Computing IV history" after a run.**
   - The on-demand path pushed `ivr:snapshot-updated` only on `collected`, and the batch never
     pushed at all. The bench does not poll, so a ticker marked `pending` that then settled
     `failed` / `no_market_data` stayed on "…" until an unrelated refetch. So did an up-to-date
     but sparse series, which should read `insufficient_history`.
   - `onCollected` → `onSettled`, which fires once after every settle.
   - `collectIVRSnapshots` takes the same `onSettled`: per settled ticker, plus every remaining
     target on the `no_market_data` abort.
   - `index.ts` passes one `notifyIvrSnapshotUpdated` to both paths, and `index.test.ts` asserts
     they get the same function.
   - `IvrOnDemand.collect` now has an inner `run()` that returns an outcome, and settle + notify
     happen in one place.
2. **Retitled** `e2e/ivr-collector.spec.ts` "Re-running within the same session overwrites the
   existing row". Under US-121 the test asserts the rerun is `up_to_date` and leaves the row
   unchanged, the opposite of its old name. `docs/spec/features/us-44-*.md` still describes the
   overwrite, so `/update-spec` must reconcile it.
3. **Area 13 refactor criteria:** no `IVRResult`-shaped type, `WHEELBASE_FAKE_IVR`, `IvrOutcome`,
   `testIvrSetOutcomes` or `ivr_snapshot` remains in `e2e/`.

## Layer 7 — Area 14 (e2e acceptance tests)

1. **`seriesEnding(last, values)` exported from `e2e/ivr-helpers.ts`.** The spec's local copy
   re-implemented the helpers' private `seriesOf`, which is now a one-liner over `seriesEnding`.
   The spec's `seriesOn` became unused and was removed.
2. **`setIvRankFloor` moved to `e2e/screener-helpers.ts`**, beside the criteria-sheet helpers it
   drives. It was defined identically in `iv-history.spec.ts` and `ivr-staleness.spec.ts`.
3. **`goToBench` exported from `screener-helpers.ts`**, replacing the spec's identical `openBench`.
   Pre-existing variants in other specs also open the add form or wait for a row, so they stay.
4. Every test in `iv-history.spec.ts` is under ~45 lines.

### Bug fixed by the Area 14 agent (test-first)

- On a fresh install with no credentials, the calendar fetch is the first market-data call, and
  it swallowed `auth_failed` as a generic failure. The card therefore said "Last IV history run
  failed" instead of naming the missing credentials.
- `refreshTradingCalendar` / `ensureTradingCalendar` now report `{ status: 'no_market_data' }`.
- The collector and the on-demand path settle every affected ticker `no_market_data`.

## Verification loop — Gate D fixes (cycle 1 → 2)

- `fake-clock.ts`: a test now covers the fall-back to the wall clock after `setFakeNow(null)`.
- **Carried the `IvRankPair` union through main, preload and renderer.** `ivRank` / `ivRankAbsence`
  can no longer both be null. `IvrCell` / `ReadingNote` take one `ivr` pair prop, and their dead
  "neither" branches are deleted. This resolves the Area 11 advisory.
- **`lookupOf(lookups, ticker)` in `ivr-snapshots.ts`** replaces the duplicated
  `lookups.get(t) ?? NOT_COLLECTED` in `screener.ts` and `watchlist-snapshot.ts`. The branch was
  unreachable in `watchlist-snapshot`; the default now lives in one tested accessor.

## Code review 1 — blocking findings fixed (test-first)

1. **B1: push storm.** The batch pushed `ivr:snapshot-updated` once per ticker, and each push re-ran
   the screener, which pulls a chain per ticker. The fix is `onSettled` → `onCompleted`, fired exactly
   once per run from a `finally`, covering normal end, abort, no-credentials and rethrown DB
   errors. The payload is `{ ticker: null }` for a batch. The on-demand path still pushes per
   ticker.
2. **B2: today frozen from forming bars.** A run minutes after 16:00 pulled still-forming daily
   bars, and a stored reading is never re-probed. `BAR_SETTLE_MINUTES = 45`: today counts as
   complete only 45 minutes after its close, and the scheduled run fires at +60. The e2e
   `afterCloseOn` / `DEFAULT_FAKE_NOW` are now close + 60 min in ET. They were pinned at 21:00Z,
   which is exactly the close under EST, so the derived `BASE_DAY` would have broken the suite
   every winter.
3. **B3: gap-only ticker read "No IV rank collected".** `readIvMetrics` now returns
   `insufficient` with coverage 0 when gap rows exist but no reading does.
4. Minor: `readingParams(): object` → `SqlParams`, and a stale stacked JSDoc on `inputsOf` removed.

### Review advisories (not applied, for the user)

- A 403 entitlement error from Alpaca is mapped to `auth_failed` and aborts the batch as "needs
  credentials". A distinct code, or a check of the response body, would stop a data-entitlement
  403 masquerading as missing credentials.
- `strikeCandidates(200.0000)` returns only `[200]`, with no neighbour to fall back to. This
  matches the plan's spec, but a VWAP exactly on the grid loses the untraded-strike fallback.
- `IvMetricsRead` → `IvRankLookup` → `IvRankPair` are three shapes for one read. Naming
  `IvRankLookup`'s fields `ivRank` / `ivRankAbsence` would remove `toIvRankPair`.
- Row mapping is hand-kept in three places (`Iv30ReadingRow`, `readingParams`, `inputsOf`).
- `Clock`, `CollectorLogger` and `DailyBar` are each duplicated. `DailyBar` in the provider port
  could import core's.
- Unrecomputable rows are re-selected with a WARN on every collect. `no_underlying_bar` gaps are
  never re-probed, so a transient empty stock-bar response gaps that ticker's history permanently.
- The fake provider never returns partial bars or entitlement 403s, holds spot constant, and
  "lists" every strike and Friday.

## Tidy-up pass (post-review)

1. **Leftover "IVR snapshot" naming — done.** `collectIVRSnapshots` / `CollectIVRSnapshots*` →
   `collectIvHistoryBatch` / `CollectIvHistoryBatch*`; `ivr-snapshots.ts` → `iv-rank-lookup.ts`
   (and its test); log messages → `iv_history_collection_completed` / `_aborted`,
   `ivr_assessment_unreadable_reading`, `ivr_assessment_series_read_failed`. Channel-mirroring
   names (`ivr:*`, `onSnapshotUpdated`, `useIvrSnapshotUpdates`, `notifyIvrSnapshotUpdated`) are
   kept, with a comment on why. User-facing copy that still says "snapshot" ("check the snapshot
   diagnostics", "local snapshot store") was left: changing it is a behaviour change, and tests
   assert it. `docs/spec/` still names `collectIVRSnapshots` / `ivr-snapshots.ts`; that is for
   `/update-spec`.
2. **Absence copy in two switches — done.** One `ABSENCE_COPY` table in `lib/ivr-tooltip.ts`
   holds each reason's title, note variant and note text. It is typed as a mapped type over the
   reason, so each entry sees its own narrowed absence and the table must be exhaustive.
   `ivrAbsenceTitle` / `ivrAbsenceNote` are generic over the reason, so the lookup is typed
   without a cast. The strings are unchanged.
3. **Duplicated small types — done.** `Clock` now lives in `src/main/dates.ts` and is used by
   `fake-clock.ts`, `ivr-collector.ts` and `ivr-on-demand.ts`. `ivr-on-demand` reuses
   `CollectorLogger`. The port now re-exports core's `DailyBar`, so core still imports nothing
   from integrations. The `Clock` in `polling-scheduler.ts` has a different shape and predates
   US-121, so it was left.
4. **Three shapes for one read — done.** The lookup is now `IvRankPair`, with fields
   `ivRank` / `ivRankAbsence`. `IvRankLookup` and `toIvRankPair` are deleted, and
   `readIvRankLookup` / `lookupOf` return the pair directly. `IvMetricsRead` is kept.
5. **Row mapping in three places — partly.**
   - `UPSERT_READING`'s named parameters now carry the column names, and `readingParams`
     `satisfies Iv30ReadingRow & { method; observed_at }`. The compiler therefore ties the write
     to the row type that `inputsOf` reads, and `SqlParams` is kept.
   - `inputsOf`'s doubled far-column checks became one `farLegOf` helper, which returns the
     leg, `null` or `'partial'`.
   - I did not add a shared camel↔snake leg-column table. A dynamic mapping in both directions
     needs template-literal key types or runtime type checks on the read side, and would read
     worse than the two compiler-checked literals.
6. **Renderer IV-rank types in the screener module — done.** `IvRankPair`, `IvRank` and
   `IvRankAbsence` now live in `api/ivr.ts`. They were `ScreenerIvRank` /
   `ScreenerIvRankAbsence`, and the new names match main's. All imports are updated.
7. **Imperative code — done.** `getOptionDailyBars` keeps its sequential loop, but each batch
   result goes into a local array, and the map is built once from it. `probeMissingSessions`
   replaces `let optionBars` with a `const` ternary over a new `fetchOptionBars` helper.
8. **Test-only casts — partly.**
   - `e2e/ivr-helpers.ts`: all 12 `as unknown as` casts are removed, along with `IvrTestApi` and
     `IvrApi`. The helpers call `window.api` directly through the `index.d.ts` Window
     augmentation.
     - `index.d.ts` gains a `testSchedulerRunScheduled('ivr-collect')` declaration (it existed
       in the preload but was undeclared) and a precise `IpcTestIv30ReadingRow` return type for
       `testIv30History`.
     - An ad-hoc `tsc` run over the helper plus the d.ts is clean. The e2e directory is not
       part of any tsconfig.
   - `fake-market-data.test.ts`: the casts became `'getAccountInfo' in provider`. This is
     typed and stricter, because it also sees prototype methods.
   - `SettingsPage.test.tsx`: **skipped.** US-121 added one cast, which matches the 38
     pre-existing identical partial-hook mocks in that file. Typing it would mean building a
     full `UseMutationResult` union member (~15 fields per status variant), or rendering under
     a real `QueryClientProvider` with the API module mocked instead. Either is contortion for
     a single mock.
