# Research: US-69 — Edit a watchlist entry

Story of record: Linear **OPT-5** (`US-69: Edit a watchlist entry`, Epic 08 — Candidate
Screener). The markdown at `docs/epics/08-stories/US-69-watchlist-ticker-notes.md` is the
archived source; where they differ, Linear wins. Both were reconciled against US-96 on
2026-09-13, so every outcome is stated against the **card + detail panel** bench, not the
retired table.

## What already exists (verified against `src/`, not just the spec)

| Layer          | Present today                                                                                                                                                                                                                                                                                                                                                                      | Gap for US-69                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Schema (main)  | `WatchlistAddPayloadSchema`, `WatchlistRemovePayloadSchema`, `WatchlistEntryRecord` in `src/main/schemas.ts:523-546`. `notes: z.string().trim().max(500).optional()` with Zod's default message.                                                                                                                                                                                   | `WatchlistUpdatePayloadSchema` + `WatchlistUpdatePayload` type.                                                                  |
| Service        | `src/main/services/watchlist.ts`: `addWatchlistEntry`, `listWatchlist`, `removeWatchlistEntry`. Remove of an absent ticker throws `ValidationError('ticker','not_found','<T> is not on the watchlist')` (the spec page's "no-op" claim is stale — the test at `watchlist.test.ts:150` pins the throw).                                                                             | `updateWatchlistEntry`.                                                                                                          |
| IPC            | `src/main/ipc/watchlist.ts` registers `watchlist:snapshot`, `watchlist:add`, `watchlist:remove` via `handleIpcCall`. `watchlist:list` is retired (US-96).                                                                                                                                                                                                                          | `watchlist:update` channel.                                                                                                      |
| Preload        | `src/preload/index.ts:75-79` (`snapshot`, `add`, `remove`); `index.d.ts:374-394` (`IpcWatchlistAddPayload`, `IpcWatchlistEntry`, `IpcWatchlistAddResult`, `IpcWatchlistRemoveResult`).                                                                                                                                                                                             | `update` bridge + `IpcWatchlistUpdatePayload` / `IpcWatchlistUpdateResult`.                                                      |
| Renderer API   | `src/renderer/src/api/watchlist.ts`: `addWatchlistEntry`, `removeWatchlistEntry`, `getWatchlistSnapshot`; `throwMappedIpcErrors` → 400 `ApiError`.                                                                                                                                                                                                                                 | `updateWatchlistEntry` + `UpdateWatchlistPayload`.                                                                               |
| Hooks          | `useAddToWatchlist`, `useRemoveFromWatchlist` each invalidate `watchlistQueryKeys.all`, `watchlistQueryKeys.snapshot`, `screenerQueryKeys.results` on success.                                                                                                                                                                                                                     | `useUpdateWatchlistEntry` with the identical trio.                                                                               |
| Form schema    | `src/renderer/src/schemas/watchlist.ts` `watchlistEntrySchema` — `thesis: z.string().trim().max(500).optional()` (**no custom message**); `.default(false)` booleans make input ≠ output.                                                                                                                                                                                          | Exact message `Note must be 500 characters or fewer`.                                                                            |
| Form           | `src/renderer/src/components/WatchlistAddForm.tsx` — RHF + `zodResolver`, 3-generic `useForm`, `showOwnBelow`/`showHighIv` toggles, IVR presets, thesis textarea with **`maxLength={500}`** and `NN / 500` counter, `watchlist-add-submit`, `reset()` in the mutation's per-call `onSuccess`.                                                                                      | Edit mode: seeded defaults, fixed ticker, `Save changes` + `Cancel`, update mutation, over-length reachable.                     |
| Detail panel   | `BenchDetail.tsx` — header (ticker, verdict copy, `Meets criteria`/`Watching` badge), stat grid, `ReadingNote`, **Your thesis** (`bench-detail-thesis`, `No thesis yet.` fallback), **Entry conditions** (`GateBadge` per gate: `bench-gate-price` / `bench-gate-iv` / `bench-gate-earnings`, `watchlist-tag` chips for `core`), earnings line, put card / waiting box. Read-only. | An edit affordance, and a way to swap the read view for the form.                                                                |
| Grid / page    | `BenchGrid.tsx` owns `current` selection fallback and renders `<BenchDetail>` inside the sticky `bench-detail-panel`. `WatchlistPage.tsx` owns `addOpen`, `selected`, sheet state; renders `WatchlistAddForm` when the add toggle is open or the bench is empty.                                                                                                                   | `editing` state, one-form-at-a-time rule, wiring `onEdit` / `onEditDone`.                                                        |
| Promote        | `WatchlistPage.handleReview` reads `rows.find(...).entry.notes` into `buildPromoteSearch` → `/new?…` → `#thesis` pre-filled. Pinned by `e2e/watchlist-bench.spec.ts` "Review trade hands off to the pre-filled new-wheel form".                                                                                                                                                    | Nothing — the AC is a regression guard.                                                                                          |
| Verdict engine | `src/main/core/watchlist-signal.ts` (pure) judges the stored conditions inside `watchlist:snapshot`; renderer `lib/bench.ts` joins with `screener:results`.                                                                                                                                                                                                                        | Nothing — a saved edit only has to invalidate `['watchlist']` + `['screener','results']` and the bench re-judges on the refetch. |
| E2E seams      | `e2e/screener-helpers.ts` `launchScreener(dbPath, opts)` seeds tickers, notes and conditions through the real `watchlist.add`, IV ranks through the real collector, quotes/puts/earnings through the fake provider. `selectCard`, `reloadBench`, `waitForBenchCard`, `promoteCard`, `cardReason`.                                                                                  | A US-69 suite plus two tiny driver helpers (open edit, save edit).                                                               |

## Mockup findings

No `mockups/us-69-*.mdx` exists. Two mockups apply:

- **`mockups/us-63-watchlist-manager.mdx`, `edit` state** — `AddEntryPanel` with `mode='edit'`:
  section label `Edit AAPL`; the ticker rendered as a fixed `TickerCell` followed by the mono
  caption `· ticker fixed` (no input); the `Entry conditions` block unchanged (pre-filled
  `Would own below` row with `$ 170.00`, `Wait for high IV` row with `IVR ≥` + 30/50/70
  presets, `Post-earnings only` / `Core holding` chips reflecting the saved flags); the thesis
  textarea pre-filled with the `NN / 500` counter; footer buttons **Cancel** (ghost, mono) and
  **Save changes** (gold-dim primary). Annotation: _"Editing reuses the add form — change any
  condition or the thesis in place. The ticker stays fixed; to watch a different name, add a
  new entry."_ The `list` state's "condition tags are clickable and open the entry in the edit
  form" predates US-96 and is superseded by the story's reconciliation note.
- **`mockups/us-96-combined-watchlist-b-focus.mdx`** — the shipped bench. The right-hand
  `StockDetail` is a sticky card; its `AddStock` panel notes _"Entry-condition editing is a
  separate interaction in this concept."_ That is the interaction this story supplies. The
  story explicitly asks that the edit open **from the detail panel**.

## Unknowns investigated

### 1. Where does the edit form render?

The story fixes the entry point (the detail panel) but not the surface. Candidates:

- **(a) Inline in the detail panel** — the panel's content swaps from `BenchDetail` to the
  shared entry form for the selected stock, and swaps back on save/cancel.
- **(b) A right-side sheet** — `ScreeningCriteriaSheet` pattern (`SheetOverlay` + `SheetPanel`
  via `createPortal`).
- **(c) The page-top add form in edit mode** — reuse the `+ Add stock` slot.

Chosen: **(a)**. See ADR below. (c) puts the form far from what the trader is reading and
scrolls the bench; (b) is a heavier surface than a five-field form warrants and the sheet's
scrim would hide the very gate badges the trader is reacting to. The panel column is
`minmax(420px, 1.15fr)` at `xl`, wider than the form's widest row (the IVR row with presets),
and stacks under the cards below `xl` exactly as the panel already does.

### 2. Two forms with the same `id`s on one page

`WatchlistAddForm` registers `#ticker`, `#ownBelowPrice`, `#ivrTrigger`, `#thesis`. The add
form can be open (`addOpen`) while a stock is selected. Mounting an edit copy alongside it
would duplicate every `id` — invalid HTML, broken `<label htmlFor>`, and ambiguous e2e
selectors. Resolved by a **one entry form at a time** rule on the page: opening edit closes
the add form, opening add leaves edit. When `rows.length === 0` forces the add form open there
is nothing to edit, so the rule never fights that branch.

### 3. The over-length thesis is currently unreachable

The textarea carries `maxLength={500}`, so a trader cannot type or paste a 501st character;
the schema's `.max(500)` can never fire and the AC's error message can never appear.
Playwright's `fill` also honours `maxlength` in Chromium, so the AC could not even be tested.
Resolved by **dropping the hard cap** and letting the Zod resolver reject with the exact AC
message; the `NN / 500` counter turns `text-wb-red` past 500 so the trader sees why before
submitting. The change lands in the shared form, so add mode gets the same behaviour — the
US-63 AC set never asserted truncation, only the 500 bound.

### 4. Full replacement vs. patch semantics for `watchlist:update`

The form always submits every editable field, and "clear the thesis" / "remove a condition"
are the same operation as "set it to nothing". A **full-replacement** payload (`PUT`-like)
keeps the service a single `UPDATE … SET` with no per-field presence checks, and mirrors how
`addWatchlistEntry` already maps `undefined → null`. `notes` accepts `string | null |
undefined` so a caller can be explicit; all three of `undefined`, `null` and `''` (after
`.trim()`) store `NULL`. `ticker` is the row key and is **not** updatable — renaming is
remove + re-add, per the story.

### 5. How the edit reaches the bench

Nothing new: `useAddToWatchlist` / `useRemoveFromWatchlist` invalidate `['watchlist']`,
`['watchlist','snapshot']` and `['screener','results']`. The update hook does the same, the
snapshot refetches, `watchlist:snapshot` re-runs `evaluateEntry` over the new stored
conditions, `lib/bench.ts` rebuilds the sections, and the selected stock stays selected
because `selected` is a ticker, not an index. No manual refresh, no new engine code.

### 6. Seeding the edit form from a stored entry

`ownBelowPrice` is a 4dp TEXT (`'170.0000'`); the form's price field is a plain decimal
string validated by `MONEY_PATTERN`. Seed as `Number(value).toFixed(2)` → `'170.00'`, which
is what the mockup shows (`target.toFixed(2)`). `ivrTrigger` seeds as `String(n)`. Booleans
seed directly. `showOwnBelow` / `showHighIv` initialise from whether the entry carries the
value; because the form is mounted fresh per stock (`key={ticker}`) these are plain `useState`
initialisers — no effect, so no `react-hooks/set-state-in-effect` trip.

### 7. Error routing in edit mode

There is no `#ticker` input in edit mode, so a `ticker`-field error (`not_found` if the entry
was removed under the trader) has nowhere to bind. Route it to the form-level `ErrorAlert`
via `setError('root', …)`, which the form already does for every non-ticker field. Generic
fallback copy for edit: `Could not save the changes — please try again.`

### 8. E2E premise for "Changing a condition re-judges the bench"

The AC's Given (`AAPL` under Stocks of interest, reason `IV low`, fresh IVR 34 vs `IVR ≥ 50`)
must not also be a price scenario. Seeding `conditions: { AAPL: { ivrTrigger: 50 } }` (no
price condition) with `ivr: { AAPL: { ivr: 34, observedAt: observedSessionsAgo(0) } }` and the
default flat `$100.00` quote makes IV the only gate. `AAPL_PUT` (strike 180, Δ −0.28, OI 4200,
37 DTE) passes the default screen, so once the IV gate is met the card moves to **Meets
criteria** — which is what "re-evaluated against the bench" can be asserted as, beyond the
gate badge itself.

## Architecture Decisions

### ADR: Edit renders inline in the bench detail panel

- **Decision:** The detail panel is the edit surface. `BenchDetail` gains an **Edit** button
  (`bench-detail-edit`) in its header; while a stock is being edited, `BenchGrid` renders the
  shared entry form in place of `BenchDetail` inside the same sticky `bench-detail-panel`, and
  restores the read view on save or cancel. Selecting a different card exits edit mode.
- **Why:** The story names the detail panel as "the one place a trader already reads what they
  are about to change" — the thesis under **Your thesis** and every condition as a gate badge
  with its verdict. Swapping that panel for the form keeps the edit where the reading was,
  needs no overlay or portal, and the panel column already has the width the form needs. After
  save, the same panel shows the re-judged gates, which is the story's "re-judge, not redraw"
  point made visible.
- **Alternatives considered:** A right-side sheet (`ScreeningCriteriaSheet` pattern) — heavier
  than a five-field form needs, and its scrim would cover the gate badges the trader is
  reacting to. Reusing the page-top add slot in edit mode — moves the form away from the
  panel and above the fold, scrolling the bench out of view. Editing conditions on the card —
  rejected by the story itself ("the card has no room").

### ADR: One shared `WatchlistEntryForm` with an optional `entry` prop

- **Decision:** Rename `WatchlistAddForm` to `WatchlistEntryForm`. An `entry?: WatchlistEntry`
  prop selects the mode: absent → add (unchanged behaviour, selectors and copy); present →
  edit (ticker fixed, defaults seeded from the entry, **Save changes** + **Cancel**, update
  mutation). Both mutation hooks are called unconditionally; `isEdit` picks which one
  `onSubmit` fires.
- **Why:** The story and both mockups say the edit form _is_ the add form with the ticker
  fixed. One component means one schema, one condition-row implementation, one preset list,
  one counter, and no drift between the two modes. Making the mode a data prop rather than a
  string flag lets the type system carry the seeded defaults.
- **Alternatives considered:** A separate `WatchlistEditForm` — duplicates ~150 lines of
  condition UI that would drift. A `mode: 'add' | 'edit'` string plus separate `initialValues`
  prop — two props that must agree, where one nullable prop cannot disagree with itself.

### ADR: One entry form mounted at a time

- **Decision:** `WatchlistPage` enforces that the add form and the edit form are never mounted
  together: `onEdit` sets `editing` and clears `addOpen`; toggling add open clears `editing`;
  selecting another card clears `editing`; removing the edited ticker clears `editing`.
- **Why:** The form registers fixed `id`s (`thesis`, `ownBelowPrice`, `ivrTrigger`) that the
  `<Field htmlFor>` labels and the e2e suites depend on. Two mounted copies would duplicate
  them. Prefixing ids per instance would work but spreads a page-level concern into every
  input and every selector; the page rule is one line per transition and keeps the selectors
  every existing suite uses.
- **Alternatives considered:** `idPrefix` prop on the form; `useId()` per instance (breaks
  the `#thesis` selectors in `e2e/watchlist.spec.ts` and `e2e/watchlist-bench.spec.ts`).

### ADR: `watchlist:update` is a full-replacement write keyed by ticker

- **Decision:** `WatchlistUpdatePayloadSchema` carries `ticker` plus every editable field
  (`notes`, `ownBelowPrice`, `ivrTrigger`, `postEarningsOnly`, `coreHolding`). The service
  runs one `UPDATE watchlist SET … WHERE ticker = ?`; `changes === 0` throws
  `ValidationError('ticker', 'not_found', '<T> is not on the watchlist')` (the same error
  `removeWatchlistEntry` raises); success re-reads the row and returns a `WatchlistEntryRecord`.
  The editable field set is extracted into a shared `WatchlistEntryFieldsSchema` that both the
  add and update payload schemas `.extend({ ticker })`.
- **Why:** The form always submits the whole entry, and clearing a value is the same write as
  setting one. Patch semantics would add presence checks and a second code path for no caller.
  Sharing the field schema keeps the 500-char bound and the IVR 0–100 range defined once.
  `ticker` stays immutable because it is the primary key and the entry's identity (US-63 ADR).
- **Alternatives considered:** Patch (`Partial<>`) payload — more branches, no consumer.
  Aliasing `WatchlistUpdatePayloadSchema = WatchlistAddPayloadSchema` — same shape, but hides
  the distinct contract and its distinct error (`not_found` vs `duplicate`). `RETURNING *` on
  the `UPDATE` — works on the bundled SQLite but a plain `SELECT` after the write reuses the
  existing `mapRow` and reads identically to `list`.

### ADR: Drop the textarea `maxLength` and validate the 500-char bound in Zod

- **Decision:** Remove `maxLength={500}` from the thesis textarea. The renderer schema's
  `thesis` becomes `.max(500, 'Note must be 500 characters or fewer')`; the main-process
  `notes` gets the same message. The `NN / 500` counter renders `text-wb-red` once the count
  exceeds 500.
- **Why:** With the hard cap the AC "Reject an over-length thesis" is unreachable — the error
  can never appear because the 501st character can never be entered, and Playwright's `fill`
  honours `maxlength`. Validation-with-a-message is the project's form pattern (RHF + Zod
  resolver); silent truncation is not.
- **Alternatives considered:** Keep the cap and assert truncation — contradicts the AC's
  exact message. Cap at a higher number — arbitrary, and still silent truncation.

### ADR: Update invalidates the same three query keys as add and remove

- **Decision:** `useUpdateWatchlistEntry` invalidates `watchlistQueryKeys.all`,
  `watchlistQueryKeys.snapshot` and `screenerQueryKeys.results` on success — identical to the
  add and remove hooks. The Refactor phase may extract the shared `onSuccess` into a
  `useWatchlistMutation(mutationFn)` helper once three hooks share it verbatim.
- **Why:** The story's third reconciliation point: an edit changes the inputs to the pure
  verdict engine, so the snapshot must be re-read and the screener re-run for a stock to move
  between sections. The screener key is invalidated even though conditions are not a screener
  input, because `lib/bench.ts` joins the two and a Meets-criteria card needs a fresh rank.
- **Alternatives considered:** Invalidating only the snapshot — the card could show a met gate
  with a stale rank. `setQueryData` with the returned entry — the verdict is computed in the
  main process, so the renderer cannot patch it locally.

## Open Questions

None. The one judgement call — the edit surface — is recorded above as an ADR with the
alternatives; it is a recommendation the user can overturn before `/plan-tasks` without any
other artifact changing.
