---
story: us-112
kind: feature
parent: null
topics: [market-data, ivr-freshness, pmcc, position-list, ipc-handlers]
status: planned
---

# Implementation Plan: US-112 — Display IVR on the PMCC position card for the LEAPS and short-call contexts

## Summary

Put the underlying's freshness-assessed IV rank on `positions:list` once per ticker, and let the
PMCC card read it twice: a compact `IVR 62 ◉ rich` cell on the card face (the weekly short-call
question) and two tier-2 cells that say what the same number means for the short call and for the
LEAPS, in opposite directions. Only decision-usable readings get a sentence; stale, expired,
predates-earnings and missing readings show exactly what the bench shows for them. Done when the
Linear scenarios pass end to end on US-108's card, wheel items are unchanged apart from carrying
`ivRank`, and a failed IVR read costs the dashboard nothing but the cell.

Estimated at **3 points**. Areas 1–3 are main-process and land today; areas 4–6 are the card and
need US-108. The seam between 3 and 4 is the natural split if US-108 is still Backlog when this
starts.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** Linear [OPT-20](https://linear.app/optionswheel/issue/OPT-20/us-112-display-ivr-on-pmcc-position-card-for-leaps-underlying-and) — refined and saved 2026-09-21; there is no archived markdown story for US-112
- **Mockup:** `mockups/us-112-pmcc-card-ivr-context.mdx`
- **Research & Design Decisions:** `plans/us-112/research.md`
- **Data Model, Registries & Fixture Numbers:** `plans/us-112/data-model.md`
- **API Contract:** `plans/us-112/contracts/positions-list.md`
- **Quickstart & Verification:** `plans/us-112/quickstart.md`

## Prerequisites

- **Existing, reused as-is:** `getAssessedIvrByUnderlying` (`services/ivr-snapshots.ts`),
  `assessIvRank` / `isUsableState` (`core/ivr-freshness.ts`), `readTradingCalendar`
  (`services/trading-calendar-store.ts`), `IvrCell` + `FreshnessRing` + `lib/ivr-tooltip.ts`
  (`TIER_TITLE`, `isUsableIvrState`, `tradingDaysLabel`), `formatIvrValue`, the
  `ivr:snapshot-updated` push and `useIvrSnapshotUpdates`.
- **US-108 (OPT-16, Backlog) — blocking for areas 4–6.** Supplies `PmccPositionCard`, its tier-2
  cell primitive, and the three booleans this story's context registries take (`hasShortCall`, the
  ◆ roll-window predicate, the ⚑ earnings predicate) plus `nextEarnings` on the list item. US-18
  (card grid) blocks US-108.
- **US-121 (OPT-27, In Progress) — not blocking.** Changes `AssessedIvRank`'s shape; this story
  passes the reading through untouched and handles `value: null` in one registry row.

## Implementation Areas

### 1. Store-only last-earnings read

**Files to create or modify:**

- `src/main/services/earnings-dates.ts` — export `readLastEarningsFromStore(db, tickers, now)`,
  a projection over the existing private `readRows` + `storedLastPrint`; no fetch, no refresh.
- `src/main/services/earnings-dates.test.ts` — new describe block.

**Red — tests to write:**

- `readLastEarningsFromStore` with a stored row whose last print is before `now` → `Map { 'XYZ' → '2026-10-28' }` (upper-cased key, ISO day).
- With no row for the ticker → `Map { 'XYZ' → undefined }` (unknown, not null).
- With a row whose stored print is in the future relative to `now` → the same value `storedLastPrint` gives `getEarningsCalendar`'s fallback (assert equality against a `getEarningsCalendar` call with a fetcher stub that throws, to prove the two agree).
- Never calls the fetcher: pass a `fetch` spy through module state / `vi.spyOn(defaultFetcher)` and assert zero calls; the function has no network path.
- Empty `tickers` → empty map, no query.

**Green — implementation:**

- `readLastEarningsFromStore(db, tickers, now): Map<string, string | null | undefined>` in `earnings-dates.ts`: de-dupe + upper-case, `readRows`, map each requested ticker to `storedLastPrint(row, now)` or `undefined`.
- DEBUG log `earnings_last_print_store_read` with `{ tickers, hits }`.

**Refactor — cleanup to consider:**

- `getEarningsCalendar`'s fallback branch computes the same projection inline; call the new function there if it reads cleaner without changing behaviour. Check naming against `storedVerdict` / `storedLastPrint`.

**Acceptance criteria covered:**

- Supports "A PMCC with no IV rank collected reads n/a" and "A reading that predates the last earnings print gets no context" — the store-only read is what lets the list judge `predates_earnings` without a network call.

### 2. `ivRank` on every `positions:list` item, degrading to null

**Files to create or modify:**

- `src/main/schemas.ts` — `PositionListItem.ivRank: AssessedIvRank | null` (import the type from `core/ivr-freshness`).
- `src/main/services/list-positions.ts` — `ListPositionsOptions { now?: Date }`, `readIvrOrEmpty`, the per-item join.
- `src/main/services/list-positions.test.ts` — new describe block.
- `src/preload/index.d.ts` — `IpcPositionListItem.ivRank: IpcIvRank | null`.
- `src/renderer/src/api/positions.ts` — `PositionListItem.ivRank: ScreenerIvRank | null`, mapped through unchanged.

**Red — tests to write (`list-positions.test.ts`):**

- Seed a position on XYZ and an IVR snapshot observed at the previous session close; `listPositions(db, { now })` → `items[0].ivRank` equals `{ value: '62', observedAt, ageTradingDays: 1, state: 'fresh' }` (build the expected value with `assessIvRank` from the same inputs so the test does not restate the freshness rule).
- Two positions on the same ticker → both carry the same `ivRank` object shape; the snapshot statement runs once per distinct ticker (spy on `db.prepare` call count, or assert via a `logger.debug` mock on `ivr_assessment_read` receiving `tickers` de-duplicated).
- A position whose ticker has no snapshot → `ivRank: null`.
- A stored last print after the observation session → `state: 'predates_earnings'` (proves the store-only earnings read is wired).
- `readTradingCalendar` throws (mock the module) → every item has `ivRank: null`, the list is still returned in full, and `logger.warn` was called once with `positions_ivr_read_failed`.
- A wheel item is unchanged: snapshot the existing key list assertion and add exactly `ivRank`; sort order assertions from the existing suite still pass.
- `now` defaults to the current instant when the options bag is omitted (existing callers compile and pass).

**Green — implementation:**

- `ivRank` field on `PositionListItem` in `schemas.ts`; mirror in `preload/index.d.ts` and `api/positions.ts` per `contracts/positions-list.md`.
- `readIvrOrEmpty(db, tickers, now)` in `list-positions.ts`: `readTradingCalendar` → `readLastEarningsFromStore` → `getAssessedIvrByUnderlying`; `try/catch` → `logger.warn({ err, tickers }, 'positions_ivr_read_failed')` → `new Map()`.
- `listPositions(db, { now = new Date() } = {})`: collect distinct tickers from rows, call `readIvrOrEmpty`, set `ivRank: ivr.get(row.ticker.toUpperCase()) ?? null` on each item. DEBUG `positions_ivr_joined` with `{ tickers, hits }`.
- `positions:list` handler unchanged (`listPositions(db)`).

**Refactor — cleanup to consider:**

- `services/screener.ts` `readAssessedIvr` builds the same options bag from a calendar and an earnings map; if the two read identically after this lands, lift a `assessedIvrOptions(db, tickers, now, lastEarnings)` helper into `ivr-snapshots.ts`. Do not merge them if the screener's async earnings path makes the shapes differ.

**Acceptance criteria covered:**

- "Every position list item carries the underlying's IV rank; wheel cards are unchanged".
- "A failed IV-rank read leaves the dashboard intact" (n/a on every card, nothing else changes).

### 3. Out-of-band refresh reaches the positions list

**Files to create or modify:**

- `src/renderer/src/hooks/useIvrSnapshotUpdates.ts` — also invalidate `positionQueryKeys.all`.
- `src/renderer/src/hooks/useIvrSnapshotUpdates.test.ts` — extend.
- `src/renderer/src/pages/PositionsListPage.tsx` — mount `useIvrSnapshotUpdates()`.
- `src/renderer/src/pages/PositionsListPage.test.tsx` — one wiring test.

**Red — tests to write:**

- Firing the `onSnapshotUpdated` callback invalidates `['positions']` in addition to the two existing keys (assert all three `invalidateQueries` calls).
- Rendering `PositionsListPage` subscribes once via `window.api.ivr.onSnapshotUpdated` and unsubscribes on unmount.

**Green — implementation:**

- Add `positionQueryKeys.all` to the hook's effect; call the hook at the top of `PositionsListPage`.

**Refactor — cleanup to consider:**

- The hook's doc comment names the bench only; widen it to "every surface that renders IV rank".

**Acceptance criteria covered:**

- "A reading that lands out of band refreshes the card without a reload".

### 4. Pure IVR context module (renderer)

**Files to create or modify:**

- `src/renderer/src/lib/ivr-context.ts` — constants, `ivrZone`, `faceZoneLabel`, `SHORT_CALL_CONTEXT`, `LEAPS_CONTEXT`, `shortCallContext`, `leapsContext` per `data-model.md §4`.
- `src/renderer/src/lib/ivr-context.test.ts` — new.

**Red — tests to write:**

- `ivrZone`: `'29.9'` → `low`, `'30'` → `mid`, `'60'` → `mid`, `'60.1'` → `high`, `'0'` → `low`, `'100'` → `high`.
- `faceZoneLabel`: fresh `'62'` → `{ word: 'rich', tone: 'green' }`; fresh `'62'` with `earningsBeforeShortExpiry` → `{ word: 'rich', tone: 'gold' }` (the face takes the short-call context's tone); fresh `'45'` → `fair` / neutral; fresh `'22'` → `thin` / gold; aging → same as fresh; stale → `{ word: 'Stale', tone: 'muted' }`; expired → `Expired`; predates_earnings → `Predates earnings`; `null` → `n/a` muted; US-121 `value: null` → `n/a` muted.
- `shortCallContext` (fresh 62, hasShortCall, no earnings) → `RICH` green, text contains `roll up-and-out`.
- Fresh 62, `hasShortCall: false` → `RICH`, text contains `sell the next short call`.
- Fresh 62, `earningsBeforeShortExpiry: true`, `nextEarnings: '2026-11-18'` → `RICH · EVENT-DRIVEN` gold, text contains `2026-11-18`.
- Fresh 22 with / without a short call → `THIN` gold with the two texts from the registry table.
- Fresh 45 → `FAIR` neutral.
- `leapsContext`: fresh 62 → `PRICEY TO ROLL` gold, text contains `vega`; fresh 62 + `leapsInRollWindow` → `PRICEY · WINDOW OPEN`; fresh 22 → `CHEAP TO ROLL` green; fresh 22 + roll window → `ROLL NOW`; fresh 45 → `FAIR`; fresh 45 + roll window → `FAIR` (the window alone changes nothing).
- Both resolvers with stale / expired / predates_earnings / null / `value: null` → the unusable rows (status, muted tone, text) from `data-model.md §4`, identical between the two resolvers.
- Registry order: assert `SHORT_CALL_CONTEXT.map(r => r.status)` and `LEAPS_CONTEXT.map(r => r.status)` equal the documented order, so a reorder is a visible diff.

**Green — implementation:**

- `ivr-context.ts` exactly as `data-model.md §4`: `Decimal` compare for the zone, `isUsableIvrState` + `value !== null` gate, one `UNUSABLE` table shared by both resolvers, two ordered `ContextRule[]` registries resolved with `find`. No I/O, no React.

**Refactor — cleanup to consider:**

- Sentence strings live only in the registries; if `IvrContextCells` needs them elsewhere, export the registries, not copies. Check `tradingDaysLabel` is reused rather than re-implemented.

**Acceptance criteria covered:**

- "The short-call context reads the zone for the income leg", "The LEAPS context reads the same number the other way", "Zone edges", "The roll window sharpens the LEAPS reading", "An event-driven rich reading is qualified", "LEAPS only — the short-call context speaks to the next sale", "Only a usable reading gets a context sentence".

### 5. Face cell and tier-2 context cells on the PMCC card

**Files to create or modify:**

- `src/renderer/src/components/pmcc/IvrFaceCell.tsx` — new.
- `src/renderer/src/components/pmcc/IvrFaceCell.test.tsx` — new.
- `src/renderer/src/components/pmcc/IvrContextCells.tsx` — new.
- `src/renderer/src/components/pmcc/IvrContextCells.test.tsx` — new.
- `src/renderer/src/components/pmcc/PmccPositionCard.tsx` (US-108) — mount both; extend the Detail bar label.
- `src/renderer/src/components/pmcc/PmccPositionCard.test.tsx` (US-108) — extend.

**Red — tests to write:**

- `IvrFaceCell` with a fresh `'62'` renders `data-testid="pmcc-ivr-face"`, `data-zone="high"`, the `IvrCell` numeral `62`, a `freshness-ring[data-state="fresh"]`, and the sub-line `rich` with class `text-wb-green`.
- Fresh `'22'` → `data-zone="low"`, sub `thin` in `text-wb-gold`; fresh `'45'` → `fair` in `text-wb-text-secondary`.
- Aging `'62'`, age 2 → numeral reads `62 · 2d` (IvrCell's own age suffix), ring `aging`, sub still `rich`.
- Stale age 5 → numeral muted `62 · 5d`, ring `stale`, sub `Stale` muted, `data-zone="none"`.
- Expired → numeral `exp`; predates_earnings → ring `predates_earnings`, sub `Predates earnings`.
- `ivRank={null}` → `n/a`, `data-ivr-state="empty"`, sub `n/a`.
- `closed` → renders `—` with no ring and no sub-line.
- Hovering the numeral shows the existing `ivr-tooltip` with the tier title (reuse, not a new tooltip).
- `IvrContextCells` renders two cells with `data-testid="pmcc-ivr-context-short"` / `"-leaps"`, each showing the status word and sentence from the resolvers for: rich / fair / thin, rich + earnings (`RICH · EVENT-DRIVEN`, gold), thin + roll window (`ROLL NOW`, green), stale (`—` with the stale sentence in both), null (`n/a` in both).
- Status tone maps to `text-wb-green` / `text-wb-gold` / `text-wb-text-secondary` / `text-wb-text-muted`; no inline `style`.
- `PmccPositionCard` (US-108 suite) with the Background fixture and a fresh 62 reading: the face cell sits left of the price block; tier 2 opened shows the two new cells after `Entry net debit`; the Detail bar reads `Detail · breakeven · max if called · Δ · extrinsic · IV`.
- `PmccPositionCard` closed → no face cell content, no tier 2.
- The card passes `hasShortCall`, the ◆ boolean, the ⚑ boolean and `nextEarnings` it already computed into the context cells (assert with a rich reading + earnings fixture that the short cell reads `RICH · EVENT-DRIVEN` while the header shows ⚑ — one fixture, two assertions, so the predicate is provably shared).

**Green — implementation:**

- `IvrFaceCell({ ivRank, closed })`: a `flex flex-col` cell — eyebrow `IVR` in the card's eyebrow classes, `<IvrCell ivRank={ivRank} />`, sub-line from `faceZoneLabel` with `ZONE_TONE` → Tailwind class map. Mirrors the mockup's `IvrFace` (screen: card header, left of the `$104.20 / 14d to next decision` block).
- `IvrContextCells({ input })`: two of US-108's tier-2 cells (eyebrow / value / note), value = status word in tone class, note = sentence; mirrors the mockup's `ContextCells` (tier 2, after `Entry net debit`).
- In `PmccPositionCard`: place `IvrFaceCell` in the header before the price block; append the two cells to the tier-2 grid; extend the Detail bar copy. All Tailwind + `wb-*` tokens; the mockup's inline styles are viewer-only.

**Refactor — cleanup to consider:**

- If US-108's tier-2 cell is a local function, lift it to a `Tier2Cell` primitive so these cells and US-108's share it. Check the tone→class map is not duplicated between `IvrFaceCell` and `IvrContextCells` (one `TONE_CLASS` in `ivr-context.ts` consumers' shared module or in `IvrContextCells` re-exported).

**Acceptance criteria covered:**

- "The card face shows the underlying's IV rank with its freshness and a one-word read", "Tier 2 shows the two context readings", "Aging / stale / expired / predates-earnings readings look exactly as they do on the bench", "A closed PMCC shows no IVR", "The IVR tooltip is the existing freshness tooltip".

### 6. Wheel card regression guard

**Files to create or modify:**

- `src/renderer/src/pages/PositionsListPage.test.tsx` — one assertion.

**Red — tests to write:**

- A wheel item with `ivRank: { value: '62', state: 'fresh', … }` renders no `pmcc-ivr-face` and no `ivr-cell` anywhere in its card (US-88 owns that).

**Green — implementation:**

- Nothing beyond areas 2–5; the test pins the boundary.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- "Classic wheel cards are unchanged".

### 7. E2e Tests

**Files to create or modify:**

- `e2e/pmcc-card-ivr.spec.ts` — new; one `it()` per scenario, named verbatim.
- `e2e/ivr-helpers.ts` — reuse `setIvrNow`, `okOutcome`; add `seedIvrReading(app, ticker, { ivr, sessionsAgo })` if the staleness spec's inline pattern is not already a helper.
- `e2e/pmcc-helpers.ts` (US-108) — reuse its XYZ fixture seeding.

**Red — tests to write (each maps to exactly one Linear scenario):**

- `The card face shows the underlying's IV rank with its freshness and a one-word read` — seed fresh 62; assert `pmcc-ivr-face` numeral `62`, `freshness-ring[data-state="fresh"]`, sub `rich`; and, in the same test, a second card on a thin-fixture ticker reads `thin`, so a hard-coded `rich` cannot pass.
- `Tier 2 shows the two context readings` — open tier 2; short cell status `RICH`, LEAPS cell status `PRICEY TO ROLL` with the sentence containing `vega`.
- `The short-call context reads the zone for the income leg` — Outline over 62 / 45 / 22 → `RICH` / `FAIR` / `THIN`.
- `The LEAPS context reads the same number the other way` — Outline over 62 / 45 / 22 → `PRICEY TO ROLL` / `FAIR` / `CHEAP TO ROLL`, asserting the short cell in the same fixture reads the _opposite_ tone (green vs gold) so a shared-tone bug fails.
- `Zone edges` — Outline 29.9 / 30 / 60 / 60.1 → `thin` / `fair` / `fair` / `rich` on the face.
- `The roll window sharpens the LEAPS reading` — valuation 2027-07-20 fixture (LEAPS 59d, ◆ visible): 22 → `ROLL NOW`; 62 → `PRICEY · WINDOW OPEN`; assert ◆ is in the glyph row in the same test.
- `An event-driven rich reading is qualified` — valuation 2026-11-16, earnings 2026-11-18, 62 → short cell `RICH · EVENT-DRIVEN` gold with `2026-11-18` in the sentence and ⚑ in the glyph row; then earnings 2026-11-21 (after the short expires) → plain `RICH` and no ⚑.
- `LEAPS only — the short-call context speaks to the next sale` — US-108's leaps-only fixture, 62 → short cell `RICH` with `sell the next short call` in the sentence.
- `Only a usable reading gets a context sentence` — Outline: aging (2 sessions ago) → `RICH` still; stale (5) → both cells `—` with `5 trading days`; expired (12) → `—` and face `exp`; predates earnings (last print after the observation) → `—` with `predates` and a gold ring.
- `A PMCC with no IV rank collected reads n/a` — no outcome programmed → face `n/a`, `data-ivr-state="empty"`, both cells `n/a`, and Net P&L / cost basis unchanged from the US-108 Background values.
- `A reading that lands out of band refreshes the card without a reload` — start with none; program an outcome and trigger `ivr:collect-now` from Settings (or the on-add path); return to the dashboard without reload; face reads `62`.
- `A closed PMCC shows no IVR` — closed fixture → face `—`, no ring, no Detail bar.
- `The IVR tooltip is the existing freshness tooltip` — hover the face numeral → `ivr-tooltip` with `Fresh`.
- `Every position list item carries the underlying's IV rank; wheel cards are unchanged` — MSFT wheel with a programmed 62 → no `pmcc-ivr-face` / `ivr-cell` in the MSFT card, while the XYZ PMCC card shows `62`.
- `A failed IV-rank read leaves the dashboard intact` — boot with the calendar store empty and market-data credentials absent (the `market-facts-without-broker.spec.ts` pattern) → the PMCC card renders with face `n/a` and every other figure present.

**Green — implementation:**

- Nothing new; the spec drives the packaged app. Per the falsifiable-assertion rule, every Outline asserts two opposite fixtures where one could pass by accident.

**Refactor — cleanup to consider:**

- Fold any seeding helper added here into `ivr-helpers.ts` if `ivr-staleness.spec.ts` can share it.

**Acceptance criteria covered:**

- All fifteen Linear scenarios, one test each.

## AC Audit

| Linear scenario                                                                      | Unit/integration area | E2e test |
| ------------------------------------------------------------------------------------ | --------------------- | -------- |
| The card face shows the underlying's IV rank with its freshness and a one-word read  | 5                     | ✓        |
| Tier 2 shows the two context readings                                                | 4, 5                  | ✓        |
| The short-call context reads the zone for the income leg                             | 4                     | ✓        |
| The LEAPS context reads the same number the other way                                | 4                     | ✓        |
| Zone edges                                                                           | 4                     | ✓        |
| The roll window sharpens the LEAPS reading                                           | 4, 5                  | ✓        |
| An event-driven rich reading is qualified                                            | 4, 5                  | ✓        |
| LEAPS only — the short-call context speaks to the next sale                          | 4                     | ✓        |
| Only a usable reading gets a context sentence                                        | 4, 5                  | ✓        |
| A PMCC with no IV rank collected reads n/a                                           | 2, 5                  | ✓        |
| A reading that lands out of band refreshes the card without a reload                 | 3                     | ✓        |
| A closed PMCC shows no IVR                                                           | 5                     | ✓        |
| The IVR tooltip is the existing freshness tooltip                                    | 5                     | ✓        |
| Every position list item carries the underlying's IV rank; wheel cards are unchanged | 2, 6                  | ✓        |
| A failed IV-rank read leaves the dashboard intact                                    | 2                     | ✓        |
