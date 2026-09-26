# Research: US-112 — Display IVR on the PMCC position card for the LEAPS and short-call contexts

Story: Linear [OPT-20](https://linear.app/optionswheel/issue/OPT-20) · Epic 09 — PMCC Strategy End-to-End · refined 2026-09-21

The Linear issue was **unrefined** when this plan started ("reserves the US-112 number and records
the intent captured in the epic"). The acceptance criteria were written in this pass, reviewed
against the options-expert persona, and saved to Linear. Everything below reads the story as it
now stands in Linear.

## What the code actually does today

- **IV rank is collected and assessed, but never reaches a position.** `getAssessedIvrByUnderlying`
  (`src/main/services/ivr-snapshots.ts`) returns `AssessedIvRank | null` per ticker — value,
  `observedAt`, `ageTradingDays`, `state` (fresh / aging / stale / expired / predates_earnings). Its
  only callers are the screener and the watchlist snapshot. `positions:list` (`list-positions.ts`)
  is a synchronous SQL projection with no IVR, no earnings and no calendar.
- **The renderer already owns the IVR display vocabulary.** `IvrCell` (numeral + `FreshnessRing`
  - tooltip), `lib/ivr-tooltip.ts` (tier titles, decision-usability copy, `isUsableIvrState`),
    `formatIvrValue`. Every surface that shows a rank uses `IvrCell`; nothing defines an IVR _zone_
    (low / mid / high) anywhere in `src/`.
- **The wheel cockpit shows IVR only as a subtitle.** `ContextStrip` takes `ivRank?: number | null`
  and prints `rank N` under the contract IV — and `PositionCockpit` is never handed a value, so the
  prop is dead. US-88 (Epic 12) owns the wheel card badge; it has not started.
- **Refresh out of band exists.** `ivr:snapshot-updated` is pushed after an on-demand collection
  (US-100); `useIvrSnapshotUpdates` invalidates the watchlist and screener queries and is mounted on
  `WatchlistPage` only.
- **Earnings.** `getEarningsCalendar` (`earnings-dates.ts`) returns `{ next, last }` per ticker but
  is async and may fetch from Finnhub when the stored row is stale. `readRows` / `storedLastPrint`
  are private. The alert evaluator (`evaluate-alerts.ts`) keeps the `earnings_date` store warm for
  every active position ticker on each run.
- **The calendar.** `readTradingCalendar(db, now)` is a synchronous read of the cached exchange
  calendar (US-116); the IVR collector and screener refresh it.
- **PMCC does not exist in `src/` yet.** `StrategyType` has a `PMCC` member and nothing else.
  US-101 (entry), US-103 (cost basis), US-18 (card grid) and US-108 (PMCC card) are all Backlog.
  This story enriches US-108's card; the main-process half is buildable today.
- **US-121 (in progress) changes the reading shape.** `AssessedIvRank` gains `percentile`, `low`,
  `high`, and `value` becomes `string | null` (withheld on a flat window). `getAssessedIvrByUnderlying`
  keeps its name and signature; `IvrCell` learns `value === null`. The fake-scraper e2e seam moves
  to bar data.

## Architecture Decisions

### ADR: The IVR reading rides on `positions:list` for every item, assessed once per underlying

- **Decision:** `listPositions` joins `getAssessedIvrByUnderlying` for the distinct tickers in the
  list and puts `ivRank: AssessedIvRank | null` on **every** `PositionListItem`, wheel and PMCC
  alike. The wheel card ignores it until US-88.
- **Why:** The join is by underlying, not by strategy — a strategy branch in the service would be
  a lie about the data. This mirrors US-108's `nextEarnings` precedent ("wheel items ignore it for
  now"). One read serves the whole grid, so a dashboard of twenty positions costs one prepared
  statement, not twenty IPC calls.
- **Alternatives considered:** A separate `ivr:get-for-positions` channel — a second round trip
  and a second cache to invalidate. Reading per card from the renderer — twenty calls. Only on
  PMCC items — the wheel card would need a second seam in three stories' time.

### ADR: `positions:list` stays synchronous and offline — earnings come from the store, never the network

- **Decision:** Export a synchronous, store-only `readLastEarningsFromStore(db, tickers)` from
  `earnings-dates.ts` (a projection of the existing private `readRows` + `storedLastPrint`) and
  feed it to the assessment. `listPositions(db, { now })` gains an options bag with a defaulted
  clock so tests can pin it.
- **Why:** A list call that could block on Finnhub would gate the home screen on a credential the
  journal does not need (CLAUDE.md: the broker is optional; market facts must not gate features).
  The store is already kept warm for position tickers by the alert evaluator and the screener. A
  ticker the store has never seen gives `lastEarnings: undefined`, which the freshness engine
  treats as "no known print" — the reading's age still decides.
- **Alternatives considered:** Making `listPositions` async and calling `getEarningsCalendar` —
  adds network to every dashboard render and a refactor of every caller and test. Skipping
  earnings — a reading that predates a print would show as fresh, which is exactly the trap US-98
  built the state to prevent.

### ADR: The IVR read on the list degrades to "unknown for everyone", never to a failed list

- **Decision:** The assessment is wrapped in `readIvrOrEmpty` inside `list-positions.ts`: any
  throw (calendar read, earnings read, snapshot read) logs `positions_ivr_read_failed` at WARN and
  yields an empty map, so every item carries `ivRank: null` and the list still returns.
- **Why:** The failure-isolation rule for batch surfaces (alert-evaluation-failure-isolation ADR).
  IVR is display-only on this surface; losing it must not blank the dashboard.
- **Alternatives considered:** Letting `handleIpcCall` catch — `positions:list` is not wrapped in
  the envelope today, and a thrown list is a blank home screen either way.

### ADR: IVR zone and the two context readings are pure renderer helpers, not shipped from main

- **Decision:** `src/renderer/src/lib/ivr-context.ts` owns `IVR_LOW_MAX = 30`, `IVR_HIGH_MIN = 60`,
  `ivrZone(value)` and two **ordered registries** of pure predicates, `SHORT_CALL_CONTEXT` and
  `LEAPS_CONTEXT`, each entry `{ status, tone, test, text }`, resolved by `firstMatching`. Inputs
  are the assessed reading plus three booleans US-108's card already derives: `hasShortCall`,
  `leapsInRollWindow` (◆), `earningsBeforeShortExpiry` (⚑).
- **Why:** The renderer cannot import `src/main/core` (the `isUsableIvrState` comment in
  `ivr-tooltip.ts` records this). Nothing in the main process needs the zone — the screener floor
  is a trader criterion, not a zone — so shipping derived copy over IPC would put UI wording in
  the contract. The registry shape is the project's standing pattern for cue logic (alert `RULES`,
  US-108's glyph registry, US-118's lane registries). US-88 will reuse `ivrZone` for the wheel
  badge; the constants exist once.
- **Alternatives considered:** A `zone` field on `IpcIvRank` — every consumer would carry a field
  only two cards read. A discriminated union of inputs — rejected per the tighten-helper-input-types
  feedback; a narrow `Pick`-derived slice is enough.

### ADR: One number, two readings — "context" means the decision, not a second IV figure

- **Decision:** The card shows the underlying's IV rank once on the face and reads it twice in
  tier 2: what it means for the short call (the income leg the trader sells or rolls every
  20–45 days) and what it means for the LEAPS (the long-vega anchor the trader buys or rolls once
  or twice a year). Per-contract IV of each leg (the term-structure signal) is **not** on the card.
- **Why:** IV rank is defined per underlying; there is no "short-call IVR". The epic's phrase "for
  both LEAPS underlying and short call context" describes the two decisions one number informs,
  and they point in opposite directions: rich IV is good for the leg you sell and bad for the leg
  you buy. A card that showed the number without saying which way it cuts for each leg would
  invite the classic PMCC mistake of celebrating high IV while rolling the LEAPS into it.
  Term structure (short IV vs LEAPS IV) is US-113's signal on the entry form and needs its own
  domain review; US-114 owns the roll-dialog panel.
- **Alternatives considered:** Showing each leg's contract IV from the option snapshot
  (`impliedVolatility`, US-117) — cheap to render but it _is_ term structure, and putting it on
  the card would pre-empt US-113 without its review.

### ADR: The face carries the number and the short-call word; tier 2 carries both sentences

- **Decision:** Tier 1 gets one compact cell left of the price block: eyebrow `IVR`, `IvrCell`
  (numeral + freshness ring + existing tooltip), and a one-word zone sub-line in the zone tone
  (`rich` / `fair` / `thin`, or the freshness title when unusable). Tier 2 gains two cells,
  `Short-call IV context` and `LEAPS IV context`, each a status word plus one sentence. The Detail
  bar label appends `· IV`.
- **Why:** US-108's tier map put "IVR and short context" in tier 3, but its Domain Review also
  fixed the rule for what earns the face: the weekly decision. Whether the short call's premium is
  rich is a weekly question, so the number and its one-word read belong on the face. The LEAPS
  reading is a once-a-quarter question and belongs with breakeven and extrinsic in tier 2. The
  face stays calm: one small cell, no new glyph.
- **Alternatives considered:** A new glyph in the header row — glyphs are failure-mode signals,
  silent when healthy; a regime reading is always present, so it is not a glyph. IVR only in
  tier 2 — hides the weekly read behind a click. IVR as a badge next to PMCC — badges name what
  the position _is_.

### ADR: An event-driven rich reading is qualified, not celebrated

- **Decision:** When US-108's ⚑ predicate holds (US-56's earnings-proximity rule: the next print
  falls on or before the nearest short call's expiration, within 10 days), a high-zone reading's
  short-call status becomes `RICH · EVENT-DRIVEN` in gold with "IV re-prices after the {date}
  print — don't anchor on it". No new predicate; the boolean comes from the card.
- **Why:** Epic 12's success criteria require that IVR display flag earnings proximity so traders
  do not anchor on event-driven richness. A short call sold into a pre-earnings IV spike collects a
  fat credit and then gaps through the strike — for a PMCC that is the LEAPS covering a naked-feeling
  short. US-91 owns the general flag for wheel surfaces; this card reuses the predicate it already
  evaluates for the glyph.
- **Alternatives considered:** Suppressing the reading entirely near earnings — the number is still
  true; it is the _read_ that changes.

### ADR: Only a decision-usable reading gets a context sentence

- **Decision:** `isUsableIvrState` (fresh, aging) gates both context cells. Stale, expired and
  predates-earnings readings keep their numeral treatment on the face (muted `62 · 5d`, `exp`,
  gold ring — exactly as `IvrCell` renders them on the bench) but the context cells read `—` with
  the tier's one-line reason. `null` (never collected or unreadable) reads `n/a` on the face and
  `no IV rank collected` in both cells. A US-121 withheld rank (`value: null`, flat window) reads
  `n/a` on the face with the tooltip and `rank withheld — flat 52-week window` in the cells.
- **Why:** The bench refuses to _score_ on an unusable reading; the card must refuse to _advise_
  on one, for the same reason and with the same rule, so there is one definition of usable.
- **Alternatives considered:** Advising on stale readings with a caveat — a caveated "rich" still
  reads as rich at a glance.

### ADR: The card refreshes when a reading lands out of band

- **Decision:** `useIvrSnapshotUpdates` also invalidates `positionQueryKeys.all`, and
  `PositionsListPage` mounts it.
- **Why:** US-100's collect-now and on-add collections finish after the response returns; without
  the push the card would read `n/a` until the next reload. One hook, one more key.
- **Alternatives considered:** A positions-specific listener — duplicate subscription for the same
  event.

## Domain review (options-expert pass, applied)

- **Two clocks, one regime number.** A PMCC trader checks IV rank for the short call every cycle
  ("is this premium worth selling?") and for the LEAPS only when a roll is on the table ("what
  will time cost me?"). The same number answers both, in opposite directions: the short call is
  short vega and likes high IV; the LEAPS is long vega and is dearer to buy or roll in high IV.
  The card must say which way the number cuts for each leg, or it teaches the trader to roll the
  LEAPS into rich IV because the number was green.
- **High IV flatters the LEAPS mark.** A long-dated deep-ITM call carries meaningful vega. When IV
  rank is high the LEAPS mid — and therefore the Net P&L — is inflated by IV that tends to mean-
  revert. The LEAPS reading in the high zone should say so in its sentence: it is the difference
  between "I'm up $400" and "I'm up $400, some of which is vega".
- **The roll window changes the LEAPS read.** Inside US-107's 60-day window DTE dominates: theta on
  the LEAPS is accelerating and waiting for IV to fall costs more than paying up. Low IV inside
  the window is the ideal roll ("ROLL NOW"); high IV inside the window is "the window beats IV —
  roll on DTE". Outside the window the reading is advisory.
- **LEAPS-only is when the short-call read matters most.** Uncovered days are idle capital; the
  trader is deciding _when_ to sell the next short. The same zone applies; only the verb changes
  ("sell the next short call into it" / "wait or go longer DTE").
- **Earnings-driven richness is the trap.** A pre-print IV spike makes premium look rich; the short
  gets sold, the stock gaps, the LEAPS must cover. Qualifying the reading when the print falls
  inside the short's window is the minimum; the ⚑ glyph already fires on the same fact.
- **Thresholds are conventional, not sacred.** The 30 / 60 zone edges are Epic 12's stated
  defaults and match common practice (many traders use 30/50). They are fixed here and referenced
  by US-88; making them configurable is out of scope.
- **Per-leg contract IV is term structure.** Comparing the short's IV to the LEAPS' IV is the
  diagonal-efficiency signal (US-113). It belongs on the entry form and the roll dialog with its
  own review, not squeezed onto a dashboard card.

## Resolved questions

- **Does "short call context" mean the short call's own IV?** No — IV rank is per underlying. Read
  as the decision context (see the one-number-two-readings ADR). Flagged in the Linear story's
  Context section as the interpretation taken.
- **Does US-112 also cover the PMCC detail cockpit?** No. US-118 lists "IVR context (US-112)" as
  out of scope for the cockpit, and US-108's tier map lists it under tier 3, but the story title
  and epic bullet name the _card_. The detail page has no PMCC IVR surface after this story; the
  Linear story's Out of Scope reserves it for the epic to place (US-114 covers the roll dialog).
- **Can this ship before US-108?** The main-process half (areas 1–3) can; the card half cannot.
  The plan orders the work so the seam is explicit.
- **What about the wheel card / `ContextStrip`'s dead `ivRank` prop?** Untouched. US-88 owns the
  wheel badge; the dead prop is pre-existing and noted, not removed.

## Open Questions

None blocking. Two items for the epic, recorded in the Linear story:

- Where the PMCC detail page shows IV rank (US-118 and US-112 both exclude it).
- Whether US-88's wheel-card badge adopts the same face cell so the two cards read alike.
