---
page: docs/spec/features/us-67-configure-screening-criteria.md
audited_at: 2026-09-28
findings: 6
---

# Audit: docs/spec/features/us-67-configure-screening-criteria.md

## Verified (27)

- ✓ `src/main/core/screening-criteria.ts` exists and has zero imports (file begins with a comment block, first code at `:7`).
- ✓ Nine validation messages built from bounds (`screening-criteria.ts:27-35`), including verbatim `Delta must be between 0.01 and 0.99`, `DTE must be at least 1`, `Open interest floor cannot be negative`, `Max spread must be between 1% and 50%`, `Minimum delta must be less than maximum delta`, `Minimum DTE must be less than maximum DTE`.
- ✓ Seven predicates plus `isAscending` (`screening-criteria.ts:54-98`).
- ✓ `parseNumeric` fails closed against a strict `DECIMAL_STRING` regex, no trimming (`screening-criteria.ts:24`, `:46-51`).
- ✓ `ScreeningCriteria.minIvRank: string | null` (`src/main/core/screener.ts:27`), default `null` (`:40`); `ExclusionCode` includes `'iv_rank_floor'` (`:122`).
- ✓ `iv_rank_floor` `applies` requires `criteria.minIvRank !== null && ctx.ivRank !== null` and `test` uses `.lt` (`screener.ts:285-286`).
- ✓ Reason string `IV rank <v> (<MMM d>) below <floor>` (`screener.ts:288`, `formatObservedOn` at `:184-186`).
- ✓ Registry order `price_ceiling → iv_rank_floor → earnings_in_window → dte_window → delta_unavailable → delta_band → open_interest → spread` (`screener.ts:275-336`).
- ✓ Persistence key `screening_criteria` (`src/main/services/screening-criteria.ts:30`); stored schema fields each `.default()` from `DEFAULT_SCREENING_CRITERIA` (`:43-69`).
- ✓ `getScreeningCriteria` falls back wholesale on unset/invalid JSON/schema mismatch/inverted band (`services/screening-criteria.ts:115-156`).
- ✓ Save path raises `ValidationError('deltaMax'|'dteMax', 'inverted_band', …)` after per-field `out_of_range` checks (`services/screening-criteria.ts:82-109`).
- ✓ `maxSpreadAbsolute` omitted from save input and supplied from defaults (`services/screening-criteria.ts:33`, `:166-169`; `src/renderer/src/api/screening-criteria.ts:22`).
- ✓ `screenWatchlistCandidates` uses `opts.criteria ?? getScreeningCriteria(db)` (`src/main/services/screener.ts:240`).
- ✓ `screener:get-criteria` and `screener:save-criteria` registered via `handleIpcCall` (`src/main/ipc/screener.ts:37-44`), save parses `SaveScreeningCriteriaPayloadSchema` (`:45`; schema at `src/main/schemas.ts:567`, no `maxSpreadAbsolute`).
- ✓ `screener:results` remains payload-free (`ipc/screener.ts:29`).
- ✓ Preload `getCriteria` / `saveCriteria` (`src/preload/index.ts:83-84`).
- ✓ `useScreeningCriteria` / `useSaveScreeningCriteria`; save invalidates `screenerQueryKeys.criteria` and `.results` (`src/renderer/src/hooks/useScreeningCriteria.ts:15-33`; keys at `screenerQueryKeys.ts`).
- ✓ Form uses `zodResolver` with `mode: 'onChange'` (`ScreeningCriteriaForm.tsx:261-262`); `RangeField` (`:158`) and `OptionalNumericField` (`:200`); save disabled on `!isValid` (`:447`); "Fix the highlighted fields." replaces Reset (`:450-460`); inputs `type="text"` (`:146`).
- ✓ Sheet is a 460px `SheetPanel` (`ScreeningCriteriaSheet.tsx:33`), portalled via `getSheetPortal()` (`:42`), returns `null` when closed (`:27`); `SheetPanel` defaults `width = 400` (`ui/Sheet.tsx:41`); overlay `left-[200px]` (`ui/Sheet.tsx:25`).
- ✓ `fmtCriteriaSummary` chip wording including `Earnings Exclude` / `Earnings Flag only` (`src/renderer/src/lib/screener-format.ts:44-55`).
- ✓ DOM testids `screener-criteria-strip` (`ScreenerCriteriaStrip.tsx:17`), `sheet-scrim` (`ui/Sheet.tsx:29`), `price-ceiling-off`, `iv-rank-floor-on`, `earnings-flag` (`ScreeningCriteriaForm.tsx:355,409,433`).
- ✓ Entry points gated on `isCriteriaError && criteria === undefined` (`src/renderer/src/pages/WatchlistPage.tsx:95`).
- ✓ `Screening criteria saved` banner raised by the sheet's `onSaved` (`WatchlistPage.tsx:66`, `:151-153`); empty card's **Adjust criteria** action (`BenchGrid.tsx:85`).
- ✓ `e2e/screening-criteria.spec.ts` exists with exactly 14 `it()` scenarios (`:71-341`), one per AC.
- ✓ `e2e/screener-helpers.ts` exports `PEP_PUT` (`:124`), `SBUX_PUT` (`:138`), `relaunchScreener` (`:671`).
- ✓ US-98 update: the service feeds the engine only usable IVR states via `isUsableState` (`services/screener.ts:116-118`, `:279`).
- ✓ Linked pages exist: us-57-58, us-65, us-66, us-97, us-98, `contracts/ipc-handlers.md` (entries at `:1867`, `:1885`), `schema/tables.md` (`screening_criteria` row at `:367`), `architecture/03-design-system.md`.

## Drift (6)

- ✗ Source files list cites `src/renderer/src/pages/ScreenerPage.tsx`, which does not exist — deleted in commit `152aabf` ("combined screener with watchlist", US-96). The header button, strip, sheet and saved banner now live in `src/renderer/src/pages/WatchlistPage.tsx:161-247` (header via `BenchHeader.tsx:70,99`). "What was built → Summary strip and page wiring" likewise says "`ScreenerPage` gains …". Suggested fix: add a US-96 note / repoint to `WatchlistPage.tsx`.
- ✗ Summary says "a right-hand sheet on the Screener page itself" and three entry points on that page — the Screener is no longer a separate page; the entry points are on the Watchlist bench (`WatchlistPage.tsx:172`, `:228`).
- ✗ Earnings: "the screener passes `earningsDate: null`, so the enum cannot change any outcome yet" (Summary and the "Earnings handling is persisted here and applied in US-70" ADR) is stated in present tense, but `services/screener.ts:22-23,164` now reads earnings from the earnings store (`readEarningsOrEmpty`) — US-70 has shipped. Suggested fix: frame as history or add a US-70 update note.
- ✗ "holding nine bounds" — `screening-criteria.ts:7-16` exports ten bound constants (`DELTA_MIN/MAX`, `DTE_MIN/MAX`, `OPEN_INTEREST_MIN`, `SPREAD_PERCENT_MIN/MAX`, `IV_RANK_MIN/MAX`, `SPREAD_ABSOLUTE_MIN`).
- ✗ "Two thin handlers on the existing `registerScreenerIpc({ db, getProvider })`" — signature is now `{ db, getProvider, getCurrentDate, runState }` (`src/main/ipc/screener.ts:14-24`).
- ✗ ADR "An IV rank is displayed with the day it was observed" says "`getLatestIvrByUnderlying` applies no recency bound" in present tense; no such function exists in `src/main` (the service reads via `readIvRanks`, `services/screener.ts:96`, with US-98 usability filtering). Suggested fix: past tense.

## Unverifiable (4)

- ? "Every message string is pinned verbatim by an e2e test" — partially spot-checked; not exhaustively verified for all nine messages (e.g. `PRICE_CEILING_MESSAGE`, `IV_RANK_MESSAGE`, `DTE_MAX_MESSAGE`).
- ? Zod-first `code: 'custom'` vs service `out_of_range` note — behavioural claim about `handleIpcCall` mapping; plausible but not mechanically verified.
- ? "Settings keeps broker credentials and alert defaults and never gains a screening section" — covered by e2e `:341`; not independently verified in `SettingsPage.tsx`.
- ? Rationale prose (non-transactional `appSettings.set`, no React error boundary, "four existing sheets sit on it").

## Missing files (1)

- ✗ `src/renderer/src/pages/ScreenerPage.tsx` (see Drift #1).
