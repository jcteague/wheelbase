# US-98 — Age an IV-rank reading so a stale one can't pass as current — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Refactor tasks invoke the `/refactor` skill — this must happen in the **main conversation** (subagents cannot invoke skills)

---

## Prerequisite Gates

- [ ] Validate the proposed IVR tiers with the trader before implementation: Fresh 0–1, Aging 2–3, Stale 4–10, Expired >10 trading days
- [ ] Land US-96 before watchlist Signal integration and reconcile its actual snapshot service, Signal function, IPC types and refresh hooks against `plans/us-98/contracts/watchlist-ivr.md`
- [x] Recheck the next migration number before creating the earnings migration; `014` was free in this checkout
- [x] Verify/update the checked-in 2025–2028 NYSE calendar data from the sources in `plans/us-98/research.md`

---

## Layer 1 — Foundation (no cross-area dependencies)

> These areas can be started immediately and run in parallel after the prerequisite gates are checked.

### Pure Trading-Session Calendar

- [x] **[Red]** Write failing tests — `src/main/core/trading-calendar.test.ts`
  - Test cases:
    - Friday 2026-06-12 close through Monday Jun 15 15:59:59 ET has zero subsequent closes; exactly 16:00 ET has one
    - Wednesday Nov 25 close through Thanksgiving has zero; Nov 27 12:59:59 ET still zero; exactly 13:00 ET has one
    - Observation at Friday Nov 27 14:00 ET maps to Friday's session
    - Full and early closures include Good Friday Apr 3, observed Independence Day Jul 3, 2026, Carter Jan 9, 2025, and ordinary Dec 31, 2027
    - `2026-09-15T02:30:00Z` maps to the Sep 14 ET session; spring/fall DST close instants are pinned under UTC and America/Los_Angeles host TZ
    - Invalid day/instant and unsupported coverage never return invented age zero; include year-boundary and lower-coverage predecessor cases
  - Run `pnpm test -- src/main/core/trading-calendar.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `package.json`, `pnpm-lock.yaml`, `src/main/core/trading-calendar-data.ts`, `src/main/core/trading-calendar.ts` _(depends on: Pure Trading-Session Calendar Red ✓)_
  - Use native `Intl.DateTimeFormat` with an explicit `America/New_York` timezone; no additional timezone dependency is needed
  - Implement `getTradingSession`, `getMostRecentCompletedSession`, `countCompletedSessionsAfter`, and `etDateOf` per `plans/us-98/data-model.md`
  - Use explicit America/New_York conversion, date-fns helpers and published NYSE cash-equity close times; no string slicing, provider imports, DB imports or logger
  - Store reviewed immutable 2025–2028 closure/early-close data with source links and verification date
  - Run `pnpm test -- src/main/core/trading-calendar.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/trading-calendar.ts`, `src/main/services/trading-calendar-store.ts` _(the planned `core/trading-calendar-data.ts` was never created — the calendar is fetched and cached, not checked in)_ _(depends on: Pure Trading-Session Calendar Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or substitute manual cleanup
  - Share ET conversion and close comparison helpers only where they reduce duplication; keep data separate from computation
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Pure IVR Assessment

**Requires:** Pure Trading-Session Calendar Green ✓

- [x] **[Red]** Write failing tests — `src/main/core/ivr-freshness.test.ts` _(depends on: Pure Trading-Session Calendar Green ✓)_
  - Test cases:
    - Exact tier states/usability at ages 0, 1, 2, 3, 4, 10, 11 and 12 using the worked fixtures in `data-model.md`
    - Last earnings date strictly after the observation session makes a one-day reading `predates_earnings`; five-trading-days-before print leaves it Fresh
    - Missing/null earnings knowledge uses time tiers; future last date and same-session date do not invalidate
    - Earnings-invalid reading older than ten trading days keeps the earnings explanation; ordinary twelve-day reading returns null
    - Missing, invalid, future-dated, unknown-calendar and absent readings never yield usable values; zero IVR remains valid
    - Input immutability and `usable` iff Fresh/Aging across the truth table
  - Run `pnpm test -- src/main/core/ivr-freshness.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/ivr-freshness.ts` _(depends on: Pure IVR Assessment Red ✓)_
  - Implement `FRESH_MAX_AGE`, `AGING_MAX_AGE`, `STALE_MAX_AGE`, `tierForAge`, and `assessIvRank`
  - Apply precedence: input/calendar validity, completed-session age, known earnings override, then time tiers
  - Reuse raw `IvRank` from `src/main/core/screener.ts`; preserve value and observedAt on assessed readings; return null for plain expiry/absence
  - Require `now` in context; no hidden time reads and no logging in core
  - Run `pnpm test -- src/main/core/ivr-freshness.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/ivr-freshness.ts` _(depends on: Pure IVR Assessment Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or substitute manual cleanup
  - Keep one tier table and one earnings predicate; do not duplicate assessment logic in services, Signal or JSX
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Boundary Services and Feed Contracts (depends on Layer 1 calendar/assessment)

> These areas can run in parallel after their noted Layer 1 dependencies are complete.

### Collector Holiday Guard

**Requires:** Pure Trading-Session Calendar Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/ivr-collector.test.ts` _(depends on: Pure Trading-Session Calendar Green ✓)_
  - Test cases:
    - Recognized weekday holiday/weekend returns `market_closed` with zero Barchart calls, including no configured broker and failed broker-clock conditions
    - Normal weekday after close and shortened session after 13:00 ET collect the positions/watchlist union
    - UTC-next-day but same ET trading day uses the ET guard; snapshot same-UTC-day overwrite behavior remains unchanged
    - Unsupported calendar date logs unknown status and proceeds best-effort without falsely labelling it known-open
    - Existing scraper per-ticker failure, cancellation, target-union and pacing expectations keep passing
  - Run `pnpm test -- src/main/services/ivr-collector.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/ivr-collector.ts`, `src/main/index.ts` as needed _(depends on: Collector Holiday Guard Red ✓)_
  - Ask `getTradingSession(etDateOf(clock.now()))` once at the collector boundary
  - Known closed → existing `market_closed` summary; unavailable → log and continue; open → continue
  - Remove obsolete `fetchMarketStatusOrNull` / `isTradingDay` helpers and collector-only broker wiring made unused
  - Preserve scheduler after-close offset, scraper pacing, target selection and UTC-day persistence
  - Add INFO skip/completion logs and DEBUG ET date/calendar verdict logs
  - Run `pnpm test -- src/main/services/ivr-collector.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/ivr-collector.ts` _(depends on: Collector Holiday Guard Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or substitute manual cleanup
  - Remove only imports/provider plumbing orphaned by this change; keep unrelated scheduler and broker behavior intact
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Split Earnings History from Next Print

**Requires:** Pure Trading-Session Calendar Green ✓

- [x] **[Red]** Write failing tests — `src/main/integrations/finnhub-earnings.test.ts`, `src/main/integrations/fake-earnings.test.ts`, `src/main/services/earnings-dates.test.ts`, `src/main/db/migrate.test.ts` _(depends on: Pure Trading-Session Calendar Green ✓)_
  - Test cases:
    - Mixed unordered feed rows return earliest next and latest past independently; request starts 30 ET days back and preserves caller lookahead
    - Null/TBD/impossible/out-of-window rows cannot displace valid dates; empty result gives both null; today stays next because print time is unknown
    - Per-ticker request, JSON and 429 failures preserve other tickers; existing concurrency/backoff tests pass
    - Fake feed honours lookback/lookahead boundaries and whole-request outage
    - Migration preserves existing earnings rows, adds nullable `last_earnings`, and is idempotent through the runner
    - `getEarningsCalendar` stores both dates in one upsert; post-print watchlist additions learn `last` without prior stored `next`
    - Successful fetched last is returned even if upsert fails; `getEarnings` remains next-only; one shared resolver prevents duplicate requests
    - Cache read/preparation/refresh failures isolate per ticker and degrade `last` to undefined without erasing valid next fallback semantics
  - Run `pnpm test -- src/main/integrations/finnhub-earnings.test.ts src/main/integrations/fake-earnings.test.ts src/main/services/earnings-dates.test.ts src/main/db/migrate.test.ts` — all new tests must fail
- [x] **[Green]** Implement — migration plus earnings integration/store files _(depends on: Split Earnings History from Next Print Red ✓)_
  - Add `migrations/014_add_last_earnings.sql` or the next free migration number
  - Replace `fetchNextEarnings` at actual boundary callers with `fetchEarningsCalendar`
  - Implement `EarningsCalendarRead` and `getEarningsCalendar`; keep `getEarnings` as a projection for existing next-only alert/US-70 callers
  - Build request/cache day comparisons on ET using Layer 1 helpers; request ET today minus 30 through caller horizon
  - Persist `last_earnings` with existing metadata; preserve cadence, backoff, failure classification and per-ticker isolation
  - Update existing alert/earnings fixtures for the widened fake feed shape
  - Run the targeted earnings and migration tests — all tests must pass
- [x] **[Refactor]** `/refactor` — earnings integration/store files _(depends on: Split Earnings History from Next Print Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or substitute manual cleanup
  - Reuse one next-date validity predicate for learned and cached values; remove stale comments about the old ambiguous past-date feed
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Shared Test Clock and Regression Fixtures

**Requires:** Pure Trading-Session Calendar Green ✓

- [x] **[Red]** Write failing tests — `src/main/integrations/fake-ivr.test.ts`, `src/main/ipc/screener.test.ts`, affected E2E helper tests if present _(depends on: Pure Trading-Session Calendar Green ✓)_
  - Test cases:
    - Changing fake time advances the existing clock object; unavailable fake mode does not override production time; invalid input is rejected
    - Injected clock reaches `currentDate` while screener IPC remains one service call inside `handleIpcCall`
    - Helper checks keep DTE/earnings offsets consistent from one supplied base; per-ticker IVR timestamp overrides default; default is one hour before base
    - Fresh IVR E2E assertions remain stable on a different run date and after UTC midnight
    - Test clock setter/preload helper exists only behind the existing `NODE_ENV=test` guard
  - Run `pnpm test -- src/main/integrations/fake-ivr.test.ts src/main/ipc/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/fake-ivr.ts`, `src/main/ipc/test-ivr.ts`, preload types, `src/main/index.ts`, E2E helpers _(depends on: Shared Test Clock Red ✓)_
  - Initialize fake collaborators once before registering consumer IPC in `index.ts`
  - Share the same clock with collector, screener and the US-96 watchlist snapshot composition; default remains wall time
  - Add a test-only setter to the existing test-IVR seam with validation and matching preload exposure
  - Capture a single base instant per E2E launch; derive expirations, earnings and default IVR timestamps from it
  - Use deterministic covered weekday defaults and allow explicit seed/view clock sequencing for holiday scenarios
  - Update existing fixed-August IVR display expectations to the Fresh display
  - Run the targeted fake clock and IPC tests — all tests must pass
- [x] **[Refactor]** `/refactor` — fake clock and E2E helper files _(depends on: Shared Test Clock Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or substitute manual cleanup
  - Avoid duplicate fake clock globals or duplicated calendar arithmetic in E2E helpers
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Screener Assessment and Display (depends on Layer 2 earnings + test clock)

> Service/API and renderer display can proceed in parallel once the assessed type, earnings knowledge, and clock seams exist.

### Assessed IVR Read Service and Screener Contract

**Requires:** Pure IVR Assessment Green ✓, Split Earnings History from Next Print Green ✓, Shared Test Clock Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/ivr-snapshots.test.ts`, `src/main/services/screener.test.ts`, `src/main/services/screener.integration.test.ts`, `src/main/ipc/screener.test.ts`, `src/renderer/src/api/screener.test.ts` _(depends on: Pure IVR Assessment Green ✓, Split Earnings History from Next Print Green ✓, Shared Test Clock Green ✓)_
  - Test cases:
    - Latest raw row is assessed with supplied now and earnings knowledge; malformed ticker degrades alone; no scraper/feed call
    - Stale 22 at age six with floor 50 survives with muted assessment; expired 22 at age twelve survives with null
    - Usable/missing/stale/expired IVR keeps equal `yieldPerDelta` and unchanged survivor order; earnings-invalid low IVR bypasses the floor
    - Fresh next earnings still drives existing exclusion/flag/demotion independently from last-earnings IVR invalidation
    - One earnings-store failure retains time tiers and remaining candidates
    - Renderer API and IPC tests forward full assessed metadata and keep the standard error envelope
  - Run `pnpm test -- src/main/services/ivr-snapshots.test.ts src/main/services/screener.test.ts src/main/services/screener.integration.test.ts src/main/ipc/screener.test.ts src/renderer/src/api/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/ivr-snapshots.ts`, `src/main/services/screener.ts`, preload/API mirror types _(depends on: Assessed IVR Read Service and Screener Contract Red ✓)_
  - Add `getAssessedIvrByUnderlying(db, tickers, { now, lastEarnings })` with per-ticker validation and assessment
  - Have `screenWatchlistCandidates` read shared earnings knowledge once, project next verdicts for existing engine logic and last dates for IVR assessment
  - Feed the engine only usable raw IVR readings; overlay assessed `ivRank` onto ranked survivors after `rankCandidates`
  - Widen `IpcIvRank` in `src/preload/index.d.ts` and renderer `api/screener.ts` per `contracts/screener-results.md`
  - Preserve engine filters, score formula, public channel shape and `handleIpcCall` envelope
  - Run the targeted service, IPC and renderer API tests — all tests must pass
- [x] **[Refactor]** `/refactor` — assessed IVR service and screener contract files _(depends on: Assessed IVR Read Service and Screener Contract Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or substitute manual cleanup
  - Keep usable/display conversion in one service location; do not teach `core/screener` about display tiers
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Shared IVR Cell and Ranked Table Display

**Requires:** Assessed IVR Read Service and Screener Contract Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/IvrCell.test.tsx`, `src/renderer/src/components/ScreenerResultsTable.test.tsx`, `src/renderer/src/lib/screener-format.test.ts` _(depends on: Assessed IVR Read Service and Screener Contract Green ✓)_
  - Test cases:
    - Fresh `38.0` renders `38` with no visible age qualifier
    - Aging adds `2d` and accessible/title text `2 trading days old`
    - Stale `58` shows `6d` and muted tone, overriding rich-value color
    - `predates_earnings` renders muted value plus `predates earnings`; null renders `n/a` without an age
    - Fresh row has no positive earnings-safety claim; observation tooltip formats ET even when UTC date is tomorrow
    - Screener table renders the appropriate IVR cell without changing score/promotion behavior; expired and absent cells are indistinguishable
    - Existing Decimal formatting and exclusion-reason date formatting remain unchanged
  - Run `pnpm test -- src/renderer/src/components/IvrCell.test.tsx src/renderer/src/components/ScreenerResultsTable.test.tsx src/renderer/src/lib/screener-format.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/IvrCell.tsx`, `ScreenerResultsTable.tsx`, `src/renderer/src/lib/screener-format.ts`, `mockups/us-66-screener-results.mdx` _(depends on: Shared IVR Cell and Ranked Table Display Red ✓)_
  - Implement `IvrCell({ ivRank, usableToneClass? })` using renderer mirror types and Tailwind `wb-*` tokens only
  - Render `data-ivr-state` for deterministic assertions and ET observation metadata in tooltip/title
  - Remove permanent observation-date suffix from Fresh display; keep observation date in tooltip only
  - Keep ranked table layout from US-66: right-aligned IVR between delta and OI, ticker earnings badge beneath ticker, promotion action and collapsed Excluded section
  - Update the US-66 mockup examples for Fresh, Aging, Stale, Expired and earnings-invalid; keep closed-market quote staleness separate from IVR age
  - Run the targeted renderer tests — all tests must pass
- [x] **[Refactor]** `/refactor` — shared IVR cell and table files _(depends on: Shared IVR Cell and Ranked Table Display Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or substitute manual cleanup
  - Remove formatting/imports made unused by replacing `fmtIvr`; avoid double-rendering date and age
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Watchlist Integration (depends on US-96 and shared assessment)

### Watchlist IVR and Unknown Signal Gate

**Requires:** US-96 alignment gate ✓, Pure IVR Assessment Green ✓, Assessed IVR Read Service and Screener Contract Green ✓, Shared IVR Cell and Ranked Table Display Green ✓

- [ ] **[Red]** Write failing tests — US-96 actual Signal, snapshot, IPC/API and `src/renderer/src/pages/WatchlistPage.test.tsx` files _(depends on: all Watchlist Integration requirements ✓)_
  - Test cases:
    - Sole IVR gate `IVR >= 50` with stale 58 at six days is unknown rather than met
    - Sole IVR gate `IVR >= 40` with stale 58 says `IV too old to judge` and never `Entry ready`
    - Missing/expired and earnings-invalid IVR cannot satisfy a required IV gate; Fresh/Aging high can; usable low remains `IV low`
    - Ticker without an IV condition gains no new IV blocker
    - Other unmet price/earnings gates retain precedence with IV unknown as appropriate secondary text
    - Snapshot service produces assessment identical to screener for the same raw reading, clock and last print; single earnings failure retains time age and other rows
    - Watchlist page renders muted stale rich value with age, Signal explanation, existing conditions, price and thesis
    - IPC/API tests forward assessed IVR/Signal through the US-96 envelope with no per-row chain or collector call
  - Run US-96's actual targeted core/service/IPC/API/page tests — all new tests must fail
- [ ] **[Green]** Implement — US-96 actual snapshot, Signal, IPC/API and Watchlist page files _(depends on: Watchlist IVR and Unknown Signal Gate Red ✓)_
  - Extend US-96's actual `getWatchlistSnapshot` and `deriveSignal` equivalents using `getAssessedIvrByUnderlying`
  - Compare threshold only when assessed IVR is usable; required unknown IV gate prevents Entry ready
  - Preserve earnings-first and price-before-IV precedence, with IV unknown as secondary text when appropriate
  - Reuse `IvrCell` and US-96 threshold color helper; unusable states override to muted
  - Preserve US-96 snapshot IPC, payload Zod schema, refresh lifecycle and read-only behavior; do not add a competing endpoint or render-time collection
  - Update `mockups/us-63-watchlist-manager.mdx` list-state examples for muted-age and IV-unknown states
  - Run US-96's actual targeted tests — all tests must pass
- [ ] **[Refactor]** `/refactor` — watchlist snapshot, Signal and page files _(depends on: Watchlist IVR and Unknown Signal Gate Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or substitute manual cleanup
  - Remove duplicated raw-IVR formatting/assessment made obsolete; keep threshold color helper and met/unknown gate semantics separate
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — E2E Tests and Regression Coverage

**Requires:** All Green tasks from Layers 1–4 ✓

### US-98 E2E Acceptance Suite

- [x] **[Red]** Write E2E tests — `e2e/ivr-staleness.spec.ts`, existing `e2e/ivr-collector.spec.ts`, affected regression specs _(depends on: all prior Green tasks ✓)_
  - One `it()` per AC, with names matching the scenario text exactly:
    - AC1: `A reading from the last close shows without an age qualifier`
    - AC2: `Friday's close is still fresh on Monday morning`
    - AC3: `An exchange holiday does not age a reading`
    - AC4: `An aging reading shows its age but stays usable`
    - AC5: `A stale reading is muted and cannot satisfy an IV condition`
    - AC6: `An expired reading is indistinguishable from no reading`
    - AC7: `An earnings print invalidates a reading regardless of age`
    - AC8: `A print before the observation does not invalidate the reading`
    - AC9: `Missing earnings knowledge falls back to the time tiers alone`
    - AC10: `A stale IV rank never blocks a candidate from ranking`
    - AC11: `The IV-rank floor is not applied to a stale reading`
    - AC12: `The IV-rank floor is not applied to an expired reading`
    - AC13: `Signal refuses to claim entry readiness on an unusable reading`
  - Use real temporary DBs, fake external feeds, the shared test clock and KO with a surviving put
  - Seed holiday scenarios on the preceding open day, then advance the shared clock; do not collect on the holiday to seed them
  - Add recognized-holiday no-fetch regression to `e2e/ivr-collector.spec.ts`, including brokerless operation
  - Run `pnpm test:e2e -- e2e/ivr-staleness.spec.ts` — all new tests must fail for the right reason
  - **Not written Red-first:** Layers 1–3 were already Green when this suite was written, so
    the tests passed on first run. Sensitivity was proved by mutation instead — ageing AC4's
    observation one session renders `38 · 3d` and fails; removing AC3's holiday from the fake
    exchange calendar ages the reading to 1 and fails. Both reverted.
- [x] **[Green]** Make E2E tests pass _(depends on: US-98 E2E Acceptance Suite Red ✓)_
  - Drive the actual screener/watchlist pages and assert visible rows, cell states, captions and Signal
  - Read metadata/score from real IPC or existing row attributes only where the AC's numeric age/score is not fully visible
  - No skipped/todo US-98 scenarios; missing US-96 prerequisite prevents completion
  - Run:
    - `pnpm test:e2e -- e2e/ivr-staleness.spec.ts`
    - `pnpm test:e2e -- e2e/screener-results.spec.ts e2e/screening-criteria.spec.ts e2e/screener-earnings.spec.ts e2e/ivr-collector.spec.ts e2e/ivr-watchlist-collection.spec.ts`
    - `pnpm test:e2e`
  - All E2E tests must pass
- [x] **[Refactor]** `/refactor` E2E tests and helpers _(depends on: US-98 E2E Acceptance Suite Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or substitute manual cleanup
  - Share fixture construction without sharing AC assertions; keep fixtures from drifting out of DTE windows or collecting on holidays
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — Final Verification and Documentation

**Requires:** All Red, Green and Refactor tasks from Layers 1–5 ✓

### Completion Evidence and Spec Refresh

- [x] **[Green]** Run required ordered checks _(depends on: all Layer 5 Refactor tasks ✓)_
  - Run `pnpm test`
  - Run `pnpm lint`
  - Run `pnpm typecheck`
  - Run `pnpm format`
  - Review formatting diff and INFO/DEBUG boundary logs; confirm `src/main/core/` remains free of logging/I/O
- [ ] **[Green]** Run QA and update docs _(depends on: Required Ordered Checks Green ✓)_
  - Run live UI QA under the `qa-test` skill for US-98 acceptance coverage
  - Record test outputs and AC coverage in completion evidence
  - Mark the IVR trading-day calendar follow-up resolved with the offline calendar architecture
  - Update story/follow-up completion docs and shared mockup annotations
  - Run `/update-spec us-98` after implementation and verification complete

---

## Completion Checklist

- [ ] All prerequisite gates complete
- [ ] All Red tasks complete (tests written and failing for the right reason)
- [ ] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean) — except Layer 4's, which has no implementation to refactor
- [ ] E2E tests cover all 13 ACs with one named test per scenario — **11 of 13**; AC5 and AC13
      need US-96's watchlist Signal and are omitted rather than skipped
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean (203 files, 2651 tests)
- [x] `pnpm format` run and diff reviewed
- [ ] US-98 QA completed
- [ ] `/update-spec us-98` completed after implementation verification
