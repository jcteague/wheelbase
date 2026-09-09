# Research: US-98 — IV-rank staleness tiers

Story: `docs/epics/08-stories/US-98-ivr-staleness-tiers.md`
Reviewed: 2026-09-07. Planning only; no implementation or trader validation claimed.

## Scope and product assumptions

- **Decision:** Plan using Fresh 0–1, Aging 2–3, Stale 4–10, Expired over 10 trading days. Validate the story's screening-habits questions with the trader before implementation.
- **Rationale:** The supplied tiers define the AC examples and support a concrete plan; personal habits cannot be established through code research.
- **Alternatives considered:** Inventing different thresholds; silently claiming the proposed tiers are validated.
- **Decision:** US-96 must land before the watchlist integration in this plan. Retain all 13 US-98 ACs, including both watchlist/Signal cases, as mandatory passing E2E tests.
- **Rationale:** Current `WatchlistPage.tsx` has Ticker, Thesis, Added, and Remove only. The live snapshot and Signal belong to US-96. Reconcile proposed watchlist names against that implementation before generating tasks.
- **Alternatives considered:** Deferring two ACs (rejected); implementing the full eight-point US-96 inside US-98 (unrequested scope).

## Source verification and spec orientation

| Concern         | Current source                                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw IVR         | `core/screener.ts`: `IvRank = { value, observedAt }`; `iv_rank_floor` guards on non-null reading. Score is independent of IVR.                                          |
| Read/assessment | `services/ivr-snapshots.ts` reads latest raw row. `services/screener.ts` accepts `currentDate` but does no ageing.                                                      |
| Collector       | `services/ivr-collector.ts`: broker clock plus UTC weekend heuristic; absent/failed broker assumes trading day. Scraper owns pacing; UTC-day deduplication is separate. |
| Earnings        | `integrations/finnhub-earnings.ts` requests seven days back; parser conflates next and latest past. `services/earnings-dates.ts` persists only next date.               |
| Migration       | 013 is currently last; reserve 014, recheck after US-96 lands.                                                                                                          |
| UI              | `fmtIvr` renders `44 (Aug 7)`; preload/API carry raw reading only.                                                                                                      |
| E2E             | August 2026 IVR constant; wall-clock expiry fixtures; fake clock reaches only collector.                                                                                |
| Composition     | `createFakeIvrCollaborators()` runs after screener IPC registration in `index.ts`; initialize once earlier to share its clock.                                          |

Spec orientation: US-65/66/70/97 feature pages; schema migrations; ADRs `earnings-persisted-per-ticker`, `unknown-earnings-never-excludes`, `ivr-non-trading-day-guard-in-collector`, and `union-ivr-targets-positions-and-watchlist`. Source wins over stale spec claims. The trading-calendar follow-up's broker-calendar suggestion is superseded by the offline decision below.

## Trading calendar and timezone

- **Decision:** Check in a pure NYSE cash-equity session calendar covering 2025–2028, with annual closed dates, shortened sessions, source links, and verification metadata. Covered ordinary weekdays close at 16:00 ET; published early closes at 13:00 ET. Include January 9, 2025's exceptional closure.
- **Rationale:** Count actual completed closes. Black Friday at 14:00 ET already belongs to Friday's session; ignoring early closes is incorrect. A small table is simpler to review than historical holiday formulas and needs no broker credentials. This unknown was independently researched by an agent as required by create-plan.
- **Alternatives considered:** Broker-only calendar (brokerless watchlists fail); weekend-only (fails ACs); holiday formulas (still need exceptions and early-close data).
- **Decision:** Outside calendar coverage return explicit unknown. IVR assessment degrades to no usable reading. Collector logs and retains best-effort collection on unknown coverage; known holidays/weekends skip. Update the table annually and after exceptional exchange announcements.
- **Rationale:** Never certify freshness from a guessed calendar. No runtime calendar-sync service or cadence change.
- **Decision:** Use native `Intl.DateTimeFormat` with an explicit `America/New_York` timezone. Preserve UTC-day persistence deduplication.
- **Alternatives considered:** Locale-string reparsing and timestamp slicing (contrary to date rules); adding a timezone dependency when the runtime already provides the required IANA timezone conversion.

Primary sources: [NYSE calendar](https://www.nyse.com/trade/hours-calendars), [2025–2027 calendar announcement](https://ir.theice.com/press/news-details/2024/NYSE-Group-Announces-2025-2026-and-2027-Holiday-and-Early-Closings-Calendar/default.aspx), [Carter closure announcement](https://ir.theice.com/press/news-details/2024/The-New-York-Stock-Exchange-Will-Close-Markets-on-January-9-to-Honor-the-Passing-of-Former-President-Jimmy-Carter-on-National-Day-of-Mourning/default.aspx).
Cash-equity closes are the explicit convention for underlying-level IVR; do not use product-specific later option closes. No offline table anticipates an unannounced emergency closure.

## Freshness and decision semantics

- **Decision:** Pure `assessIvRank` returns a reading with state, trading-day age, and usability. Absent, invalid, future-dated, unassessable, or time-expired readings return null. Earnings invalidation precedes time expiry because the story explicitly says it overrides the table.
- **Rationale:** Fresh/Aging may decide gates; Stale/earnings-invalid are unknown. Plain Expired is indistinguishable from missing. If an expired reading also predates a known print, retain the muted earnings explanation; the ordinary expiry AC has no such override.
- **Alternatives considered:** Renderer date arithmetic; asymmetric handling of stale-high versus stale-low; all would duplicate or change the story's rule.
- **Decision:** Screener service passes usable raw readings only into `screenTicker`, then overlays assessed readings on ranked rows. Keep floor predicate, yield score, rank ordering, and usable-reading exclusion reasons unchanged.
- **Rationale:** A stale value must remain visible while being absent from both positive gates and negative filters.

## Earnings feed and persistence

- **Decision:** Split the fetch result into successful `{ status: 'read', next, last }` (nullable dates), or `unavailable`. Widen the existing endpoint request to 30 days back through the current caller horizon. Keep one request per ticker, existing concurrency, and failure backoff.
- **Rationale:** Past rows already reach the existing parser. The next date cannot serve as history for newly added names. Endpoint reference: [Finnhub calendar](https://finnhub.io/docs/api/earnings-calendar); field assumptions are verified against the repository parser, not a claimed live smoke test.
- **Alternatives considered:** New endpoint, rolling next into last, or a historical event table (unneeded or misses post-print additions).
- **Decision:** Use ET days for request bounds, split, cache comparisons, and invalidation. Next is earliest on/after today; last is latest strictly before today. Validate actual ISO calendar dates and window bounds.
- **Rationale:** Date-only data does not establish that today's scheduled print has happened. Invalidation compares last-print day strictly after the reading's session day, and at/before today's ET date.
- **Limitation:** A same-session-day print cannot be ordered against the close from its date alone and does not trigger that predicate. It does not automatically become invalid tomorrow: the previous draft's contrary explanation was wrong. Intraday BMO/AMC certainty is outside this store amendment; never display a “current through earnings” affirmation.
- **Alternatives considered:** Fabricating a midnight print timestamp or reliable event-hour data.

- **Decision:** Add nullable `last_earnings` to the existing row. Introduce shared read-through `getEarningsCalendar` returning next verdict plus last knowledge; retain `getEarnings` as the legacy next-only projection.
- **Rationale:** Return a successfully fetched last date even if persistence fails. A separate DB-only `getLastEarnings` after fetching would lose that knowledge. Do not fetch twice.
- **Decision:** Successful no-last knowledge is null; missing/read-failed/unavailable knowledge is undefined. Migrated NULLs cannot be distinguished from checked-empty history by this column alone, so treat them as no known print and never as proof of a checked lookback. On an unavailable refresh, existing next-date cache fallback may still work, but last knowledge degrades to undefined.
- **Decision:** Preserve refresh cadence. Near/passed dates refresh at 12 hours; distant/empty rows may take a week. Do not promise all migrated rows populate within 12 hours.
- **Alternatives considered:** Treating persistence as a prerequisite to using the result; adding refresh traffic or backfill.

## Display and existing mockups

- **Decision:** Extend the ranked table in `mockups/us-66-screener-results.mdx` and the `list` state in `mockups/us-63-watchlist-manager.mdx`, which is US-96's shared mockup. No dedicated US-98/US-96 file exists.
- **Rationale:** Both already show IVR in dense rows. Add qualifiers in place; no new form, sheet, toast, refresh control, or navigation.
- **Decision:** Shared `IvrCell`: Fresh bare value; Aging “38 · 2d”; Stale muted “58 · 6d”; earnings-invalid muted value and “predates earnings” caption; null “n/a”. Tooltip/accessibility text says “trading days” and formats observation in ET. Preserve current numeric normalization (`38.0` displays `38`).
- **Decision:** Watchlist retains US-96 gold/green tones for usable values; unusable tone overrides to muted. Unknown IV gate shows “IV too old to judge” for stale data and cannot yield “Entry ready”. Preserve other gate precedence.
- **Alternatives considered:** Red error styling, duplicate always-visible date stamp, or component-owned ageing.
- **Decision:** Reassess on existing snapshot/screen requests. Keep explicit screener re-screen behavior and US-96 refresh lifecycle; no new chain polling or IVR collection during render.

## E2E clock and fixture design

- **Decision:** Extend the existing fake clock to screener/watchlist service composition, gated to test mode. One base instant drives expiry, earnings, and IVR fixtures. Add a test-only clock setter.
- **Rationale:** A holiday test must collect on the preceding trading day, advance to the holiday, then view/refetch. Seeding by collecting on Thanksgiving must no longer work.
- **Decision:** Replace the fixed-August IVR fixture with per-ticker timestamps or defaults one hour before the fixture clock. Keep quote timestamps independent.
- **Alternatives considered:** Stubbed IPC payloads, calendar-dependent wall-clock tests, or weakening collector guards for fixtures.

## Phase 0 conclusion

Technical unknowns are resolved into the choices above. This plan uses explicit product and dependency assumptions; threshold validation and US-96 integration reconciliation are implementation prerequisites, not completed work. All supplied ACs are retained.
