# US-67 Research — Configure screening criteria

Story: `docs/epics/08-stories/US-67-configure-screening-defaults.md`
Mockup: `mockups/us-67-screening-criteria-sheet.mdx` (states `entry`, `default`, `invalid`, `optional`, `saved`)
Superseded mockup: `mockups/us-67-screening-defaults.mdx` (Settings-page placement — do not build)

---

## Current state of the code

Verified against `src/` rather than taken from the spec wiki.

| Thing                         | Where                                                                      | State                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ScreeningCriteria` type      | `src/main/core/screener.ts:18`                                             | 9 fields, all present **except an IV-rank floor**                                                           |
| `DEFAULT_SCREENING_CRITERIA`  | `src/main/core/screener.ts:30`                                             | Δ 0.20–0.30, DTE 30–45, OI 500, spread 10% / $0.10, no price ceiling, earnings `exclude`                    |
| Hard-filter registry          | `src/main/core/screener.ts:192` (`FILTERS`)                                | 7 ordered filters; **no IV-rank entry**                                                                     |
| Criteria seam into the engine | `src/main/services/screener.ts:216`                                        | `opts.criteria ?? DEFAULT_SCREENING_CRITERIA` — nothing ever passes `opts.criteria`, so defaults always win |
| `screener:results` IPC        | `src/main/ipc/screener.ts:20`                                              | No payload, calls `screenWatchlistCandidates(getProvider, db)` with no options                              |
| Earnings date into the engine | `src/main/services/screener.ts:150`                                        | Hardcoded `earningsDate: null` — the `earnings_in_window` filter can never fire                             |
| Settings key/value store      | `src/main/services/app-settings.ts`                                        | `appSettings.get/set` over the `app_settings` table — no migration needed for a new key                     |
| Alert-defaults precedent      | `src/main/services/alert-defaults.ts`, `src/main/core/alert-thresholds.ts` | Shared pure bounds module imported by the IPC schema, the DB service, **and** the renderer form schema      |
| Sheet primitives              | `src/renderer/src/components/ui/Sheet.tsx`                                 | `SheetOverlay` is `left-[200px]`; `SheetPanel` takes a `width` prop defaulting to 400                       |
| Screener page                 | `src/renderer/src/pages/ScreenerPage.tsx:50`                               | Empty card reads "…in Screener settings" with **no action** — the dangling reference US-67 removes          |
| Screener query key            | `src/renderer/src/hooks/screenerQueryKeys.ts`                              | Only `results`                                                                                              |
| E2E fake seams                | `src/main/integrations/fake-market-data.ts:59`                             | `WHEELBASE_MOCK_STOCK_QUOTES` and `WHEELBASE_MOCK_OPTION_SNAPSHOTS` both available                          |

Two gaps therefore fall inside US-67: the criteria never reach the engine, and the IV-rank floor does not exist at all.

---

## Architecture Decisions

### ADR: Screening criteria persist as one JSON document in `app_settings`, not nine scalar rows

- **Decision:** Store the whole criteria object under a single `app_settings` key, `screening_criteria`, holding a JSON document. Read it back through a Zod schema whose every field carries `.default()` from `DEFAULT_SCREENING_CRITERIA`, so a missing key, a corrupt value, or a document written before a field existed all resolve to the shipped default rather than to `undefined`.
- **Why:** `appSettings.set` writes one key per call and is not wrapped in a transaction, so nine sequential writes can half-apply — leaving the screener running a delta band from one save and a DTE window from another, which is worse than either save losing entirely. The criteria are also a single cohesive object: they always travel together, are validated by one Zod schema on both sides of IPC, and are handed to the engine as one value. Nine keys would need nine independent parse-and-fallback ladders (the `toNumberOr` shape repeated nine times in `alert-defaults.ts`) for no benefit.
- **Alternatives considered:** **One key per field**, mirroring `alert-defaults.ts` — rejected for the partial-write hazard above; that precedent covers two scalars where atomicity across them does not matter. **A dedicated `screening_criteria` table with typed columns** — rejected as needless ceremony and a migration for a single always-one-row record, the same reasoning the [configurable-alert-thresholds ADR](../../docs/spec/architecture/02-adrs/configurable-alert-thresholds.md) used to stay in `app_settings`.

### ADR: The IV-rank floor is a hard filter that never excludes an unknown IV rank

- **Decision:** Add `minIvRank: string | null` to `ScreeningCriteria` (`null` = disabled, the shipped default) and an `iv_rank_floor` entry to the `FILTERS` registry, placed immediately after `price_ceiling` in the ticker-level group. Its `applies` predicate requires **both** `criteria.minIvRank !== null` **and** `ctx.ivRank !== null`, so a candidate whose IV rank is unknown passes the floor untouched even when the floor is on.
- **Why:** The AC — "when the trader enables the floor at 30, candidates below IVR 30 drop out of the ranked list" — is exclusion behaviour, so it belongs in the ordered registry, not in the scorer. Letting an unknown IVR fail a floor it was never measured against would contradict the standing US-65 acceptance criterion "Missing IV rank does not exclude a candidate" and would silently empty the results whenever the Barchart scrape lags. `applies`-returns-false is exactly the escape hatch the registry already gives `price_ceiling` for a missing underlying price.
- **Alternatives considered:** **Treating unknown IVR as failing the floor** — rejected; it converts a data gap into a trading verdict and regresses a shipped US-65 AC. **Scoring IV rank into `yieldPerDelta` instead of filtering** — rejected; the AC says candidates "drop out", and folding IVR into the rank score would silently re-weight every existing ranking. **Placing the filter after `delta_band`** — rejected; the registry is ordered whole-ticker disqualifiers first, and IV rank is a property of the underlying, not of the strike.

### ADR: The screener service resolves persisted criteria; the IPC handler stays payload-free

- **Decision:** `screenWatchlistCandidates` changes its default from `opts.criteria ?? DEFAULT_SCREENING_CRITERIA` to `opts.criteria ?? getScreeningCriteria(db)`. `screener:results` keeps its no-payload signature and its one-line handler body unchanged.
- **Why:** The [thin-IPC-handler rule](../../CLAUDE.md) forbids reading settings and branching inside a handler file. Resolving inside the service also means every caller of the screener — the IPC handler today, a scheduled refresh or the US-68 promote pre-fill tomorrow — gets the trader's criteria automatically instead of each remembering to fetch and pass them, which is how the settings, the results, and the promote pre-fill would drift apart.
- **Alternatives considered:** **The handler fetching criteria and passing them in** — rejected as business logic in the handler. **A `criteria` field on the `screener:results` request payload** — rejected; it makes the renderer the authority on what the engine screens with, so a stale renderer cache could screen against criteria that are not the persisted ones.

### ADR: `maxSpreadAbsolute` is persisted but not editable, and is omitted from the save payload

- **Decision:** The save payload is `Omit<ScreeningCriteria, 'maxSpreadAbsolute'>`. The service composes the stored document by taking `maxSpreadAbsolute` from `DEFAULT_SCREENING_CRITERIA`. The read path returns the full `ScreeningCriteria`.
- **Why:** The mockup exposes no input for it — the absolute spread tolerance appears only as caption text on the Max bid-ask spread field ("a tight absolute spread (≤ $0.10) also passes"). A payload field with no control is a field the renderer must invent a value for, and an invented value is the drift the single-criteria-object rule exists to prevent. Omitting it makes the contract state plainly which criteria the sheet owns.
- **Alternatives considered:** **Round-tripping it as a hidden form value** — rejected; it lets a renderer bug write a bogus spread tolerance the trader never chose and cannot see. **Adding an input for it** — rejected; out of scope, and the mockup deliberately folds it into the percentage field's caption.

### ADR: Earnings handling is persisted here and applied in US-70

- **Decision:** US-67 ships the Exclude / Flag-only control and persists the enum. It does **not** wire an earnings calendar into `src/main/services/screener.ts`, and it does not render an earnings warning. The story's earnings AC was narrowed to persistence (setting round-trips, summary strip reads "Earnings Flag only", reopened sheet shows the selection).
- **Why:** `src/main/services/screener.ts:150` passes `earningsDate: null` unconditionally, so the enum cannot change any outcome no matter what it holds. Making it change one means fetching earnings dates and rendering a warning — which is the entirety of US-70, whose ACs already cover exclude, flag-with-warning, no-warning-after-expiry, unknown-date caution, and calendar outage, and which already lists US-67 as its toggle dependency. Building it twice would leave US-70 empty or the two stories fighting over the same code.
- **Alternatives considered:** **Wiring `fetchNextEarningsDates` (`src/main/integrations/finnhub-earnings.ts:126`, already used by US-56's alert rule) into the screener now** — viable and cheap, but it is US-70's job and was explicitly declined. **Leaving the story's original behavioural AC in place and using the not-e2e-testable escape hatch** — rejected; the escape hatch is for non-observable invariants, and this is observable UI behaviour that simply belongs to another story. The story file now records the deferral so the gap is not mistaken for an oversight.

### ADR: Save & re-screen invalidates both the criteria and the results queries

- **Decision:** The save mutation's `onSuccess` invalidates `screenerQueryKeys.criteria` **and** `screenerQueryKeys.results`. Both keys live in the existing `src/renderer/src/hooks/screenerQueryKeys.ts`; no criteria key is added to `settingsQueryKeys`.
- **Why:** "Saving re-screens" is the behavioural payoff of moving the form onto the Screener — invalidating `results` is what makes the table behind the sheet refresh. Invalidating `criteria` too keeps the summary strip and a reopened sheet showing what was actually persisted rather than what the form last held. Keying both under `screener` matches the surface that owns them; the criteria are not a Settings concern, and the story is explicit that Settings never gains a screening section.
- **Alternatives considered:** **Writing the mutation result straight into the cache with `setQueryData`** — rejected; `results` has to be refetched from the provider regardless, so a partial cache write only adds a second code path that can disagree with the server. **Putting the criteria under `settingsQueryKeys`** — rejected; it would re-couple the criteria to the Settings surface the story is deliberately moving them off.

### ADR: Renderer form bounds import from a shared pure core module

- **Decision:** New `src/main/core/screening-criteria.ts` holds every bound, message, and range predicate, plus the two cross-field predicates. It is imported by `src/main/schemas.ts` (IPC validation), `src/main/services/screening-criteria.ts` (persistence), and `src/renderer/src/schemas/screening-criteria.ts` (form validation).
- **Why:** This is the established shape — `src/main/core/alert-thresholds.ts` is imported by exactly those three layers today, and its header comment states the intent ("Change a bound here and all five call sites move together"). Every AC message string is pinned verbatim by an e2e test, so a second copy of `Delta must be between 0.01 and 0.99` in the renderer is a guaranteed future drift. Pure constants and predicates satisfy the no-I/O rule for `src/main/core/`.
- **Alternatives considered:** **Duplicating bounds in the renderer schema** — rejected for the drift above. **Deriving the renderer schema from the IPC Zod schema** — rejected; the form works in strings (an in-progress `"0."` must be allowed to exist while typing) whereas the IPC payload is validated post-parse, so the two schemas genuinely differ in shape even though their bounds must not.

### ADR: The criteria sheet is a 460px `SheetPanel`, not a new overlay primitive

- **Decision:** Build `ScreeningCriteriaSheet` from the existing `SheetOverlay` / `SheetPanel` / `SheetHeader` / `SheetBody` / `SheetFooter`, portalled via `getSheetPortal()`, passing `width={460}` to `SheetPanel`.
- **Why:** `SheetPanel` already takes a `width` prop (`src/renderer/src/components/ui/Sheet.tsx:34`) defaulting to 400, so the mockup's 460px needs no new primitive and no override of the component's styling. `SheetOverlay` is already `left-[200px]`, which is what satisfies the AC "the sidebar navigation remains visible and clickable" for free — the same reason `AssignmentSheet`, `RollCspSheet`, `CallAwaySheet`, and `CloseCcEarlySheet` all sit on it.
- **Alternatives considered:** **A bespoke wider overlay** — rejected; it would re-derive the sidebar inset and the scrim-dismiss behaviour that the shared primitive already gets right, and it would drift from four existing sheets.

---

## Open Questions

None. The one genuinely ambiguous item — how much earnings behaviour US-67 owns — was raised before planning and resolved by the story owner: all of it moves to US-70. `docs/epics/08-stories/US-67-configure-screening-defaults.md` has been updated to match (narrowed earnings AC, plus Technical Notes entries recording the deferral and the missing IV-rank filter).
