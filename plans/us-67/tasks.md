# US-67 — Configure screening criteria — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- **`[Refactor]` tasks must run in the main conversation** — subagents cannot invoke the `/refactor` skill

Source: `plans/us-67/plan.md` · Story: `docs/epics/08-stories/US-67-configure-screening-defaults.md`

The dependency chain here is genuinely deep (core → service → IPC → renderer API → components → page → e2e), so most layers hold a single area. Only Layers 1 and 5 fan out.

---

## Layer 1 — Pure core (no dependencies)

> Both areas can be started immediately and run in parallel. Neither imports the other.

### Screening-criteria bounds module

- [x] **[Red]** Write failing tests — `src/main/core/screening-criteria.test.ts`
  - `isDeltaInRange` true at `'0.01'` and `'0.99'`; false at `'0'`, `'1'`, `'1.5'`
  - `isDteInRange` true for `1` and `365`; false for `0`, `366`, `30.5`
  - `isOpenInterestInRange` true for `0` and `500`; false for `-1`, `-100`
  - `isSpreadPercentInRange` true for `'1'` and `'50'`; false for `'0'`, `'51'`
  - `isPriceCeilingInRange` true for `'75'`; false for `'0'`, `'-5'`
  - `isIvRankFloorInRange` true for `'0'`, `'30'`, `'100'`; false for `'-1'`, `'101'`
  - `isAscending('0.20','0.30')` true; `isAscending('0.30','0.20')` and `isAscending('0.20','0.20')` both false (strict)
  - Every message constant equals its AC string verbatim: `Delta must be between 0.01 and 0.99`, `DTE must be at least 1`, `DTE must be at most 365`, `Open interest floor cannot be negative`, `Max spread must be between 1% and 50%`, `Price ceiling must be greater than zero`, `IV rank floor must be between 0 and 100`, `Minimum delta must be less than maximum delta`, `Minimum DTE must be less than maximum DTE`
  - Every numeric predicate returns `false` (never throws) for `'abc'` and `''` — the renderer calls these mid-typing
  - Run `pnpm test src/main/core/screening-criteria.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/screening-criteria.ts` _(depends on: Bounds module Red ✓)_
  - Bounds: `DELTA_MIN=0.01`, `DELTA_MAX=0.99`, `DTE_MIN=1`, `DTE_MAX=365`, `OPEN_INTEREST_MIN=0`, `SPREAD_PERCENT_MIN=1`, `SPREAD_PERCENT_MAX=50`, `IV_RANK_MIN=0`, `IV_RANK_MAX=100`
  - Nine message constants built from the bounds by template literal
  - Predicates: `isDeltaInRange`, `isDteInRange`, `isOpenInterestInRange`, `isSpreadPercentInRange`, `isPriceCeilingInRange`, `isIvRankFloorInRange`, `isAscending`
  - Pure — no DB, provider, or logger imports. Model on `src/main/core/alert-thresholds.ts`, including its lockstep header comment
  - Run `pnpm test src/main/core/screening-criteria.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/screening-criteria.ts` _(depends on: Bounds module Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Look for: the shared "parse, guard non-finite, compare" shape across predicates; naming consistency with `alert-thresholds.ts`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### IV-rank floor in the pure engine

- [x] **[Red]** Write failing tests — `src/main/core/screener.test.ts` (extend)
  - `minIvRank: '30'` + `ivRank.value = '22'` → `evaluateFilters` returns `{ code: 'iv_rank_floor' }`, reason `IV rank 22.0 below 30`
  - `minIvRank: '30'` + `ivRank.value = '38'` → not excluded
  - `minIvRank: '30'` + `ivRank: null` → **not excluded** (standing US-65 rule: a missing IV rank never excludes)
  - `minIvRank: null` + `ivRank.value = '5'` → not excluded
  - `ivRank.value` exactly equal to the floor passes (inclusive — `lt`, not `lte`)
  - `screenTicker` with the floor on drops the low-IVR ticker into `excluded`; the high-IVR ticker still scores
  - A strike breaching both `iv_rank_floor` and `delta_band` reports `iv_rank_floor` (ticker-level wins, lower `index`)
  - `DEFAULT_SCREENING_CRITERIA.minIvRank` is `null`
  - Run `pnpm test src/main/core/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/screener.ts` _(depends on: IV-rank floor Red ✓)_
  - Add `minIvRank: string | null` to `ScreeningCriteria`; `minIvRank: null` to `DEFAULT_SCREENING_CRITERIA`
  - Add `'iv_rank_floor'` to `ExclusionCode`; add `ivRank: IvRank | null` to `FilterInput`
  - New `FILTERS` entry **immediately after `price_ceiling`**:
    - `applies: (ctx, criteria) => criteria.minIvRank !== null && ctx.ivRank !== null`
    - `test: (ctx, criteria) => new Decimal(ctx.ivRank!.value).lt(criteria.minIvRank!)`
    - `reason: (ctx, criteria) => \`IV rank ${ctx.ivRank!.value} below ${criteria.minIvRank}\``
  - Thread `input.ivRank` through `judgeStrike` alongside `underlyingPrice` and `earningsDate`
  - No logging — `src/main/core/` is pure
  - Run `pnpm test src/main/core/screener.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/screener.ts` _(depends on: IV-rank floor Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Look for: whether the reason string should use an existing formatter (`formatBand` / `formatPercent` / `formatMoney`) rather than a tenth ad-hoc shape
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Persistence service (depends on Layer 1)

> Single area. Needs the bounds module for validation and `minIvRank` on the criteria type.

### Screening-criteria persistence service

**Requires:** Bounds module Green ✓ · IV-rank floor Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/screening-criteria.test.ts` + `src/main/services/screener.test.ts` _(depends on: Bounds module Green ✓, IV-rank floor Green ✓)_
  - `screening-criteria.test.ts` (in-memory migrated DB):
    - `getScreeningCriteria` on an empty DB returns `DEFAULT_SCREENING_CRITERIA` exactly
    - Save-then-get round-trips every field, including `maxUnderlyingPrice: '75'`, `minIvRank: '30'`, `earningsHandling: 'flag'`
    - `saveScreeningCriteria` returns the persisted document read back, not its input argument
    - `saveScreeningCriteria` fills `maxSpreadAbsolute` from `DEFAULT_SCREENING_CRITERIA` though the payload omits it
    - A corrupt row (`'not json'`) makes `getScreeningCriteria` return the defaults rather than throw
    - A document missing `minIvRank` reads back with `minIvRank: null`
    - A document with a present-but-invalid field (`dteMin: 0`) falls back to the **whole** defaults object, not a half-merge
    - One test per row of `contracts/screener-save-criteria.md`: each bound violation throws `ValidationError` with the exact field, code, and message
    - Inverted delta band → `ValidationError('deltaMax','inverted_band','Minimum delta must be less than maximum delta')`; inverted DTE window → the DTE equivalent
    - A rejected save leaves the previously stored document untouched
  - `screener.test.ts` (extend):
    - `screenWatchlistCandidates` with no `opts.criteria` uses the **persisted** criteria — save a `0.15–0.20` band, assert a `0.28`-delta strike is excluded with reason `delta 0.28 outside 0.15–0.20`
    - With nothing persisted it still uses `DEFAULT_SCREENING_CRITERIA` (US-65 regression guard)
    - An explicit `opts.criteria` still overrides the persisted value
    - The persisted `dteMin`/`dteMax` reach `pullWatchlistChains` as its `window`
  - Run `pnpm test src/main/services/screening-criteria.test.ts src/main/services/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/screening-criteria.ts`, `src/main/services/screener.ts` _(depends on: Persistence service Red ✓)_
  - `SCREENING_CRITERIA_KEY = 'screening_criteria'`; no migration
  - `StoredScreeningCriteriaSchema` — Zod with `.default()` on every field from `DEFAULT_SCREENING_CRITERIA`, used only on the read path
  - `getScreeningCriteria(db)` per the four-step read path in `data-model.md`; log `screening_criteria_unreadable` at WARN on both the JSON and the Zod failure
  - `saveScreeningCriteria(db, input)` per the five-step write path; throw `ValidationError` (from `src/main/core/lifecycle.ts`) on the first failure; log `screening_criteria_saved` at INFO; return `getScreeningCriteria(db)`
  - Validation uses the predicates and messages from `src/main/core/screening-criteria.ts` — **no bounds literals in this file**
  - `src/main/services/screener.ts:216`: `opts.criteria ?? DEFAULT_SCREENING_CRITERIA` → `opts.criteria ?? getScreeningCriteria(db)`
  - Run `pnpm test src/main/services/screening-criteria.test.ts src/main/services/screener.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/screening-criteria.ts` _(depends on: Persistence service Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Look for: nine near-identical `if (!predicate) throw new ValidationError(...)` blocks — consider one `{ field, code, message, valid }` table, but only if it reads better than the explicit blocks; check the read fallback and write compose don't both hardcode defaults in a driftable way
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — IPC boundary (depends on Layer 2)

> Single area. Zod payload schema, both handlers, and preload move together — a channel is not usable until all three exist.

### IPC contract, payload schema, handlers, preload

**Requires:** Bounds module Green ✓ · Persistence service Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/screener.test.ts` (extend) _(depends on: Persistence service Green ✓)_
  - `screener:get-criteria` returns `{ ok: true, criteria }` with the defaults on a fresh DB
  - `screener:save-criteria` with a valid payload returns `{ ok: true, criteria }` reflecting the saved values
  - `screener:save-criteria` with an inverted delta band returns `{ ok: false, errors: [{ field: 'deltaMax', code: 'inverted_band', message: 'Minimum delta must be less than maximum delta' }] }`
  - `screener:save-criteria` with `deltaMax: '1.5'` returns `ok: false` with field `deltaMax` and message `Delta must be between 0.01 and 0.99` — Zod rejects at the boundary before the service runs
  - `screener:save-criteria` with a payload missing `earningsHandling` returns `ok: false`, never throws to the renderer
  - Neither handler throws — an internal failure surfaces as `__root__` / `internal_error`
  - Run `pnpm test src/main/ipc/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts`, `src/main/ipc/screener.ts`, `src/preload/index.ts`, `src/preload/index.d.ts` _(depends on: IPC boundary Red ✓)_
  - `SaveScreeningCriteriaPayloadSchema` shaped exactly as `contracts/screener-save-criteria.md`; string fields `.refine(...)` against the shared predicates passing the shared messages; `dteMin`/`dteMax`/`minOpenInterest` as `z.number().int()`; `maxUnderlyingPrice` and `minIvRank` `.nullable()` with the refine applied only when non-null; `earningsHandling` as `z.enum(['exclude','flag'])`; two `.superRefine` cross-field rules attaching `inverted_band` to `deltaMax` and `dteMax`
  - Both handlers thin — Zod parse + one service call inside `handleIpcCall`, mirroring `settings:get-alert-defaults` / `settings:save-alert-defaults`. `registerScreenerIpc` still takes only `{ db, getProvider }`
  - Preload: `getCriteria: () => invoke('screener:get-criteria')`, `saveCriteria: (payload: unknown) => invoke('screener:save-criteria', payload)`
  - `index.d.ts`: `IpcScreeningCriteria`, `IpcScreeningCriteriaResult`, and the two method signatures on the `screener` block
  - Run `pnpm test src/main/ipc/screener.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/schemas.ts`, `src/main/ipc/screener.ts` _(depends on: IPC boundary Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Look for: the string-with-refine pattern repeated across five payload fields — consider one local `numericStringInRange(predicate, message)` helper; confirm no orchestration leaked into the handler file
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Renderer data access (depends on Layer 3)

> Single area. Everything in Layer 5 needs the renderer `ScreeningCriteria` type and the save mutation.

### Renderer API adapter and query hooks

**Requires:** IPC boundary Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/api/screening-criteria.test.ts`, `src/renderer/src/hooks/useScreeningCriteria.test.ts` _(depends on: IPC boundary Green ✓)_
  - `getScreeningCriteria` calls `window.api.screener.getCriteria` and unwraps `criteria`
  - `getScreeningCriteria` on an `ok: false` envelope rejects with a mapped `ApiError` carrying the field errors
  - `saveScreeningCriteria` passes the payload through verbatim and unwraps `criteria`
  - `saveScreeningCriteria` on a field-error envelope rejects with an `ApiError` whose detail carries `deltaMax` and its message
  - `useSaveScreeningCriteria`'s `onSuccess` invalidates **both** `screenerQueryKeys.criteria` and `screenerQueryKeys.results` — assert against a spied `invalidateQueries`
  - `useScreeningCriteria` queries under `screenerQueryKeys.criteria`
  - Run `pnpm test src/renderer/src/api/screening-criteria.test.ts src/renderer/src/hooks/useScreeningCriteria.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/api/screening-criteria.ts`, `src/renderer/src/hooks/screenerQueryKeys.ts`, `src/renderer/src/hooks/useScreeningCriteria.ts` _(depends on: Renderer data access Red ✓)_
  - Adapter mirrors `src/renderer/src/api/screener.ts`: field-for-field type with a comment pointing at `src/preload/index.d.ts`, `throwMappedIpcErrors` on `!result.ok`, explicit field-by-field return
  - `screenerQueryKeys` gains `criteria: ['screener', 'criteria'] as const` — **not** added to `settingsQueryKeys`
  - `useSaveScreeningCriteria` fires both invalidations in `onSuccess` — this is the "Save & re-screen" mechanism
  - Run `pnpm test src/renderer/src/api/screening-criteria.test.ts src/renderer/src/hooks/useScreeningCriteria.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/api/screening-criteria.ts`, `src/renderer/src/hooks/useScreeningCriteria.ts` _(depends on: Renderer data access Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Look for: naming consistency with `api/settings.ts`'s `unwrapAlertDefaults`. Do **not** extract a shared generic unwrap across the two files
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — UI components (depends on Layer 4)

> These two areas can run in parallel with each other. Neither imports the other; both consume the renderer `ScreeningCriteria` type.

### Criteria form schema and sheet

**Requires:** Bounds module Green ✓ · Renderer data access Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/schemas/screening-criteria.test.ts`, `src/renderer/src/components/ScreeningCriteriaSheet.test.tsx` _(depends on: Renderer data access Green ✓)_
  - Schema: valid defaults parse; `deltaMax: '1.5'` → `Delta must be between 0.01 and 0.99`; `dteMin: '0'` → `DTE must be at least 1`; `minOpenInterest: '-100'` → `Open interest floor cannot be negative`; `maxSpreadPercent: '0'` → `Max spread must be between 1% and 50%`
  - Schema: `deltaMin '0.30'` / `deltaMax '0.20'` → `Minimum delta must be less than maximum delta` on path `deltaMax`; `dteMin '45'` / `dteMax '30'` → `Minimum DTE must be less than maximum DTE` on path `dteMax`
  - Schema: with `priceCeilingEnabled: false`, a blank/garbage `maxUnderlyingPrice` still parses; with it `true` and `'0'`, fails with `Price ceiling must be greater than zero`
  - Schema: with `ivRankFloorEnabled: true` and `minIvRank: '101'`, fails with `IV rank floor must be between 0 and 100`
  - Schema: `toPayload` maps enabled/disabled toggles to `'75'` / `null` for both optionals and passes `earningsHandling` through; `toFormValues` round-trips `toPayload` output
  - Sheet: every field renders pre-filled from persisted criteria — delta min/max, DTE min/max, minimum open interest, max spread, both Off/On toggles, earnings segment
  - Sheet: inverting the delta band renders the inline error and disables **Save & re-screen**; same for the DTE window
  - Sheet: price-ceiling toggle Off disables the `$` input, On enables it; same for the IV-rank toggle and its input
  - Sheet: **Reset to defaults** sets every field to its shipped default and **does not call the save mutation**
  - Sheet: Cancel, the close button, and the scrim each call `onClose` without saving
  - Sheet: submitting valid values calls the save mutation with the exact `toPayload` shape, then calls `onClose`
  - Sheet: a field error returned by the mutation binds to that field via `setError`
  - Run `pnpm test src/renderer/src/schemas/screening-criteria.test.ts src/renderer/src/components/ScreeningCriteriaSheet.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/schemas/screening-criteria.ts`, `src/renderer/src/components/ScreeningCriteriaSheet.tsx` _(depends on: Criteria form schema and sheet Red ✓)_
  - Schema: numeric fields are `z.string()` with `.refine` against the shared predicates (an in-progress `'0.'` must be typeable); plus `priceCeilingEnabled` / `ivRankFloorEnabled` booleans and the `earningsHandling` enum; cross-field and conditional-optional rules in `.superRefine` attaching to `deltaMax`, `dteMax`, `maxUnderlyingPrice`, `minIvRank`. Messages **import** from `src/main/core/screening-criteria.ts` — never re-typed
  - Form: React Hook Form + `zodResolver`, `mode: 'onChange'`. The schema uses `.default()` so input ≠ output — use the three-generic `useForm<In, unknown, Out>` and `reset` inside the mutation's `onSuccess` (not a `useEffect`)
  - Sheet anatomy (mirror `CloseCcEarlySheet`): `createPortal(<SheetOverlay onClose><SheetPanel width={460}>…</SheetPanel></SheetOverlay>, getSheetPortal())`, returning `null` when `open` is false
  - `SheetHeader` — eyebrow `Screener` in gold, title `Screening Criteria`, subtitle `Applies to all {n} watchlist tickers · Classic Wheel · CSP`
  - `SheetBody` — lead line "Filters disqualify a strike; ranking inputs order what survives. Saving re-screens immediately.", then four divider-separated groups in mockup order: **Filters (hard)** (Delta band paired min/max with en-dash + trailing `Δ`; DTE window paired min/max + trailing `days`; Price ceiling Off/On segment + `$`-prefixed input), **Liquidity (hard gate)** (Minimum open interest; Max bid-ask spread with `%` suffix), **Ranking inputs (soft)** (IV-rank floor Off/On segment + `IVR`-suffixed input), **Policy** (Earnings handling segment `Exclude` / `Flag only`) — captions verbatim from `plan.md` area 6
  - `SheetFooter` — primary **Save & re-screen** (gold, disabled when `!formState.isValid`), secondary **Cancel**, right-aligned **Reset to defaults** (underlined, muted) replaced by "Fix the highlighted fields." while invalid
  - Errors: inline red text with a leading `!` plus a red input border — `text-wb-red` / `border-wb-red` tokens, **never inline style**. Disabled optional inputs render at reduced opacity on the surface background
  - Reset calls `form.reset(toFormValues(DEFAULT_SCREENING_CRITERIA))` — persists nothing
  - Run `pnpm test src/renderer/src/schemas/screening-criteria.test.ts src/renderer/src/components/ScreeningCriteriaSheet.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/ScreeningCriteriaSheet.tsx` _(depends on: Criteria form schema and sheet Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Look for: the paired min/max control (delta, DTE) and the Off/On-plus-input control (price ceiling, IV-rank floor) each appear twice — extract `RangeField` / `OptionalNumericField` **within this file** if the duplication is real. Do not build a configurable field factory. If the sheet exceeds ~250 lines, split into `ScreeningCriteriaForm.tsx` per the `CloseCcEarlySheet` / `CloseCcEarlyForm` precedent. Confirm no raw inline `style` for color, spacing, or animation
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Criteria summary strip

**Requires:** Renderer data access Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/screener-format.test.ts` (extend), `src/renderer/src/components/ScreenerCriteriaStrip.test.tsx` _(depends on: Renderer data access Green ✓)_
  - `fmtCriteriaSummary(DEFAULT_SCREENING_CRITERIA)` returns exactly `['Δ 0.20–0.30','DTE 30–45','OI ≥ 500','Spread ≤ 10%','Earnings Exclude']` — en-dash, `≥`, `≤`, and 2dp deltas all pinned
  - After a `0.15–0.20` / `40–45` save the first two chips read `Δ 0.15–0.20` and `DTE 40–45`
  - `earningsHandling: 'flag'` renders `Earnings Flag only`
  - An enabled price ceiling appends `Price ≤ $75`; disabled appends nothing
  - An enabled IV-rank floor appends `IVR ≥ 30`; disabled appends nothing
  - Chip order is stable: delta, DTE, OI, spread, price ceiling, IVR floor, earnings
  - Strip renders one chip per entry plus the `Edit →` affordance; clicking calls `onClick`; it is a `button`, so keyboard-reachable
  - Run `pnpm test src/renderer/src/lib/screener-format.test.ts src/renderer/src/components/ScreenerCriteriaStrip.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/screener-format.ts`, `src/renderer/src/components/ScreenerCriteriaStrip.tsx` _(depends on: Criteria summary strip Red ✓)_
  - `fmtCriteriaSummary(criteria): string[]` — the formatter owns wording, the component owns chip markup. Deltas at 2dp via `decimal.js` `toFixed(2)`; band separator is the en-dash `–` the engine's `formatBand` already uses
  - `ScreenerCriteriaStrip` is a full-width `button` with the `Criteria` section label, the chips, and a right-aligned gold `Edit →`, styled with `wb-*` tokens per the mockup's `SummaryStrip`. `data-testid="screener-criteria-strip"`
  - Run `pnpm test src/renderer/src/lib/screener-format.test.ts src/renderer/src/components/ScreenerCriteriaStrip.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/ScreenerCriteriaStrip.tsx` _(depends on: Criteria summary strip Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Look for: whether the chip element duplicates an existing `Badge` / chip primitive in `components/ui/` before keeping local markup
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — Page wiring (depends on Layer 5)

> Single area. Composes the sheet and the strip into the three entry points.

### ScreenerPage wiring

**Requires:** Criteria form schema and sheet Green ✓ · Criteria summary strip Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/ScreenerPage.test.tsx` (extend) _(depends on: Criteria form schema and sheet Green ✓, Criteria summary strip Green ✓)_
  - The `⚙ Criteria` button renders in the page header alongside the market-status pill; clicking it opens the sheet
  - Clicking the summary strip opens the same sheet
  - With zero ranked candidates the empty card renders an **Adjust criteria** button; clicking it opens the sheet
  - The empty card's body no longer contains `Screener settings` — the dangling US-66 reference is gone
  - The sheet is not rendered until an entry point is used
  - After a successful save the page shows `Screening criteria saved` and the sheet is closed
  - The saved confirmation clears when the sheet is reopened (not sticky across a second edit session)
  - The summary strip renders above the results table, not below it
  - While criteria are still loading the page does not crash and the strip is absent
  - Run `pnpm test src/renderer/src/pages/ScreenerPage.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/ScreenerPage.tsx` _(depends on: ScreenerPage wiring Red ✓)_
  - Header `right` becomes a flex row: the `⚙ Criteria` button (bordered, `wb-mono`, gold-tinted while the sheet is open) then `<MarketStatusPill state={display} />`. Keep the pill exactly as-is — **no timing or polling copy**
  - One `useState` for sheet open/closed and one for the saved banner, both owned by `ScreenerPage`; all three entry points call the same open setter
  - `<ScreenerCriteriaStrip criteria={criteria} onClick={openSheet} />` above `ScreenerResultsBody`, inside the existing `flex flex-col gap-4 p-6` column so it sits above both the results and the empty card
  - Empty card: title unchanged, body → `Every strike on your watchlist was filtered out. Loosen your delta band or DTE window.`, `actionLabel="Adjust criteria"`, `onAction={openSheet}`
  - Saved banner mirrors the mockup's `SavedBanner` — green-bordered card, `✓` glyph, `Screening criteria saved`; rendered above the strip, set on the mutation's `onSuccess`, cleared when the sheet reopens
  - `ScreeningCriteriaSheet` rendered from `ScreenerPage` with `open`, `criteria`, `onClose`, and the save mutation — never navigating away
  - Run `pnpm test src/renderer/src/pages/ScreenerPage.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/ScreenerPage.tsx` _(depends on: ScreenerPage wiring Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Look for: whether sheet-open plus saved-banner state reads better as one small local hook (`usePositionDetailSheets.ts` precedent), and whether the `ScreenerResultsBody` split still makes sense with the strip and banner outside it
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 7 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/screening-criteria.spec.ts` _(depends on: all Green tasks ✓)_
  - Helper additions in `e2e/screener-helpers.ts` first:
    - `PEP_PUT` fixture with IVR 22, so an IV-rank floor of 30 has something to drop (KO 38 / AAPL 44 / MSFT n/a has nothing below 30)
    - `WHEELBASE_MOCK_STOCK_QUOTES` entries — KO $62, AAPL $185, MSFT $420 — so a $75 ceiling leaves only KO
    - `openCriteriaSheet(page, via)` for the three entry points; `criteriaChips(page)`; `saveCriteria(page)`
    - `relaunchScreener(dbPath)` — close and relaunch against the same `dbPath` without re-seeding the watchlist
  - Every criteria write goes through the real sheet or the real `screener:save-criteria` IPC — **never** a direct `app_settings` write
  - One `it()` per AC bullet — test names mirror AC language:
    - AC-1: Open the criteria sheet from the page header → `it('opens the criteria sheet from the page header')`
    - AC-2: Open the criteria sheet from the criteria summary strip → `it('opens the criteria sheet from the criteria summary strip')`
    - AC-3: Open the criteria sheet from the empty state → `it('opens the criteria sheet from the empty state')`
    - AC-4: Save new screening criteria and re-screen → `it('saves new screening criteria and re-screens')`
    - AC-5: Saved criteria survive a restart → `it('saved criteria survive a restart')`
    - AC-6: Toggle earnings handling between exclude and flag → `it('toggles earnings handling between exclude and flag')`
    - AC-7: Reject an inverted delta band → `it('rejects an inverted delta band')`
    - AC-8: Reject an inverted DTE window → `it('rejects an inverted DTE window')`
    - AC-9: Reject out-of-range criteria → `it('rejects out-of-range criteria')`
    - AC-10: IV-rank floor is optional and off by default → `it('leaves the IV-rank floor off by default and excludes below it when enabled')`
    - AC-11: Price ceiling is optional and off by default → `it('leaves the price ceiling off by default and excludes above it when enabled')`
    - AC-12: Dismissing the sheet discards unsaved edits → `it('discards unsaved edits when the sheet is dismissed')`
    - AC-13: Reset to defaults → `it('resets to defaults without persisting')`
    - AC-14: Settings does not own screening criteria → `it('does not show screening criteria in Settings')`
  - Run `pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Helpers only — the app code is complete by this layer. A failure here means a Layer 1–6 gap, not new feature code
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Look for: repeated open-sheet-and-edit-a-field sequences that belong in helpers, so each `it()` reads as its AC. Keep assertions in the spec
  - Run `pnpm test:e2e && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC — 14/14, no escape hatches
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
