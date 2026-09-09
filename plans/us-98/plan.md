# Implementation Plan: US-98 — Age an IV-rank reading so a stale one can't pass as current

## Summary

Assess IV rank against completed New York trading sessions and known intervening earnings, then share that verdict across screener results and watchlist Signal. Unusable readings remain unknown for decisions: they cannot satisfy an IV gate or trigger the screener's IV floor. Completion requires all 13 acceptance scenarios, including the watchlist cases, plus the shared collector holiday correction.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/08-stories/US-98-ivr-staleness-tiers.md`
- **Research & Design Decisions:** `plans/us-98/research.md`
- **Data Model & Selection Logic:** `plans/us-98/data-model.md`
- **Screener IPC Contract:** `plans/us-98/contracts/screener-results.md`
- **Earnings Feed/Store Contract:** `plans/us-98/contracts/earnings-calendar-read.md`
- **Watchlist Integration Contract:** `plans/us-98/contracts/watchlist-ivr.md`
- **Quickstart & Verification:** `plans/us-98/quickstart.md`
- **Existing mockups:** `mockups/us-66-screener-results.mdx` (ranked table) and `mockups/us-63-watchlist-manager.mdx` (US-96 list state).
- **Calendar follow-up:** `docs/epics/06-stories/followup-ivr-trading-day-calendar.md`

## Prerequisites

1. Use proposed tier boundaries for this plan; complete the story's trader validation before building. No claim that those preferences have already been validated.
2. US-65, US-67, US-70 and US-97 infrastructure exists. US-96's live watchlist snapshot and Signal are absent here and must land before Area 7. This plan does not defer their US-98 ACs or include the whole US-96 implementation.
3. Before /plan-tasks, reconcile US-96's actual snapshot service, pure Signal function, IPC types and refresh hooks with the proposed extension targets in Area 7 and watchlist-ivr.md. Reuse its API; do not create a parallel endpoint. This is a dependency alignment gate.
4. Recheck migration numbering after the prerequisite lands. 014 is free in this checkout.
5. Calendar source URLs and coverage policy are in research.md. Add only the direct timezone dependency specified below; no broker-calendar network dependency.
6. This is a planning deliverable. Do not mark US-98 implemented or update current-behavior spec until implementation and verification finish.

## Acceptance Criteria Audit

Every Gherkin Scenario is an AC. Each row below appears verbatim as one named E2E test in Area 9; no skipped/deferred scenarios.

| AC   | Scenario                                                       | Implementation areas |
| ---- | -------------------------------------------------------------- | -------------------- |
| AC1  | A reading from the last close shows without an age qualifier   | 1, 2, 5, 6           |
| AC2  | Friday's close is still fresh on Monday morning                | 1, 2, 5, 6           |
| AC3  | An exchange holiday does not age a reading                     | 1, 2, 3, 5, 6        |
| AC4  | An aging reading shows its age but stays usable                | 2, 5, 6              |
| AC5  | A stale reading is muted and cannot satisfy an IV condition    | 2, 7                 |
| AC6  | An expired reading is indistinguishable from no reading        | 2, 5, 6              |
| AC7  | An earnings print invalidates a reading regardless of age      | 2, 4, 5, 6, 7        |
| AC8  | A print before the observation does not invalidate the reading | 2, 4, 5, 6           |
| AC9  | Missing earnings knowledge falls back to the time tiers alone  | 2, 4, 5, 6, 7        |
| AC10 | A stale IV rank never blocks a candidate from ranking          | 2, 5                 |
| AC11 | The IV-rank floor is not applied to a stale reading            | 2, 5, 6              |
| AC12 | The IV-rank floor is not applied to an expired reading         | 2, 5, 6              |
| AC13 | Signal refuses to claim entry readiness on an unusable reading | 2, 7                 |

Area 8 supplies deterministic clocks/fixtures to every AC; Area 9 verifies each through the running app.

## Implementation Areas

### 1. Pure trading-session calendar

**Files to create or modify:**

- `src/main/core/trading-calendar.ts` — native `Intl.DateTimeFormat` conversion with explicit `America/New_York` timezone; no additional timezone dependency.
- `src/main/core/trading-calendar-data.ts` — new immutable 2025–2028 calendar, closures, early closes, coverage and source metadata.
- `src/main/core/trading-calendar.ts` — new session/date/age primitives defined in data-model.md.
- `src/main/core/trading-calendar.test.ts` — new calendar tests.

**Red — tests to write:**

- In trading-calendar.test.ts, Friday 2026-06-12 close through Monday Jun 15 15:59:59 ET has zero subsequent closes; exactly 16:00 ET has one.
- Wednesday Nov 25 close through Thanksgiving has zero; Nov 27 12:59:59 ET still zero, exactly 13:00 ET one. An observation at 14:00 ET maps to Friday.
- Table-test all checked-in full/early closures, ordinary weekdays and weekends; specifically Good Friday Apr 3 and observed Independence Day Jul 3, 2026; Carter Jan 9, 2025; ordinary Dec 31, 2027.
- Map 2026-09-15T02:30Z to Sep 14 session. Pin spring/fall DST close instants and run the same cases under UTC and America/Los_Angeles host TZ.
- Invalid day/instant and unsupported coverage cannot return an invented completed session or age zero. Check year boundaries and the lower-coverage predecessor case.

**Green — implementation:**

- Build getTradingSession, getMostRecentCompletedSession, countCompletedSessionsAfter and etDateOf with the exact signatures in data-model.md.
- Use published NYSE cash-equity close times, date-fns and explicit ET conversion. No string slicing, locale-string reparsing, provider imports, DB or logger.
- Return explicit unavailable outside coverage. Store calendar data as reviewed annual tables with source links and verification date. Keep exceptional closures in data rather than inventing general rules.

**Refactor — cleanup to consider:**

- Share ET conversion and session-close comparison; avoid calendar implementations elsewhere. Keep data separate from computation and avoid speculative plugin/calendar-provider abstractions.

**Acceptance criteria covered:** AC1–AC3; trading-calendar prerequisite for all tiers.

### 2. Pure IVR assessment

**Files to create or modify:**

- `src/main/core/ivr-freshness.ts` — new constants, assessed type, tierForAge and assessIvRank.
- `src/main/core/ivr-freshness.test.ts` — new truth-table tests.
- `src/main/core/screener.ts` — existing raw IvRank type reused without changing floor/ranking behavior.

**Red — tests to write:**

- In ivr-freshness.test.ts, assert exact states/usability at ages 0, 1, 2, 3, 4, 10, 11, 12 using the worked fixtures in data-model.md.
- One-day reading with last print the day after its session becomes predates_earnings and unusable; five-trading-days-before print leaves Fresh.
- Missing/null last knowledge uses time tiers; a future last date does not invalidate; same-session date follows the documented strict later-day policy.
- Earnings-invalid reading older than ten trading days retains earnings explanation; ordinary twelve-day reading returns null.
- Missing, invalid and future-dated readings, or unknown calendar coverage, never yield a usable value. An old observation with eleven provably later covered closes is expired even if its original session precedes coverage.
- Assert input immutability and usable iff fresh/aging across the table. Zero IVR is a valid value, distinct from no reading.

**Green — implementation:**

- Implement data-model.md's precedence: input/calendar validity, completed-session age, known earnings override, then time tiers.
- Reuse raw IvRank; preserve its value and observedAt on assessed objects. Return null for plain expiry/absence; do not persist assessment.
- Put all tier constants in this module. No time reads hidden in core: now is required context.

**Refactor — cleanup to consider:**

- Keep one tier table and one earnings predicate. Do not duplicate this logic in Signal, services, or JSX. Avoid using exceptions as ordinary unknown-data control flow.

**Acceptance criteria covered:** AC1–AC13's shared verdict and usability rules.

### 3. Collector holiday guard

**Files to create or modify:**

- `src/main/services/ivr-collector.ts` and `ivr-collector.test.ts` — replace broker/UTC heuristic with shared calendar.
- `src/main/index.ts` — remove collector-only broker resolution if made unused.
- Existing collector call-site tests — adapt removed broker argument if applicable.

**Red — tests to write:**

- In ivr-collector.test.ts, recognised weekday holiday/weekend returns market_closed with zero Barchart calls, including no configured broker and failed broker-clock conditions.
- A normal weekday after close and a shortened session after 13:00 still collect the positions/watchlist union.
- UTC-next-day but same ET trading-day observation uses the ET guard; snapshot same-UTC-day overwrite assertions remain unchanged.
- Unsupported calendar date logs its unknown status and proceeds best-effort without falsely labelling it a known trading day.
- Existing scraper per-ticker failure, cancellation, target-union, and pacing expectations continue passing.

**Green — implementation:**

- Ask getTradingSession(etDateOf(clock.now())) once at the collector boundary. Known closed → existing market_closed summary; unavailable → log and continue; open → continue.
- Remove now-obsolete fetchMarketStatusOrNull/isTradingDay helpers, associated misleading logs, and collector-only provider wiring made unused by this change.
- Keep scheduler afterClose offset, scraper-owned pacing, target selection and UTC-day persistence unchanged.
- INFO log skip/completion; DEBUG log ET date and calendar verdict. Do not expand this into US-100's collection-cadence story.

**Refactor — cleanup to consider:**

- Remove only imports and provider plumbing orphaned by this change; keep unrelated scheduler/broker behavior intact. Fix affected comments that still claim “assume trading day” on every missing broker.

**Acceptance criteria covered:** AC3's recognised holiday basis and the required collector calendar follow-up.

### 4. Split earnings history from the next print

**Files to create or modify:**

- `migrations/014_add_last_earnings.sql` — new nullable column; recheck numbering.
- `src/main/integrations/finnhub-earnings.ts`, `finnhub-earnings.test.ts` — widened feed.
- `src/main/integrations/fake-earnings.ts`, `fake-earnings.test.ts` — matching offline feed.
- `src/main/services/earnings-dates.ts`, `earnings-dates.test.ts` — shared resolver, projection and persistence.
- `src/main/db/migrate.test.ts` — existing-database migration preservation case.
- Existing earnings/alert fixtures referencing the old feed union — update to new integration shape.

**Red — tests to write:**

- In finnhub-earnings.test.ts, a mixed unordered window returns earliest next and latest past independently; request starts thirty days back and retains caller lookahead.
- Null/TBD/impossible dates and out-of-window rows cannot displace valid dates; empty result gives both null; today stays next because print time is unknown. Pin ET midnight behavior under differing host timezones.
- Per-ticker rejected request/JSON/429 preserves other tickers; existing concurrency and backoff tests pass. Fake feed honours both boundaries and whole-request outage.
- In migrate.test.ts, apply migration to a DB with an existing earnings row: other fields preserved, new column null, migration idempotent through runner.
- In earnings-dates.test.ts, success stores both dates in one upsert; first fetch for a post-print watchlist addition learns last without ever having stored next.
- New getEarningsCalendar returns fresh last even if upsert fails; getEarnings returns the unchanged next-only union. No duplicate request for two fields.
- A single ticker read failure leaves other cached rows usable; prepare failure degrades boundary; unavailable refresh does not overwrite persisted knowledge and returns undefined last for assessment.
- Existing near/passed twelve-hour, distant weekly, deeper-horizon and future-date outage fallback cases continue passing. A migrated null never yields an affirmative earnings-safety claim.

**Green — implementation:**

- Implement contracts/earnings-calendar-read.md. Rename fetchNextEarnings to fetchEarningsCalendar at its actual callers; change seven-day lookback to thirty and replace selectEventDate with independently selected next/last.
- Build request and cache day comparisons on ET using Area 1 conversion/date-fns helpers. Keep next-only engine and alert consumers' contract.
- Extract the existing read/refresh/merge once into getEarningsCalendar; implement getEarnings as projection. Keep successful knowledge in memory so cache errors cannot erase it.
- Persist both dates with existing metadata, no event history or backfill. Preserve cadence; existing rows are enriched on normal refresh.
- Isolate per-ticker boundary failures, retain standard classified warnings and DEBUG cache/date selection logs without credentials.

**Refactor — cleanup to consider:**

- Reuse one next-date validity predicate for learned and cached values. Remove stale comments that describe the old ambiguous past-date feed. Do not duplicate whole cache resolvers for old/new readers.

**Acceptance criteria covered:** AC7–AC9 and earnings-related degradation on both surfaces.

### 5. Assessed read service and screener contract

**Files to create or modify:**

- `src/main/services/ivr-snapshots.ts`, `ivr-snapshots.test.ts` — assessed batch read.
- `src/main/services/screener.ts`, `screener.test.ts`, `screener.integration.test.ts` — usable/display split.
- `src/preload/index.d.ts` — IpcIvRank fields.
- `src/renderer/src/api/screener.ts`, `screener.test.ts` — renderer mirror.
- `src/main/ipc/screener.test.ts` — response/error envelope regression.

**Red — tests to write:**

- In ivr-snapshots.test.ts, latest raw row is assessed with supplied now and earnings knowledge. Missing/malformed ticker degrades alone; valid other ticker survives; no scraper/feed call.
- In screener.integration.test.ts, stale 22 at age six with floor 50 survives with muted assessment; expired 22 at age twelve survives with null; low Fresh/Aging remains excluded by iv_rank_floor.
- Compare same chain with usable/missing/stale/expired IVR: equal yieldPerDelta and unchanged order among survivors. Test earnings-invalid low IVR also bypasses floor.
- Fresh next earnings continues driving existing exclusion/flag/demotion independently from last-earnings IVR invalidation.
- In screener.test.ts, one earnings-store failure retains time tiers and remaining candidates; successful last print plus failed persistence still invalidates its IVR.
- In renderer api/screener.test.ts and ipc/screener.test.ts, full assessed metadata survives forwarding and standard error envelope remains intact.

**Green — implementation:**

- Add getAssessedIvrByUnderlying per data-model.md with per-ticker validation and assessment. Reuse raw snapshot query; log boundary degradation.
- screenWatchlistCandidates reads shared earnings knowledge once, projects next verdicts for existing engine logic and last for assessment.
- Build engine ivRanks map from only usable readings. After rankCandidates, overlay assessed ivRank on each survivor to produce RankedCandidate[].
- Widen preload/API mirror only as documented in contracts/screener-results.md. No new public channel, renderer-supplied ticker/time or request schema.
- Preserve engine FILTERS and score formula; update misleading “IVR never a hard filter” service comment to usable-only semantics.

**Refactor — cleanup to consider:**

- Keep the usable/display conversion in one service location; do not teach core/screener about display tiers.
- Reuse errors/envelope and current array ordering. No extra earnings/IVR request per strike.

**Acceptance criteria covered:** AC1–AC4, AC6–AC12.

### 6. Shared IVR cell and ranked-table display

**Files to create or modify:**

- `src/renderer/src/components/IvrCell.tsx`, `IvrCell.test.tsx` — new shared display.
- `src/renderer/src/components/ScreenerResultsTable.tsx`, `ScreenerResultsTable.test.tsx` — use cell.
- `src/renderer/src/lib/screener-format.ts`, `screener-format.test.ts` — retire permanent observation-date suffix; keep pure formatting if reused.
- `mockups/us-66-screener-results.mdx` — document/example the IVR state treatments within ranked state.

**Red — tests to write:**

- In IvrCell.test.tsx, Fresh 38.0 renders 38 with no visible age qualifier; Aging adds 2d and accessible “2 trading days old”.
- Stale 58 has 6d and muted tone overriding any passed rich-value color; earnings-invalid has muted value and “predates earnings”; null renders n/a without an age.
- A Fresh row has no positive earnings-safety claim. Observation tooltip uses ET when ISO timestamp's UTC date is tomorrow.
- In ScreenerResultsTable.test.tsx, the appropriate IVR cell renders inside its existing row with score/promotion unchanged; expired and absent cells are indistinguishable.
- Existing format tests retain Decimal numeric behavior and do not accidentally change engine exclusion-reason date formatting.

**Green — implementation:**

- Implement the data-model.md cell table and metadata. Render via Tailwind wb-\* tokens, no inline color/spacing styles or renderer assessment.
- Reference `mockups/us-66-screener-results.mdx` ranked screen: keep right-aligned IVR between Δ and OI, ticker earnings badge beneath ticker, rank/yield/spread columns, promotion action and collapsed Excluded section. Add qualifiers/caption inside IVR, not a sheet or overlay.
- Fresh has no permanent date suffix; retain observation date in tooltip only. Muted data-quality state is neutral, not a red validation error. No success navigation/toast is needed for passive display.
- Update mockup annotations/examples for Fresh, Aging, Stale, Expired and earnings-invalid. Its existing whole-table “stale” state means closed-market quote data and must remain separate from IVR ageing.

**Refactor — cleanup to consider:**

- Remove formatting/imports made unused by replacing fmtIvr, and avoid double-rendering date and age. Keep this component free of fetching and Signal rules.

**Acceptance criteria covered:** AC1–AC4, AC6–AC9, AC11–AC12.

### 7. Watchlist IVR and unknown Signal gate

**Files to create or modify:**

- US-96 snapshot service/test; proposed `src/main/services/watchlist-snapshot.ts`, `watchlist-snapshot.test.ts` — extension after prerequisite.
- US-96 pure Signal function/test; proposed `src/main/core/watchlist-signal.ts`, `watchlist-signal.test.ts`, deriveSignal.
- `src/main/ipc/watchlist.ts`, `src/preload/index.d.ts`, `src/renderer/src/api/watchlist.ts` and their existing tests — extend US-96 snapshot type/forwarding as needed.
- `src/renderer/src/pages/WatchlistPage.tsx`, `WatchlistPage.test.tsx` — shared cell/Signal caption.
- `mockups/us-63-watchlist-manager.mdx` — extend US-96 list state examples.

**Red — tests to write:**

- In US-96 Signal tests, sole IVR >= 50 with stale 58 at six days returns unknown rather than met. Sole IVR >= 40 with same reading returns “IV too old to judge”, never Entry ready.
- Missing/expired and earnings-invalid IVR cannot satisfy a required IV gate; Fresh/Aging high IVR can, and usable low remains IV low.
- A ticker without an IV condition gains no new IV blocker. Other unmet price/earnings gates retain precedence with IV unknown as appropriate secondary text.
- In snapshot service tests, identical raw reading/clock/last print produces identical assessment to screener; single earnings failure retains time age and other rows.
- In WatchlistPage.test.tsx, stale rich value is muted with age, Signal explains too old, and existing conditions/price/thesis remain visible. Null renders n/a per US-98.
- In IPC/API tests, reuse the US-96 envelope and assert assessed IVR/Signal are forwarded, with no per-row chain/collector call.

**Green — implementation:**

- After the prerequisite alignment, extend US-96's actual getWatchlistSnapshot/deriveSignal equivalents using Area 5's assessed service and contracts/watchlist-ivr.md.
- Compare threshold only when assessed IVR is usable. Unknown required gate is distinct from false numerical comparison; cannot join the all-met path.
- Reference `mockups/us-63-watchlist-manager.mdx` list screen: Ticker · Signal · Price · IVR · Thesis · Added · Remove; keep condition tags, multi-gate secondary line, price day-change, and amber earnings badge.
- Reuse IvrCell and US-96 threshold-color helper. Usable tones stay thin/muted, acceptable/gold, rich/green; unusable overrides to muted. Keep Signal too-old caption neutral, earnings warning amber, and existing form error treatment untouched.
- Extend mockup list annotations for muted-age and IV-unknown states. Passive display has no new sheet, form, success navigation or shortcut.
- Use US-96's existing snapshot refresh lifecycle; no renderer age calculation and no new data collection on render.

**Refactor — cleanup to consider:**

- Remove any now-duplicated US-96 raw-IVR formatting/assessment made obsolete. Do not introduce a second Signal implementation or snapshot endpoint.
- Verify threshold color helper and met/unknown gate semantics stay separate.

**Acceptance criteria covered:** AC5, AC13, plus shared AC7/AC9 behavior on watchlist.

### 8. Shared test clock and regression fixtures

**Files to create or modify:**

- `src/main/integrations/fake-ivr.ts` — shared mutable test clock; add focused fake-ivr.test.ts.
- `src/main/ipc/test-ivr.ts`, `src/preload/index.ts`, `src/preload/index.d.ts` — test-only clock setter alongside existing test helpers.
- `src/main/index.ts`, `src/main/ipc/screener.ts`, `screener.test.ts` — inject clock through composition.
- US-96 snapshot composition/test — inject same clock.
- `e2e/ivr-helpers.ts`, `e2e/screener-helpers.ts`, `e2e/dates.ts` — common base clock/per-ticker history fixtures.
- Existing screener/criteria/earnings/collector/watchlist/promotion specs — update affected fixtures/assertions.

**Red — tests to write:**

- In fake-ivr.test.ts, changing fake time advances the existing clock object; unavailable fake mode does not override production time; invalid input is rejected.
- In screener.test.ts under ipc/, injected clock reaches currentDate while handler remains one service call under handleIpcCall.
- Add focused helper checks for consistent DTE/earnings offsets against a supplied base. A per-ticker IVR timestamp overrides default; default is one hour earlier than base.
- Existing Fresh IVR E2E assertions remain meaningful on a different run date and after UTC midnight. Holiday fixture flow first persists on an open day, then changes view clock.
- Test clock setter/preload helper only exists behind the existing NODE_ENV=test guard; production cannot supply currentDate through public IPC.

**Green — implementation:**

- Initialize fake collaborators once before registering consumer IPC in index.ts. Share its clock with collector, screener and watchlist. Clock default remains wall time.
- Add the test-only setter to the existing test-ivr seam, with validation and matching preload exposure; do not introduce a public runtime clock setting.
- Capture a single base instant per launch, derive chains/earnings/default IVR from it, and keep the fake clock consistent across relaunch.
- Use deterministic covered weekday defaults for screener fixtures so a real weekend/holiday cannot prevent seeding. Allow explicit viewNow and prior seed clock via helper sequence for holiday cases.
- Update existing fixed-August cell expectations to the Fresh display. Keep quote timestamps and promotion freshness fixtures semantically separate.

**Refactor — cleanup to consider:**

- Avoid parallel fake clock globals or duplicated calendar arithmetic in E2E helpers. Test scripts use real IPC/collector and fake external feeds.
- Preserve helper checks that fail loudly when IVR fixture tickers are not collection targets.

**Acceptance criteria covered:** deterministic infrastructure for AC1–AC13.

### 9. E2e Tests

**Files to create or modify:**

- `e2e/ivr-staleness.spec.ts` — new one-test-per-AC suite.
- Existing `e2e/ivr-collector.spec.ts` — calendar follow-up regression.
- Existing affected E2E specs from Area 8 — retain their distinct prior-story assertions.

**Red — tests to write:**

Each following bullet is exactly one test in ivr-staleness.spec.ts, named verbatim for its AC. Use KO with a surviving put, real temporary DB, fake external feeds and the shared clock. Unless testing earnings invalidation, provide no intervening last print; avoid accidental next-earnings exclusion.

- **AC1: “A reading from the last close shows without an age qualifier”** — KO 38.0, previous completed close; rendered value 38 and no age/date qualifier.
- **AC2: “Friday's close is still fresh on Monday morning”** — observe Fri Jun 12, 2026 close, view Mon Jun 15 before close; returned age 0 and no visible qualifier.
- **AC3: “An exchange holiday does not age a reading”** — collect Wednesday Nov 25, then advance to Thanksgiving Nov 26; screener reading age 0.
- **AC4: “An aging reading shows its age but stays usable”** — observe Sep 18, view Sep 23 at 10:00 ET; show 38 and 2d with usable assessment.
- **AC5: “A stale reading is muted and cannot satisfy an IV condition”** — observe Sep 14, view Sep 23 at 10:00 ET; watchlist KO 58 with IVR >= 50 shows muted 6d, required IV gate not met.
- **AC6: “An expired reading is indistinguishable from no reading”** — observe Sep 3, view Sep 23 at 10:00 ET; twelve-day IVR cell shows n/a, same as a never-collected row.
- **AC7: “An earnings print invalidates a reading regardless of age”** — observe Mon Sep 14, view Wed Sep 16 morning, feed last print Sep 15; muted value and “predates earnings”, not current/usable.
- **AC8: “A print before the observation does not invalidate the reading”** — same one-day observation, last print Sep 4 (five trading days before Sep 14); show 62 without age qualifier.
- **AC9: “Missing earnings knowledge falls back to the time tiers alone”** — no earnings row and unavailable feed for KO, one-day reading; show 62 with no earnings-survival affirmation.
- **AC10: “A stale IV rank never blocks a candidate from ranking”** — twelve-day reading with valid delta-band strike; KO remains ranked and yieldPerDelta equals the same chain with missing/usable IVR, with floor disabled.
- **AC11: “The IV-rank floor is not applied to a stale reading”** — set floor 50 through criteria UI, stale 22 at six days; KO ranked, no IV-floor exclusion, muted age shown.
- **AC12: “The IV-rank floor is not applied to an expired reading”** — floor 50, expired 22 at twelve days; KO ranked with n/a and no IV-floor exclusion.
- **AC13: “Signal refuses to claim entry readiness on an unusable reading”** — KO's only required gate IVR >= 40, stale 58 at six days; watchlist does not say Entry ready and explicitly says IV too old to judge.

**Green — implementation:**

- Drive the actual screener/watchlist pages and use assertions on their visible rows, cell states, captions and Signal. Read metadata/score from real IPC or existing row attributes where the AC's numeric age/score is not all visible.
- Use Area 8's clocks/fixtures; each AC gets its own test, not a conditional branch in one giant scenario. Do not use skip/todo for US-96; a missing prerequisite prevents completion.
- Add the recognised-holiday no-fetch regression to existing collector E2E using the same calendar guard, including brokerless operation.
- Run required ordered unit/integration/lint/typecheck/format checks and the E2E commands in quickstart.md. Inspect logging and run live UI QA under the qa-test skill after implementation.
- After all gates pass, update story/follow-up completion docs and run /update-spec us-98. Spec refresh describes implemented behavior, including calendar maintenance and date-only earnings limits.

**Refactor — cleanup to consider:**

- Share fixture construction, not AC assertions. Ensure fixtures cannot accidentally collect on a holiday or drift out of the DTE window.
- Remove only obsolete fixed-IVR-date expectations; retain US-67 usable-floor and US-70 next-earnings regressions.

**Acceptance criteria covered:** AC1–AC13, one named passing E2E per scenario.

## Completion evidence

Record the test outputs and AC coverage when implemented. No application code, tests, migration, mockup changes or current-behavior spec updates are part of creating this plan. Implementation is complete only when all required checks and every AC above pass; the shared verdict alone does not complete either watchlist scenario.
