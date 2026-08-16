---
story: us-67
kind: feature
parent: null
topics: [screener, market-data]
status: planned
---

# Implementation Plan: US-67 — Configure screening criteria

## Summary

Make the screener's criteria editable from a right-hand sheet on the Screener page itself, persisted in `app_settings` and read by the scoring engine on every screen. Today `screenWatchlistCandidates` always falls back to `DEFAULT_SCREENING_CRITERIA` because nothing ever passes `opts.criteria`, and the engine has no IV-rank floor at all; this story closes both gaps and adds the sheet, a clickable criteria summary strip, and the `⚙ Criteria` header button. Done means: saving from the sheet persists the criteria, closes the sheet, re-screens the table underneath, updates the summary strip, and survives a restart — with Settings never gaining a screening-criteria section.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** `docs/epics/08-stories/US-67-configure-screening-defaults.md`
- **Research & Design Decisions:** `plans/us-67/research.md`
- **Data Model & Validation Rules:** `plans/us-67/data-model.md`
- **API Contracts:** `plans/us-67/contracts/screener-get-criteria.md`, `plans/us-67/contracts/screener-save-criteria.md`
- **Quickstart & Verification:** `plans/us-67/quickstart.md`
- **Mockup:** `mockups/us-67-screening-criteria-sheet.mdx` — states `entry`, `default`, `invalid`, `optional`, `saved`. (`mockups/us-67-screening-defaults.mdx` is the superseded Settings-page placement — do not build it.)

## Prerequisites

All infrastructure exists:

- `app_settings` key/value table and `appSettings.get`/`set` (`src/main/services/app-settings.ts`) — **no migration**
- The pure screening engine, `ScreeningCriteria`, and the ordered `FILTERS` registry (`src/main/core/screener.ts`)
- The `opts.criteria` seam on `screenWatchlistCandidates` (`src/main/services/screener.ts:216`), currently never supplied
- Sheet primitives with a `width` prop and a `left-[200px]` overlay (`src/renderer/src/components/ui/Sheet.tsx`), `getSheetPortal()`
- The shared-bounds-module pattern to copy: `src/main/core/alert-thresholds.ts` → `src/main/schemas.ts` + `src/main/services/alert-defaults.ts` + `src/renderer/src/schemas/alert-thresholds.ts`
- E2E fake seams `WHEELBASE_MOCK_OPTION_SNAPSHOTS`, `WHEELBASE_MOCK_STOCK_QUOTES`, `WHEELBASE_FAKE_IVR`, and the `launchScreener` helper

**Out of scope by decision (see research ADR):** wiring an earnings calendar into the screener and rendering an earnings warning. US-67 persists `earningsHandling`; US-70 applies it.

---

## Implementation Areas

### 1. Screening-criteria bounds module

**Files to create or modify:**

- `src/main/core/screening-criteria.ts` — new; pure constants, messages, and predicates. No imports beyond `decimal.js`. Modelled on `src/main/core/alert-thresholds.ts`, including its header comment about keeping every validation layer in lockstep.
- `src/main/core/screening-criteria.test.ts` — new.

**Red — tests to write** (`src/main/core/screening-criteria.test.ts`):

- `isDeltaInRange` returns true at both bounds `'0.01'` and `'0.99'`, false at `'0'`, `'1'`, `'1.5'`
- `isDteInRange` returns true for `1` and `365`, false for `0`, `366`, and non-integers like `30.5`
- `isOpenInterestInRange` returns true for `0` and `500`, false for `-1` and `-100`
- `isSpreadPercentInRange` returns true for `'1'` and `'50'`, false for `'0'` and `'51'`
- `isPriceCeilingInRange` returns true for `'75'`, false for `'0'` and `'-5'`
- `isIvRankFloorInRange` returns true for `'0'`, `'30'`, `'100'`, false for `'-1'` and `'101'`
- `isAscending('0.20', '0.30')` is true; `isAscending('0.30', '0.20')` and `isAscending('0.20', '0.20')` are both false (strict, so a collapsed band fails)
- Each exported message constant equals its AC string exactly: `Delta must be between 0.01 and 0.99`, `DTE must be at least 1`, `DTE must be at most 365`, `Open interest floor cannot be negative`, `Max spread must be between 1% and 50%`, `Price ceiling must be greater than zero`, `IV rank floor must be between 0 and 100`, `Minimum delta must be less than maximum delta`, `Minimum DTE must be less than maximum DTE`
- Every numeric predicate returns false for a non-numeric string (`'abc'`, `''`) rather than throwing — the renderer calls these mid-typing

**Green — implementation:**

- Export bounds: `DELTA_MIN = 0.01`, `DELTA_MAX = 0.99`, `DTE_MIN = 1`, `DTE_MAX = 365`, `OPEN_INTEREST_MIN = 0`, `SPREAD_PERCENT_MIN = 1`, `SPREAD_PERCENT_MAX = 50`, `IV_RANK_MIN = 0`, `IV_RANK_MAX = 100`
- Export the nine message constants listed above, built from the bounds by template literal so a bound change moves the message with it
- Export predicates `isDeltaInRange`, `isDteInRange`, `isOpenInterestInRange`, `isSpreadPercentInRange`, `isPriceCeilingInRange`, `isIvRankFloorInRange`, `isAscending` — each taking the string-or-number form the caller holds and returning false (never throwing) on unparseable input

**Refactor — cleanup to consider:**

- The numeric predicates share a "parse, guard non-finite, compare" shape — collapse into one small local helper only if the named exports stay individually readable at the call sites. Check for duplication and naming consistency against `alert-thresholds.ts`.

**Acceptance criteria covered:**

- Supports "Reject out-of-range criteria", "Reject an inverted delta band", "Reject an inverted DTE window" — the message strings all three ACs pin originate here.

---

### 2. IV-rank floor in the pure engine

**Files to create or modify:**

- `src/main/core/screener.ts` — add `minIvRank: string | null` to `ScreeningCriteria`; add `minIvRank: null` to `DEFAULT_SCREENING_CRITERIA`; add `'iv_rank_floor'` to `ExclusionCode`; add `ivRank: IvRank | null` to `FilterInput`; add the `iv_rank_floor` entry to `FILTERS` immediately after `price_ceiling`; pass `input.ivRank` through `judgeStrike`.
- `src/main/core/screener.test.ts` — extend.

**Red — tests to write** (`src/main/core/screener.test.ts`):

- With `minIvRank: '30'` and a strike whose ticker has `ivRank.value = '22'`, `evaluateFilters` returns `{ code: 'iv_rank_floor' }` with reason `IV rank 22.0 below 30`
- With `minIvRank: '30'` and `ivRank.value = '38'`, the strike is not excluded for IV rank
- With `minIvRank: '30'` and `ivRank: null` (unknown), the strike is **not** excluded — the standing US-65 rule that a missing IV rank never excludes
- With `minIvRank: null` (the default) and `ivRank.value = '5'`, the strike is not excluded
- Boundary: `ivRank.value` exactly equal to the floor passes (the floor is inclusive — `lt`, not `lte`)
- `screenTicker` with the floor on drops the low-IVR ticker out of `ranked` and into `excluded`, and the surviving high-IVR ticker still scores
- Registry order: given a strike that breaches both `iv_rank_floor` and `delta_band`, the reported failure is `iv_rank_floor` (ticker-level disqualifiers win, and `index` is lower)
- `DEFAULT_SCREENING_CRITERIA.minIvRank` is `null`

**Green — implementation:**

- `FILTERS` entry, positioned after `price_ceiling` per `data-model.md`:
  - `applies: (ctx, criteria) => criteria.minIvRank !== null && ctx.ivRank !== null`
  - `test: (ctx, criteria) => new Decimal(ctx.ivRank!.value).lt(criteria.minIvRank!)`
  - `reason: (ctx, criteria) => \`IV rank ${ctx.ivRank!.value} below ${criteria.minIvRank}\``
- Thread `ivRank` into `FilterInput` and the `judgeStrike` call site alongside `underlyingPrice` and `earningsDate` — `screenTicker` already holds `input.ivRank` for the scorer.

**Refactor — cleanup to consider:**

- Confirm the reason string follows the registry's existing formatting conventions (the `formatBand` / `formatPercent` / `formatMoney` helpers) rather than inventing a tenth shape. IV rank is stored at 1dp, so it renders as-is — verify no extra formatter is warranted.
- No logging: `src/main/core/` is pure.

**Acceptance criteria covered:**

- "IV-rank floor is optional and off by default … when the trader enables the floor at 30, candidates below IVR 30 drop out of the ranked list"

---

### 3. Screening-criteria persistence service

**Files to create or modify:**

- `src/main/services/screening-criteria.ts` — new; `getScreeningCriteria(db)` and `saveScreeningCriteria(db, input)`.
- `src/main/services/screening-criteria.test.ts` — new.
- `src/main/services/screener.ts` — change line 216 from `opts.criteria ?? DEFAULT_SCREENING_CRITERIA` to `opts.criteria ?? getScreeningCriteria(db)`.
- `src/main/services/screener.test.ts` — extend.

**Red — tests to write** (`src/main/services/screening-criteria.test.ts`, against an in-memory migrated DB):

- `getScreeningCriteria` on an empty DB returns `DEFAULT_SCREENING_CRITERIA` exactly
- Save-then-get round-trips every field, including `maxUnderlyingPrice: '75'`, `minIvRank: '30'`, and `earningsHandling: 'flag'`
- `saveScreeningCriteria` returns the persisted document (read back), not its input argument
- `saveScreeningCriteria` fills `maxSpreadAbsolute` from `DEFAULT_SCREENING_CRITERIA` even though the payload omits it
- A corrupt stored row (`appSettings.set(db, 'screening_criteria', 'not json')`) makes `getScreeningCriteria` return the defaults rather than throw
- A stored document missing `minIvRank` (written before the field existed) reads back with `minIvRank: null`
- A stored document with a present-but-invalid field (`dteMin: 0`) falls back to the **whole** defaults object, not a half-merged one
- Each per-field bound violation throws `ValidationError` carrying the exact field, code, and message from `contracts/screener-save-criteria.md` — one test per row of that table
- An inverted delta band throws `ValidationError('deltaMax', 'inverted_band', 'Minimum delta must be less than maximum delta')`; an inverted DTE window throws the DTE equivalent
- A rejected save leaves the previously stored document untouched (save valid → attempt invalid → get returns the first document)

**Red — tests to write** (`src/main/services/screener.test.ts`):

- `screenWatchlistCandidates` with no `opts.criteria` uses the **persisted** criteria: save a `0.15–0.20` band, then assert a `0.28`-delta strike lands in `excluded` with reason `delta 0.28 outside 0.15–0.20`
- With nothing persisted, it still uses `DEFAULT_SCREENING_CRITERIA` (regression guard for US-65)
- An explicit `opts.criteria` still overrides the persisted value (the seam US-68 will use)
- The persisted `dteMin`/`dteMax` reach `pullWatchlistChains` as its `window` — assert the chain pull is called with the saved window, since the chain query is bounded by it

**Green — implementation:**

- `SCREENING_CRITERIA_KEY = 'screening_criteria'`
- A Zod `StoredScreeningCriteriaSchema` with `.default()` on every field sourced from `DEFAULT_SCREENING_CRITERIA`, used only for the read path's forward-compatible parse
- `getScreeningCriteria` per the four-step read path in `data-model.md`, logging `screening_criteria_unreadable` at WARN on both the JSON and the Zod failure
- `saveScreeningCriteria` per the five-step write path in `data-model.md`, throwing `ValidationError` (from `src/main/core/lifecycle.ts`) on the first failure and logging `screening_criteria_saved` at INFO
- Validation uses the predicates and messages from `src/main/core/screening-criteria.ts` — no bounds literals in this file
- One-line change in `src/main/services/screener.ts`; its existing `logger.debug({ tickers, criteria }, 'screen_watchlist_candidates_request')` already logs the resolved criteria

**Refactor — cleanup to consider:**

- The per-field validation is nine near-identical `if (!predicate(v)) throw new ValidationError(...)` blocks. Consider a small table of `{ field, code, message, valid }` rows iterated once — but only if it reads better than the explicit blocks; `alert-defaults.ts` keeps them explicit at two fields, and nine may cross the line. Judge on the written code.
- Check that the read-path fallback and the write-path compose do not both hardcode `DEFAULT_SCREENING_CRITERIA` in a way that could drift.

**Acceptance criteria covered:**

- "the criteria are persisted", "Saved criteria survive a restart", "no criteria are saved / the results behind the sheet are unchanged", "the results refresh, filtered to 0.15–0.20 delta and 40–45 DTE", and the persistence half of the earnings toggle.

---

### 4. IPC contract, payload schema, handlers, and preload

**Files to create or modify:**

- `src/main/schemas.ts` — add `SaveScreeningCriteriaPayloadSchema` and its inferred type.
- `src/main/ipc/screener.ts` — register `screener:get-criteria` and `screener:save-criteria`.
- `src/main/ipc/screener.test.ts` — extend.
- `src/preload/index.ts` — add `getCriteria` / `saveCriteria` to the `screener` block.
- `src/preload/index.d.ts` — add `IpcScreeningCriteria`, `IpcScreeningCriteriaResult`, and the two method signatures.

**Red — tests to write** (`src/main/ipc/screener.test.ts`):

- `screener:get-criteria` returns `{ ok: true, criteria }` with the defaults on a fresh DB
- `screener:save-criteria` with a valid payload returns `{ ok: true, criteria }` reflecting the saved values
- `screener:save-criteria` with an inverted delta band returns `{ ok: false, errors: [{ field: 'deltaMax', code: 'inverted_band', message: 'Minimum delta must be less than maximum delta' }] }`
- `screener:save-criteria` with `deltaMax: '1.5'` returns an `ok: false` envelope whose error field is `deltaMax` and message is `Delta must be between 0.01 and 0.99` — proving Zod rejects at the boundary before the service runs
- `screener:save-criteria` with a payload missing `earningsHandling` returns an `ok: false` envelope, never throws to the renderer
- Neither handler throws: an internal failure surfaces as `__root__` / `internal_error`

**Green — implementation:**

- `SaveScreeningCriteriaPayloadSchema` in `src/main/schemas.ts`, shaped exactly as `contracts/screener-save-criteria.md`. String fields validate with `.refine(...)` against the predicates from `src/main/core/screening-criteria.ts`, passing the shared message constants; `dteMin`/`dteMax`/`minOpenInterest` use `z.number().int()` with the same shared messages; `maxUnderlyingPrice` and `minIvRank` are `.nullable()` with the refine applied only to non-null values; `earningsHandling` is `z.enum(['exclude', 'flag'])`. Two `.superRefine` cross-field rules attach `inverted_band` errors to `deltaMax` and `dteMax`.
- Both handlers stay thin — Zod parse plus a single service call inside `handleIpcCall`, matching the existing `settings:get-alert-defaults` / `settings:save-alert-defaults` pair:
  - `ipcMain.handle('screener:get-criteria', () => handleIpcCall('screener_get_criteria_error', () => ({ criteria: getScreeningCriteria(db) })))`
  - `ipcMain.handle('screener:save-criteria', (_, payload) => handleIpcCall('screener_save_criteria_error', () => { const parsed = SaveScreeningCriteriaPayloadSchema.parse(payload); logger.debug(parsed, 'screener_save_criteria_requested'); return { criteria: saveScreeningCriteria(db, parsed) } }))`
- Preload: `getCriteria: () => invoke('screener:get-criteria')`, `saveCriteria: (payload: unknown) => invoke('screener:save-criteria', payload)`

**Refactor — cleanup to consider:**

- The string-with-refine pattern repeats across five payload fields — check whether one local `numericStringInRange(predicate, message)` helper in `schemas.ts` reads better than five inline refines.
- Verify `registerScreenerIpc` still takes only `{ db, getProvider }` and gained no orchestration.

**Acceptance criteria covered:**

- Transport for every save/read AC; directly covers "Reject out-of-range criteria" (`no criteria are saved`) at the boundary.

---

### 5. Renderer API adapter and query hooks

**Files to create or modify:**

- `src/renderer/src/api/screening-criteria.ts` — new; `ScreeningCriteria` type mirroring `IpcScreeningCriteria`, `getScreeningCriteria()`, `saveScreeningCriteria(payload)`.
- `src/renderer/src/api/screening-criteria.test.ts` — new.
- `src/renderer/src/hooks/screenerQueryKeys.ts` — add `criteria: ['screener', 'criteria'] as const`.
- `src/renderer/src/hooks/useScreeningCriteria.ts` — new; `useScreeningCriteria()` and `useSaveScreeningCriteria()`.
- `src/renderer/src/hooks/useScreeningCriteria.test.ts` — new.

**Red — tests to write:**

- `getScreeningCriteria` calls `window.api.screener.getCriteria` and unwraps `criteria` (`src/renderer/src/api/screening-criteria.test.ts`)
- `getScreeningCriteria` on an `ok: false` envelope rejects with a mapped `ApiError` carrying the field errors — same `throwMappedIpcErrors` path as `api/screener.ts`
- `saveScreeningCriteria` passes the payload through verbatim and unwraps `criteria`
- `saveScreeningCriteria` on a field-error envelope rejects with an `ApiError` whose detail carries `deltaMax` and its message
- `useSaveScreeningCriteria`'s `onSuccess` invalidates **both** `screenerQueryKeys.criteria` and `screenerQueryKeys.results` — assert against a spied `invalidateQueries` (`src/renderer/src/hooks/useScreeningCriteria.test.ts`)
- `useScreeningCriteria` queries under `screenerQueryKeys.criteria`

**Green — implementation:**

- Adapter mirrors `src/renderer/src/api/screener.ts` exactly: a field-for-field type comment pointing at `src/preload/index.d.ts`, `throwMappedIpcErrors` on `!result.ok`, explicit field-by-field return.
- `useSaveScreeningCriteria` is a `useMutation` whose `onSuccess` fires both invalidations — this is the "Save & re-screen" mechanism.

**Refactor — cleanup to consider:**

- `unwrapCriteria` mirrors `unwrapAlertDefaults` in `api/settings.ts`. Do not extract a shared generic unwrap across the two files — check for naming consistency only.

**Acceptance criteria covered:**

- "the results refresh", "the criteria are persisted" — the invalidation pair is what re-screens the table.

---

### 6. Criteria form schema and `ScreeningCriteriaSheet`

**Files to create or modify:**

- `src/renderer/src/schemas/screening-criteria.ts` — new; `screeningCriteriaSchema` plus `toFormValues` / `toPayload` mappers.
- `src/renderer/src/schemas/screening-criteria.test.ts` — new.
- `src/renderer/src/components/ScreeningCriteriaSheet.tsx` — new.
- `src/renderer/src/components/ScreeningCriteriaSheet.test.tsx` — new.

**Red — tests to write** (`src/renderer/src/schemas/screening-criteria.test.ts`):

- Valid default values parse successfully
- `deltaMax: '1.5'` fails with `Delta must be between 0.01 and 0.99`
- `dteMin: '0'` fails with `DTE must be at least 1`
- `minOpenInterest: '-100'` fails with `Open interest floor cannot be negative`
- `maxSpreadPercent: '0'` fails with `Max spread must be between 1% and 50%`
- `deltaMin: '0.30'`, `deltaMax: '0.20'` fails with `Minimum delta must be less than maximum delta`, and the issue path is `deltaMax`
- `dteMin: '45'`, `dteMax: '30'` fails with `Minimum DTE must be less than maximum DTE` on path `dteMax`
- With `priceCeilingEnabled: false`, a blank/garbage `maxUnderlyingPrice` still parses — a disabled optional is not validated
- With `priceCeilingEnabled: true` and `maxUnderlyingPrice: '0'`, parsing fails with `Price ceiling must be greater than zero`
- With `ivRankFloorEnabled: true` and `minIvRank: '101'`, parsing fails with `IV rank floor must be between 0 and 100`
- `toPayload` maps enabled/disabled toggles to `'75'` / `null` for both optionals, and passes `earningsHandling` straight through
- `toFormValues(criteria)` round-trips `toPayload` output

**Red — tests to write** (`src/renderer/src/components/ScreeningCriteriaSheet.test.tsx`):

- Given persisted criteria, every field renders pre-filled: delta min/max, DTE min/max, minimum open interest, max spread, the two Off/On toggles, and the earnings segment
- Inverting the delta band renders the inline error and disables the **Save & re-screen** button
- Inverting the DTE window does the same
- With the price-ceiling toggle Off, the `$` input is disabled; switching it On enables it
- With the IV-rank toggle Off, the IVR input is disabled; switching it On enables it
- **Reset to defaults** sets every field to its shipped default **and does not call the save mutation**
- Clicking Cancel calls `onClose` without calling the save mutation
- Clicking the close button calls `onClose` without saving
- Clicking the scrim calls `onClose` without saving
- Submitting valid values calls the save mutation with the exact `toPayload` shape, then calls `onClose`
- A field error returned by the mutation binds to that field via `setError`

**Green — implementation:**

- **Schema:** all numeric fields are `z.string()` with `.refine` against the shared predicates (an in-progress `'0.'` must be typeable), plus `priceCeilingEnabled`/`ivRankFloorEnabled` booleans and `earningsHandling` enum. Cross-field and conditional-optional rules go in `.superRefine` so errors attach to `deltaMax`, `dteMax`, `maxUnderlyingPrice`, `minIvRank`. Messages import from `src/main/core/screening-criteria.ts` — never re-typed.
- **Form:** React Hook Form with `zodResolver` and `mode: 'onChange'`. The schema uses `.default()`, so input ≠ output — use the three-generic `useForm<In, unknown, Out>` and `reset` inside the mutation's `onSuccess` (not a `useEffect`).
- **Sheet anatomy** (mirrors `CloseCcEarlySheet`): `createPortal(<SheetOverlay onClose={...}><SheetPanel width={460}>…</SheetPanel></SheetOverlay>, getSheetPortal())`, returning `null` when `open` is false.
  - `SheetHeader` — eyebrow `Screener` in gold, title `Screening Criteria`, subtitle `Applies to all {n} watchlist tickers · Classic Wheel · CSP`, close button.
  - `SheetBody` — the mockup's lead line "Filters disqualify a strike; ranking inputs order what survives. Saving re-screens immediately.", then four labelled groups separated by dividers, in the mockup's order:
    1. **Filters (hard)** — _Delta band_ (paired min/max inputs with an en-dash between and a trailing `Δ`, caption "Assignment-probability band for the short put."); _DTE window_ (paired min/max, trailing `days`, caption "Days to expiration to include."); _Price ceiling_ (Off/On segment + `$`-prefixed input, caption "Off by default — an optional per-account buying-power limit. On by default would silently hide large-cap names.")
    2. **Liquidity (hard gate)** — _Minimum open interest_ (caption "Contracts you can reliably enter and exit."); _Max bid-ask spread_ (`%` suffix, caption "of mark; a tight absolute spread (≤ $0.10) also passes.")
    3. **Ranking inputs (soft)** — _IV-rank floor_ (Off/On segment + `IVR`-suffixed input, caption "Off by default so a low-vol market doesn't empty results.")
    4. **Policy** — _Earnings handling_ segment `Exclude` / `Flag only`, caption "Exclude drops candidates with earnings on/before expiry; Flag keeps them with a warning."
  - `SheetFooter` — primary **Save & re-screen** (gold, disabled when `!formState.isValid`), secondary **Cancel**, and right-aligned **Reset to defaults** (underlined, muted) which is replaced by the muted text "Fix the highlighted fields." while the form is invalid.
- **Error treatment:** inline red text with a leading `!` beneath the field, and a red input border — the mockup's `RED_BORDER`. Use `text-wb-red` / `border-wb-red` Tailwind tokens, never inline style.
- **Disabled optional inputs** render at reduced opacity with the surface background, per the mockup's `NumInput` disabled look.
- Reset to defaults calls `form.reset(toFormValues(DEFAULT_SCREENING_CRITERIA))` — it must not persist anything.

**Refactor — cleanup to consider:**

- The paired min/max control appears twice (delta, DTE) and the Off/On-plus-input control appears twice (price ceiling, IV-rank floor). Both are genuine repeated concepts with a name — extract `RangeField` and `OptionalNumericField` **within this file** if the duplication is real after Green. Do not build a configurable field factory.
- If the sheet exceeds roughly 250 lines, split the form body into `ScreeningCriteriaForm.tsx` and keep the sheet as the portal/overlay wrapper — the `CloseCcEarlySheet` / `CloseCcEarlyForm` split is the precedent.
- Confirm no raw inline `style` for color, spacing, or animation.

**Acceptance criteria covered:**

- "every field is pre-filled from the persisted criteria"; "Reject an inverted delta band"; "Reject an inverted DTE window"; "Reject out-of-range criteria"; "IV-rank floor is optional and off by default"; "Price ceiling is optional and off by default"; "Dismissing the sheet discards unsaved edits"; "Reset to defaults".

---

### 7. Criteria summary strip

**Files to create or modify:**

- `src/renderer/src/lib/screener-format.ts` — add `fmtCriteriaSummary(criteria): string[]`.
- `src/renderer/src/lib/screener-format.test.ts` — extend.
- `src/renderer/src/components/ScreenerCriteriaStrip.tsx` — new.
- `src/renderer/src/components/ScreenerCriteriaStrip.test.tsx` — new.

**Red — tests to write** (`src/renderer/src/lib/screener-format.test.ts`):

- `fmtCriteriaSummary(DEFAULT_SCREENING_CRITERIA)` returns exactly `['Δ 0.20–0.30', 'DTE 30–45', 'OI ≥ 500', 'Spread ≤ 10%', 'Earnings Exclude']` — en-dash, `≥`, `≤`, and 2dp deltas all pinned by the AC
- After a save of `0.15–0.20` / `40–45`, the first two chips read `Δ 0.15–0.20` and `DTE 40–45`
- `earningsHandling: 'flag'` renders the chip `Earnings Flag only`
- An enabled price ceiling appends `Price ≤ $75`; disabled appends nothing
- An enabled IV-rank floor appends `IVR ≥ 30`; disabled appends nothing
- Chip order is stable: delta, DTE, OI, spread, price ceiling, IVR floor, earnings

**Red — tests to write** (`src/renderer/src/components/ScreenerCriteriaStrip.test.tsx`):

- Renders one chip per `fmtCriteriaSummary` entry plus the `Edit →` affordance
- Clicking the strip calls `onClick`
- The strip is a `button`, so it is keyboard-reachable

**Green — implementation:**

- `fmtCriteriaSummary` returns a string array (the component owns chip markup, the formatter owns wording). Deltas render at 2dp via `decimal.js` `toFixed(2)`; the band separator is the en-dash `–` the engine's `formatBand` already uses.
- `ScreenerCriteriaStrip` is a full-width `button` with the `Criteria` section label, the chips, and a right-aligned gold `Edit →`, styled with `wb-*` tokens per the mockup's `SummaryStrip`. Give it `data-testid="screener-criteria-strip"`.

**Refactor — cleanup to consider:**

- Check whether the chip element duplicates an existing `Badge`/`Chip` primitive in `components/ui/` before adding local markup.

**Acceptance criteria covered:**

- "a summary strip above the results reads 'Δ 0.20–0.30 · DTE 30–45 · OI ≥ 500 · Spread ≤ 10% · Earnings Exclude'"; "the criteria summary strip reads 'Δ 0.15–0.20 · DTE 40–45 …'"; the earnings-toggle strip assertion.

---

### 8. ScreenerPage wiring — three entry points, saved banner, empty-state copy

**Files to create or modify:**

- `src/renderer/src/pages/ScreenerPage.tsx` — add the `⚙ Criteria` header button, the summary strip, the sheet, the saved banner, and change the empty-card copy and action.
- `src/renderer/src/pages/ScreenerPage.test.tsx` — extend.
- `src/renderer/src/components/ScreenerStateCard.tsx` — no change expected; it already takes `actionLabel` / `onAction`.

**Red — tests to write** (`src/renderer/src/pages/ScreenerPage.test.tsx`):

- The `⚙ Criteria` button renders in the page header alongside the market-status pill, and clicking it opens the sheet
- Clicking the summary strip opens the same sheet
- With zero ranked candidates, the empty card renders an **Adjust criteria** button, and clicking it opens the sheet
- The empty card's body no longer contains the string `Screener settings` — the dangling US-66 reference is gone
- The sheet is not rendered until an entry point is used
- After a successful save, the page shows `Screening criteria saved` and the sheet is closed
- The saved confirmation clears when the sheet is reopened (it is not sticky across a second edit session)
- The summary strip renders above the results table, not below it
- While criteria are still loading, the page does not crash and the strip is absent

**Green — implementation:**

- Header `right` becomes a flex row: the `⚙ Criteria` button (`CriteriaButton` per the mockup — bordered, `wb-mono`, gold-tinted while the sheet is open) followed by `<MarketStatusPill state={display} />`. Keep the existing pill exactly as-is — no timing or polling copy.
- One `useState` for sheet open/closed and one for the saved banner, both owned by `ScreenerPage`; all three entry points call the same open setter.
- `<ScreenerCriteriaStrip criteria={criteria} onClick={openSheet} />` rendered above `ScreenerResultsBody`, inside the existing `flex flex-col gap-4 p-6` column, so it sits above both the results and the empty card.
- The empty card becomes: title unchanged (`No candidates match your criteria`), body `Every strike on your watchlist was filtered out. Loosen your delta band or DTE window.`, `actionLabel="Adjust criteria"`, `onAction={openSheet}`.
- The saved banner mirrors the mockup's `SavedBanner`: green-bordered card, `✓` glyph, `Screening criteria saved`. Rendered above the strip; set on the mutation's `onSuccess`, cleared when the sheet reopens.
- `ScreeningCriteriaSheet` is rendered from `ScreenerPage` and receives `open`, `criteria`, `onClose`, and the save mutation — never navigating away, per the AC.

**Refactor — cleanup to consider:**

- `ScreenerPage` gains several pieces of state; check whether the sheet-open plus saved-banner pair reads better as one small local hook, following the `usePositionDetailSheets.ts` precedent — but only if the page is genuinely harder to read without it.
- Verify the `ScreenerResultsBody` split still makes sense once the strip and banner sit outside it.

**Acceptance criteria covered:**

- "Open the criteria sheet from the page header" (including "the sidebar navigation remains visible and clickable", which `SheetOverlay`'s `left-[200px]` provides); "Open the criteria sheet from the criteria summary strip"; "Open the criteria sheet from the empty state"; "the sheet closes / the page shows 'Screening criteria saved'".

---

### 9. E2e tests

**Files to create or modify:**

- `e2e/screening-criteria.spec.ts` — new; exactly one `it()` per AC, named to mirror the Gherkin.
- `e2e/screener-helpers.ts` — extend with a low-IVR fixture, stock-quote fixtures, a criteria writer, sheet helpers, and a relaunch helper.

**Helper additions needed first:**

- `PEP_PUT` fixture with IVR 22 seeded through the fake collector, so an IV-rank floor of 30 has something to drop (the existing KO 38 / AAPL 44 / MSFT n/a set has nothing below 30)
- `WHEELBASE_MOCK_STOCK_QUOTES` entries — KO $62, AAPL $185, MSFT $420 — so a $75 price ceiling leaves only KO
- `openCriteriaSheet(page, via)` for the three entry points; `criteriaChips(page)` reading the strip; `saveCriteria(page)` clicking the primary action
- `relaunchScreener(dbPath)` — close the app and relaunch against the same `dbPath` without re-seeding the watchlist

**Red — tests to write** (`e2e/screening-criteria.spec.ts`), one per AC:

- `it('opens the criteria sheet from the page header')` — click `⚙ Criteria`; assert the sheet is visible over the results, every field is pre-filled from the persisted criteria, and a sidebar nav item is still visible and clickable
- `it('opens the criteria sheet from the criteria summary strip')` — assert the strip reads `Δ 0.20–0.30 · DTE 30–45 · OI ≥ 500 · Spread ≤ 10% · Earnings Exclude`, click it, assert the sheet opens
- `it('opens the criteria sheet from the empty state')` — screen with criteria that match nothing; assert the empty card offers **Adjust criteria**, click it, assert the sheet opens and the URL hash is still `#/screener`
- `it('saves new screening criteria and re-screens')` — set delta `0.15–0.20` and DTE `40–45`, click **Save & re-screen**; assert the sheet closes, `Screening criteria saved` shows, the ranked rows are only those inside the new band, and the strip reads `Δ 0.15–0.20 · DTE 40–45 · OI ≥ 500 · Spread ≤ 10% · Earnings Exclude`
- `it('saved criteria survive a restart')` — save `0.15–0.20`, relaunch against the same `dbPath`, reopen the sheet, assert the delta band reads `0.15–0.20`
- `it('toggles earnings handling between exclude and flag')` — switch to **Flag only** and save; assert the strip chip reads `Earnings Flag only` and the reopened sheet shows `Flag only` selected. (Behaviour on candidates is US-70 — assert persistence only.)
- `it('rejects an inverted delta band')` — set `0.30 → 0.20`; assert the inline error `Minimum delta must be less than maximum delta` and that **Save & re-screen** is disabled
- `it('rejects an inverted DTE window')` — set `45 → 30`; assert `Minimum DTE must be less than maximum DTE` and the disabled button
- `it('rejects out-of-range criteria')` — table-drive the AC's four examples (max delta `1.5` → `Delta must be between 0.01 and 0.99`; minimum DTE `0` → `DTE must be at least 1`; minimum open interest `-100` → `Open interest floor cannot be negative`; max spread `0` → `Max spread must be between 1% and 50%`), asserting for each that the message shows, nothing is persisted, and the ranked rows behind the sheet are unchanged
- `it('leaves the IV-rank floor off by default and excludes below it when enabled')` — with the floor off, assert PEP (IVR 22) ranks; enable the floor at 30 and save; assert PEP drops out and MSFT (unknown IVR) still ranks
- `it('leaves the price ceiling off by default and excludes above it when enabled')` — with the ceiling off, assert MSFT ranks; enable the ceiling at `$75` and save; assert only KO ranks
- `it('discards unsaved edits when the sheet is dismissed')` — change the band to `0.15–0.20` then Cancel; assert the strip still reads `Δ 0.20–0.30`, the ranked rows are unchanged, and reopening shows `0.20–0.30`. Repeat the dismissal via the close button and the scrim within the same test, since the AC lists all three.
- `it('resets to defaults without persisting')` — save `0.15–0.20`, reopen, click **Reset to defaults**; assert every field shows its shipped default, then close without saving and assert the strip still reads `Δ 0.15–0.20`
- `it('does not show screening criteria in Settings')` — navigate to `#/settings`; assert no screening-criteria section, and that the Alert Defaults and broker-credentials sections are both still present

**Green — implementation:**

- Helpers only; the app code is already complete by this area. Every criteria write in the spec goes through the real sheet or the real `screener:save-criteria` IPC — never a direct `app_settings` write.

**Refactor — cleanup to consider:**

- Fold repeated open-sheet-and-edit-a-field sequences into helpers so each `it()` reads as its AC. Keep the assertions in the spec.

**Acceptance criteria covered:**

- All 14. See the audit below.

---

## AC Audit

| #   | Acceptance criterion                              | E2e test                                                                     |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Open the criteria sheet from the page header      | `opens the criteria sheet from the page header`                              |
| 2   | Open the criteria sheet from the summary strip    | `opens the criteria sheet from the criteria summary strip`                   |
| 3   | Open the criteria sheet from the empty state      | `opens the criteria sheet from the empty state`                              |
| 4   | Save new screening criteria and re-screen         | `saves new screening criteria and re-screens`                                |
| 5   | Saved criteria survive a restart                  | `saved criteria survive a restart`                                           |
| 6   | Toggle earnings handling between exclude and flag | `toggles earnings handling between exclude and flag`                         |
| 7   | Reject an inverted delta band                     | `rejects an inverted delta band`                                             |
| 8   | Reject an inverted DTE window                     | `rejects an inverted DTE window`                                             |
| 9   | Reject out-of-range criteria (4 examples)         | `rejects out-of-range criteria`                                              |
| 10  | IV-rank floor optional and off by default         | `leaves the IV-rank floor off by default and excludes below it when enabled` |
| 11  | Price ceiling optional and off by default         | `leaves the price ceiling off by default and excludes above it when enabled` |
| 12  | Dismissing the sheet discards unsaved edits       | `discards unsaved edits when the sheet is dismissed`                         |
| 13  | Reset to defaults                                 | `resets to defaults without persisting`                                      |
| 14  | Settings does not own screening criteria          | `does not show screening criteria in Settings`                               |

All 14 acceptance criteria have a dedicated e2e test. None uses the not-e2e-testable escape hatch.
