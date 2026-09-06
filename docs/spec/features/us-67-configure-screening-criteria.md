# US-67: Configure screening criteria

<!-- generated:from us-67, us-97 -->

## Summary

US-67 makes the screener's criteria editable — delta band, DTE window, liquidity gates, price
ceiling, IV-rank floor, and earnings policy — from a right-hand sheet on the
[Screener page](us-66-screener-results.md) itself, persisted in `app_settings` and read by the
[US-65 engine](us-65-score-wheel-candidates.md) on every screen.

It closes two gaps at once. `screenWatchlistCandidates` always fell back to
`DEFAULT_SCREENING_CRITERIA` because nothing ever supplied `opts.criteria`, and the engine had no
IV-rank floor at all. This story fills the first seam and adds the second filter.

**Criteria editing lives on the Screener, not in Settings.** Tuning a filter is an act of reading
results — you widen a delta band _because_ the list came back empty, or tighten it _because_ rank 1
is closer to the money than you want. A nav hop to Settings breaks that loop. So the primary action
is **Save & re-screen**: persist, close the sheet, and refresh the table underneath. Settings keeps
broker credentials and alert defaults and never gains a screening section.

Three entry points open one sheet — the `⚙ Criteria` header button, a clickable criteria summary
strip above the results, and the empty card's **Adjust criteria** action, which also retires US-66's
dangling "in Screener settings" copy.

Earnings handling is persisted here but **applied in US-70**: the screener passes
`earningsDate: null`, so the enum cannot change any outcome yet.

## Acceptance criteria

_Background: persisted criteria are delta band 0.20–0.30, DTE window 30–45, minimum open interest
500, max spread 10%, price ceiling off, IV-rank floor off, earnings "Exclude"._

- **Open the criteria sheet from the page header** — every field pre-filled from the persisted
  criteria, and the sidebar navigation stays visible and clickable.
- **Open the criteria sheet from the criteria summary strip** — the strip reads
  `Δ 0.20–0.30 · DTE 30–45 · OI ≥ 500 · Spread ≤ 10% · Earnings Exclude`.
- **Open the criteria sheet from the empty state** — the empty card offers **Adjust criteria**, and
  the trader is not navigated away.
- **Save new screening criteria and re-screen** — setting the band to 0.15–0.20 and the window to
  40–45 persists, closes the sheet, refreshes the results, shows `Screening criteria saved`, and
  updates the strip.
- **Saved criteria survive a restart.**
- **Toggle earnings handling between exclude and flag** — persisted as `flag`, strip reads
  `Earnings Flag only`, reopened sheet shows the selection. _What the screener does with that choice
  is US-70._
- **Reject an inverted delta band** — `Minimum delta must be less than maximum delta`, save disabled.
- **Reject an inverted DTE window** — `Minimum DTE must be less than maximum DTE`, save disabled.
- **Reject out-of-range criteria** — max delta `1.5` → `Delta must be between 0.01 and 0.99`;
  minimum DTE `0` → `DTE must be at least 1`; minimum open interest `-100` →
  `Open interest floor cannot be negative`; max spread `0` → `Max spread must be between 1% and 50%`.
  Nothing is saved and the results behind the sheet are unchanged.
- **IV-rank floor is optional and off by default** — enabling it at 30 drops candidates below IVR 30.
- **Price ceiling is optional and off by default** — enabling it at $75 drops underlyings above $75.
- **Dismissing the sheet discards unsaved edits** — Cancel, the close button, and the scrim all
  discard; the persisted criteria and the results are untouched.
- **Reset to defaults** — every field returns to its shipped default; nothing persists until save.
- **Settings does not own screening criteria** — no section there; alert defaults and broker
  credentials unchanged.

## What was built

**Shared bounds module.** `src/main/core/screening-criteria.ts` is a pure module — zero imports —
holding nine bounds, the nine validation messages built from them by template literal, and seven
predicates (`isDeltaInRange`, `isDteInRange`, `isOpenInterestInRange`, `isSpreadPercentInRange`,
`isPriceCeilingInRange`, `isIvRankFloorInRange`, `isSpreadAbsoluteInRange`, plus `isAscending` for
the two bands). It is imported by all three validation layers, mirroring
[`alert-thresholds.ts`](us-57-58-configurable-alert-thresholds.md). Every message string is pinned
verbatim by an e2e test, so a second copy anywhere is guaranteed drift.

**IV-rank floor in the engine.** `ScreeningCriteria` gains `minIvRank: string | null`,
`ExclusionCode` gains `'iv_rank_floor'`, `FilterInput` gains `ivRank`, and a new `FILTERS` entry
sits immediately after `price_ceiling`. Its reason string is `IV rank 22.0 (Aug 7) below 30` —
the stored 1dp value rendered verbatim, stamped with the day the reading was taken so a
candidate dropped on a stale snapshot says so.

**Persistence service.** `src/main/services/screening-criteria.ts` reads and writes one
`app_settings` row. `getScreeningCriteria` never throws and never returns a partial object;
`saveScreeningCriteria` validates before its single write and returns the persisted document read
back, so the renderer can never display something that was not stored. One line changes in
`services/screener.ts`: `opts.criteria ?? getScreeningCriteria(db)`.

**IPC and renderer data access.** Two thin handlers on the existing `registerScreenerIpc({ db,
getProvider })`, a `SaveScreeningCriteriaPayloadSchema` in `schemas.ts`, preload methods, and an
adapter plus `useScreeningCriteria` / `useSaveScreeningCriteria` hooks whose save invalidates both
`screenerQueryKeys.criteria` and `.results`.

**The sheet.** `ScreeningCriteriaSheet` is the portal/overlay wrapper; `ScreeningCriteriaForm` holds
the React Hook Form + `zodResolver` body at `mode: 'onChange'`, with `RangeField` and
`OptionalNumericField` extracted for the twice-repeated paired-min/max and Off/On-plus-input
controls. Four divider-separated groups — Filters (hard), Liquidity (hard gate), Ranking inputs
(soft), Policy — on a 460px `SheetPanel`. The footer's **Save & re-screen** is gated on
`formState.isValid`, and **Reset to defaults** is replaced by "Fix the highlighted fields." while
invalid.

**Summary strip and page wiring.** `fmtCriteriaSummary` owns the chip wording (the formatter) and
`ScreenerCriteriaStrip` owns the markup (the component). `ScreenerPage` gains the header button, the
strip, the sheet, a saved banner raised only by the sheet's `onSaved`, and the new empty-card copy.

**End-to-end verification.** `e2e/screening-criteria.spec.ts` runs one scenario per AC against the
packaged app. Every criteria write goes through the real sheet or the real `screener:save-criteria`
IPC — never a direct `app_settings` write.

## Architecture decisions

### Criteria persist as one JSON document, not nine scalar rows

- **Decision:** One `app_settings` key, `screening_criteria`, holding a JSON document, read back
  through a Zod schema whose every field carries `.default()` from `DEFAULT_SCREENING_CRITERIA`.
- **Why:** `appSettings.set` writes one key per call and is not transactional, so nine sequential
  writes can half-apply — leaving the screener running a delta band from one save and a DTE window
  from another, which is worse than either save losing entirely. The criteria are one cohesive
  object: they travel together, are validated by one schema on both sides of IPC, and reach the
  engine as one value.
- **Rejected:** one key per field (the partial-write hazard; the `alert-defaults.ts` precedent covers
  two scalars where atomicity does not matter); a dedicated table (a migration for an
  always-one-row record).

### The IV-rank floor never excludes an unknown IV rank

- **Decision:** `applies` requires **both** `criteria.minIvRank !== null` **and**
  `ctx.ivRank !== null`. The floor is inclusive — `test` uses `.lt`, so a reading exactly at the
  floor survives.
- **Why:** Letting an unknown IVR fail a floor it was never measured against would contradict the
  standing US-65 criterion "Missing IV rank does not exclude a candidate" and would silently empty
  results whenever the scrape lags. `applies`-returns-false is the same escape hatch
  `price_ceiling` already uses for a missing underlying price.
- **Rejected:** treating unknown IVR as failing (converts a data gap into a trading verdict); folding
  IV rank into `yieldPerDelta` (the AC says candidates "drop out", and it would re-weight every
  existing ranking); placing the filter after `delta_band` (IV rank is a property of the underlying,
  not the strike).

### Registry position is load-bearing

- **Decision:** `iv_rank_floor` sits immediately after `price_ceiling`, giving the order
  `price_ceiling → iv_rank_floor → earnings_in_window → dte_window → delta_unavailable → delta_band
→ open_interest → spread`.
- **Why:** `FilterFailure.index` is how far a strike got through the funnel, and
  `representativeExclusion` picks `excluded[0]` as a ticker's headline reason. Whole-ticker
  disqualifiers come before per-strike ones.

### The service resolves persisted criteria; the handler stays payload-free

- **Decision:** `screenWatchlistCandidates` defaults to `opts.criteria ?? getScreeningCriteria(db)`.
  `screener:results` keeps its no-payload signature.
- **Why:** The thin-IPC-handler rule forbids reading settings and branching in a handler. Resolving
  inside the service means every caller — the handler today, the US-68 promote pre-fill tomorrow —
  gets the trader's criteria automatically, instead of each remembering to fetch and pass them.
- **Rejected:** the handler fetching and passing criteria (business logic in a handler); a `criteria`
  field on the request (makes the renderer the authority on what the engine screens with).

### Cross-field band rules live in the service, not in the Zod payload schema

- **Decision:** The two inversion rules are raised by `saveScreeningCriteria` as
  `ValidationError('deltaMax' | 'dteMax', 'inverted_band', …)`, not by a `.superRefine`.
- **Why:** Zod v4 restricts `ctx.addIssue({ code })` to its own issue codes, and `handleIpcCall` maps
  a Zod issue's `code` verbatim — so a `.superRefine` could only ever reach the renderer as
  `code: 'custom'`, while the contract pins `inverted_band`. Per-field bounds run first, so a band is
  only called inverted once both of its ends are legal.
- **Rejected:** teaching `handleIpcCall` to prefer `issue.params.code` — it changes shared IPC
  infrastructure used by every channel.

### An IV rank is displayed with the day it was observed

- **Decision:** Both surfaces that show an IV rank stamp its observation date in `MMM d` form — the
  screener's IVR column (`44 (Aug 7)`) and the `iv_rank_floor` exclusion reason
  (`IV rank 22.0 (Aug 7) below 30`).
- **Why:** `IvRank` has always carried `observedAt` so a caller could judge whether a reading is
  still worth acting on, but nothing displayed it — fine while IV rank was a display-only ranking
  input, not once this story made it a hard filter. `getLatestIvrByUnderlying` applies no recency
  bound, so a months-old snapshot could silently drop a candidate. Showing the date makes the age
  visible without enforcing a threshold the story never defined.
- **Rejected:** a hover tooltip (a staleness signal invisible until hovered, and to keyboard users);
  tinting past a staleness cutoff (invents a threshold, and a wrong one silently re-filters results).

### Bound predicates fail closed against `decimal.js`

- **Decision:** `parseNumeric` matches strings against a strict decimal pattern rather than trimming,
  establishing the invariant _if a predicate returns true, `new Decimal(value)` cannot throw_.
- **Why:** `decimal.js` is stricter than `Number` and throws on padded input like `' 0.20'`. A padded
  value that passed `Number` could be persisted, then throw during render of the summary strip —
  and there is no React error boundary in the renderer, so the app would blank — while in the engine
  it would degrade every ticker to `data_unavailable`. Rejecting rather than normalising means
  nothing the trader did not type reaches the database.
- **Rejected:** trimming (persists a value the trader did not type); normalising only in `toPayload`
  (leaves the direct-IPC path open).

### The read path falls back wholesale, never field-by-field

- **Decision:** Absent row, unparseable JSON, schema mismatch, **or** a band that fails `isAscending`
  after a successful parse all return the whole `DEFAULT_SCREENING_CRITERIA`.
- **Why:** A half-defaulted band is not a band the trader ever chose. The per-field `.default()`s
  that make an added field non-breaking are applied independently, so a document holding one end of a
  band and missing the other would otherwise parse cleanly into an inverted band the write path
  would have rejected — and the engine would exclude every strike with reasons that look correct.
  `maxSpreadAbsolute` carries a bound check too, despite being uneditable, because a stored value
  reaches the engine's `Decimal` comparison unguarded.

### Save & re-screen invalidates both queries

- **Decision:** The save mutation's `onSuccess` invalidates `screenerQueryKeys.criteria` **and**
  `.results`. No criteria key is added to `settingsQueryKeys`.
- **Why:** Invalidating `results` is what refreshes the table behind the sheet — the behavioural
  payoff of moving the form onto the Screener. Invalidating `criteria` keeps the strip and a reopened
  sheet showing what was actually persisted.
- **Rejected:** `setQueryData` with the mutation result (`results` must be refetched from the
  provider regardless); putting criteria under `settingsQueryKeys` (re-couples them to the surface
  the story is moving them off).

### `maxSpreadAbsolute` is persisted but not editable

- **Decision:** The save payload is `Omit<ScreeningCriteria, 'maxSpreadAbsolute'>`; the service
  supplies the field from the defaults.
- **Why:** The mockup exposes no input for it — it appears only as caption text on the Max bid-ask
  spread field. A payload field with no control is a field the renderer must invent a value for.
- **Rejected:** round-tripping it as a hidden form value (a renderer bug could write a spread
  tolerance the trader never chose and cannot see).

### The sheet is a 460px `SheetPanel`, not a new overlay primitive

- **Decision:** Built from the existing `SheetOverlay` / `SheetPanel` / `SheetHeader` / `SheetBody` /
  `SheetFooter`, portalled via `getSheetPortal()`.
- **Why:** `SheetPanel` already takes a `width` prop defaulting to 400, and `SheetOverlay` is already
  `left-[200px]` — which satisfies "the sidebar navigation remains visible and clickable" for free,
  the same reason four existing sheets sit on it.

### Dismissal discards by unmounting

- **Decision:** The sheet returns `null` when closed, so the form unmounts and re-seeds from
  `defaultValues` on the next open.
- **Why:** The unmount _is_ the discard mechanism — there is no `reset` call to forget, and no
  confirmation prompt, consistent with every existing sheet.

### The criteria query distinguishes four states, not two

- **Decision:** Entry points are gated on `isCriteriaError && criteria === undefined`, not on
  `isError` alone.
- **Why:** TanStack keeps the last successful `data` when a _later_ fetch fails, and the client
  refetches on window focus. Reading the flag alone would disable all three entry points — and claim
  the criteria were unloadable — while the trader is looking at a fully populated summary strip.
  Pending is excluded too: there is nothing to open yet, but the criteria are on their way, so a
  click made while pending is honoured once they land.

### Earnings handling is persisted here and applied in US-70

- **Decision:** US-67 ships the Exclude / Flag-only control and persists the enum; it wires no
  earnings calendar and renders no warning.
- **Why:** `services/screener.ts` passes `earningsDate: null` unconditionally, so the enum cannot
  change any outcome. Making it change one is the entirety of US-70, whose ACs already cover exclude,
  flag-with-warning, unknown-date caution, and calendar outage. The story's earnings AC was narrowed
  to persistence before planning, by the story owner.

## Contracts touched

**Two added**, both on the existing `registerScreenerIpc({ db, getProvider })` — see
[IPC handlers](../contracts/ipc-handlers.md):

- **`screener:get-criteria`** — no payload; returns `{ ok: true, criteria }`. Never absent and never
  partial: an unsaved, missing, or corrupt row resolves to the shipped defaults, so
  `__root__` / `internal_error` is the only realistic error row.
- **`screener:save-criteria`** — payload per `SaveScreeningCriteriaPayloadSchema` (omits
  `maxSpreadAbsolute`); returns the full stored document. A rejected payload persists nothing,
  because validation runs before the single `appSettings.set`.

Note on error codes: per-field bounds are enforced at both the Zod boundary and in the service.
Because Zod parses first, a bound caught at the boundary surfaces as `code: 'custom'` rather than the
`out_of_range` the contract tabulates; the two `inverted_band` rows are service-only and always carry
that exact code. `field` and `message` are identical on both paths, and the sheet binds errors by
`field`.

The sheet also introduces a **DOM contract** the e2e suite binds to: `screener-criteria-strip`,
`sheet-scrim`, the segment testids `price-ceiling-off|on` / `iv-rank-floor-off|on` /
`earnings-exclude|flag`, and the field `aria-label`s (`Minimum delta`, `Maximum delta`,
`Minimum DTE`, `Maximum DTE`, `Minimum open interest`, `Max bid-ask spread`, `Price ceiling`,
`IV-rank floor`). Inputs are `type="text"`, never `type="number"`, so an in-progress `0.` is typeable.

## Schema

**No migration.** One new key in the existing `app_settings` table — see
[Tables](../schema/tables.md).

| Field                | Type                  | Default     | Editable in the sheet            |
| -------------------- | --------------------- | ----------- | -------------------------------- |
| `deltaMin`           | `string`              | `'0.20'`    | yes                              |
| `deltaMax`           | `string`              | `'0.30'`    | yes                              |
| `dteMin`             | `number`              | `30`        | yes                              |
| `dteMax`             | `number`              | `45`        | yes                              |
| `minOpenInterest`    | `number`              | `500`       | yes                              |
| `maxSpreadPercent`   | `string`              | `'10'`      | yes                              |
| `maxSpreadAbsolute`  | `string`              | `'0.10'`    | **no** — persisted, never edited |
| `maxUnderlyingPrice` | `string \| null`      | `null`      | yes (Off/On)                     |
| `minIvRank`          | `string \| null`      | `null`      | yes (Off/On) — **new in US-67**  |
| `earningsHandling`   | `'exclude' \| 'flag'` | `'exclude'` | yes                              |

Both optionals default to **disabled** deliberately: a fixed dollar ceiling is a per-account
buying-power preference that would silently hide large-cap optionable names, and a low IV-rank floor
would empty results in a low-vol regime.

## Source files

- `src/main/core/screening-criteria.ts` — bounds, messages, predicates (pure, zero imports)
- `src/main/core/screener.ts` — `minIvRank`, `iv_rank_floor`, `FilterInput.ivRank`
- `src/main/services/screening-criteria.ts` — read/write paths
- `src/main/services/screener.ts` — resolves persisted criteria
- `src/main/schemas.ts` — `SaveScreeningCriteriaPayloadSchema`
- `src/main/ipc/screener.ts` — the two handlers
- `src/preload/index.ts` · `src/preload/index.d.ts`
- `src/renderer/src/api/screening-criteria.ts` · `src/renderer/src/api/screener.ts`
- `src/renderer/src/hooks/screenerQueryKeys.ts` · `src/renderer/src/hooks/useScreeningCriteria.ts`
- `src/renderer/src/schemas/screening-criteria.ts` — form schema, `toFormValues` / `toPayload`
- `src/renderer/src/components/ScreeningCriteriaSheet.tsx` · `ScreeningCriteriaForm.tsx`
- `src/renderer/src/components/ScreenerCriteriaStrip.tsx` · `ScreenerStateCard.tsx` · `ui/Sheet.tsx`
- `src/renderer/src/lib/screener-format.ts` — `fmtCriteriaSummary`
- `src/renderer/src/pages/ScreenerPage.tsx`
- `e2e/screening-criteria.spec.ts` — 14 scenarios, one per acceptance criterion
- `e2e/screener-helpers.ts` — `PEP_PUT` (IVR 22), `SBUX_PUT`, stock-quote fixtures, sheet helpers,
  `relaunchScreener`

## Related

- [US-65 — Score wheel candidates](us-65-score-wheel-candidates.md) — the engine these criteria drive
- [US-66 — Display ranked screener results](us-66-screener-results.md) — the page hosting the sheet
- [US-57/58 — Configurable alert thresholds](us-57-58-configurable-alert-thresholds.md) — the
  shared-bounds-module pattern this follows
- [IPC handlers](../contracts/ipc-handlers.md) · [Tables](../schema/tables.md) ·
  [Design system](../architecture/03-design-system.md)

## Update: the IV-rank floor now applies to bench names (US-97)

<!-- from us-97 -->

`iv_rank_floor` applies only when a reading exists (`ctx.ivRank !== null`) — an unknown IV rank is
a gap in the data, not a low reading, so it passes. Until
[US-97](./us-97-collect-ivr-for-watchlist-underlyings.md), IVR was collected only for open-position
underlyings, so a watchlist-only candidate _always_ read `null` and the floor could never exclude it
in practice. Now that collection covers the watchlist, a bench name with a thin IVR does drop out of
the ranked list when the floor is enabled — the intended behaviour, and covered by a US-97
acceptance criterion. The guard itself is unchanged.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
