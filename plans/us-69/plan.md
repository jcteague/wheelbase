---
story: us-69
kind: feature
parent: null
topics: [ipc-handlers, zod-schemas, market-data]
status: planned
---

# Implementation Plan: US-69 — Edit a watchlist entry

## Summary

Let a trader change an existing watchlist entry's thesis and entry conditions from the bench's
stock detail panel, with the ticker fixed. The work adds one write channel (`watchlist:update`
→ `updateWatchlistEntry`), generalises `WatchlistAddForm` into a shared `WatchlistEntryForm`
whose edit mode seeds from the entry, and swaps the sticky detail panel between the read view
and that form. Done means: an **Edit** button on the detail panel opens the pre-filled form in
place, **Save changes** persists through IPC and invalidates the snapshot and screener so the
bench re-judges the stock without a manual refresh, **Cancel** discards, an over-500-character
note is rejected with the AC's exact message, and one AC-driven e2e suite is green alongside
the untouched US-63 and US-96 suites.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** Linear **OPT-5** — `US-69: Edit a watchlist entry`
  (https://linear.app/optionswheel/issue/OPT-5). Archived markdown:
  `docs/epics/08-stories/US-69-watchlist-ticker-notes.md` (Linear wins on any difference).
- **Research & Design Decisions:** `plans/us-69/research.md`
- **Data Model & Selection Logic:** `plans/us-69/data-model.md`
- **API Contract(s):** `plans/us-69/contracts/watchlist-update.md`
- **Quickstart & Verification:** `plans/us-69/quickstart.md`
- **Mockups:** `mockups/us-63-watchlist-manager.mdx` (`edit` state — the form itself);
  `mockups/us-96-combined-watchlist-b-focus.mdx` (the detail panel the edit opens from). No
  US-69-specific mockup exists; the edit surface decision is the first ADR in `research.md`.

## Prerequisites

None — all required schema and infrastructure already exists:

- `watchlist` table (`migrations/012_create_watchlist.sql`) with every editable column.
- `watchlist:add` / `watchlist:remove` / `watchlist:snapshot` handlers, `handleIpcCall`,
  `WatchlistTickerSchema`, `WatchlistEntryRecord` (US-63, US-96).
- `WatchlistAddForm` (RHF + `zodResolver(watchlistEntrySchema)`, 3-generic `useForm`) and
  `watchlistQueryKeys` / `screenerQueryKeys` (US-63, US-96).
- `BenchDetail`, `BenchGrid`, `WatchlistPage` with `selected` state; `GateBadge` rendering
  `bench-gate-price` / `bench-gate-iv` / `bench-gate-earnings` (US-96).
- E2E seams: `launchScreener`, `selectCard`, `reloadBench`, `waitForBenchCard`,
  `promoteCard`, `cardReason` in `e2e/screener-helpers.ts`; `observedSessionsAgo` in
  `e2e/trading-day-fixtures.ts`.

## Implementation Areas

### 1. Main-process payload schema

**Files to create or modify:**

- `src/main/schemas.ts` — extract `WatchlistEntryFieldsSchema`; compose `WatchlistAddPayloadSchema`
  and a new `WatchlistUpdatePayloadSchema` from it; export `WatchlistUpdatePayload`.
- `src/main/schemas.test.ts` — new `describe('WatchlistUpdatePayloadSchema')`.

**Red — tests to write:**

- `schemas.test.ts`: parses a full payload `{ ticker: 'aapl', notes: 'x', ownBelowPrice: 165, ivrTrigger: 50, postEarningsOnly: true, coreHolding: false }` and uppercases the ticker to `AAPL`.
- `schemas.test.ts`: accepts `notes: null`, `ownBelowPrice: null`, `ivrTrigger: null` (a cleared entry) and defaults omitted booleans to `false`.
- `schemas.test.ts`: rejects a 501-character `notes` with issue `path[0] === 'notes'` and message `Note must be 500 characters or fewer`.
- `schemas.test.ts`: rejects `ticker: '12345'` (message `Enter a valid ticker symbol`), `ownBelowPrice: 0`, `ivrTrigger: 101`, `ivrTrigger: 50.5`.
- `schemas.test.ts` (existing add block, regression): `WatchlistAddPayloadSchema` still parses `{ ticker: 'AAPL' }` alone and still rejects a 501-char `notes` — now with the same message.

**Green — implementation:**

- `WatchlistEntryFieldsSchema = z.object({ notes: z.string().trim().max(500, 'Note must be 500 characters or fewer').nullable().optional(), ownBelowPrice: z.number().positive().nullable().optional(), ivrTrigger: z.number().int().min(0).max(100).nullable().optional(), postEarningsOnly: z.boolean().optional().default(false), coreHolding: z.boolean().optional().default(false) })` in `src/main/schemas.ts`, immediately above the add schema.
- `WatchlistAddPayloadSchema = WatchlistEntryFieldsSchema.extend({ ticker: WatchlistTickerSchema })`; `WatchlistUpdatePayloadSchema` identical in shape; `export type WatchlistUpdatePayload = z.infer<typeof WatchlistUpdatePayloadSchema>` (field shapes per `plans/us-69/data-model.md` → "WatchlistUpdatePayload").

**Refactor — cleanup to consider:**

- `WatchlistAddPayload['notes']` now admits `null`; confirm `addWatchlistEntry`'s `payload.notes ?? null` still type-checks and no other add caller assumed `string | undefined`.

**Acceptance criteria covered:**

- "Reject an over-length thesis" (main-process defence of the 500-char bound; the renderer copy of the rule is Area 5).

### 2. Service: `updateWatchlistEntry`

**Files to create or modify:**

- `src/main/services/watchlist.ts` — add `UPDATE_QUERY`, `SELECT_ONE_QUERY`, `updateWatchlistEntry`; extract `toStoredFields`.
- `src/main/services/watchlist.test.ts` — new `describe('updateWatchlistEntry')`.

**Red — tests to write:**

- `watchlist.test.ts`: after `addWatchlistEntry(AAPL, notes 'Would own below $170', ownBelowPrice 170)`, `updateWatchlistEntry(db, { ticker: 'AAPL', notes: 'Would own below $165 after the split', ownBelowPrice: 165, ivrTrigger: null, postEarningsOnly: false, coreHolding: false })` returns `{ ticker: 'AAPL', notes: 'Would own below $165 after the split', ownBelowPrice: '165.0000', ivrTrigger: null, postEarningsOnly: false, coreHolding: false, addedAt: <the original addedAt> }`.
- `watchlist.test.ts`: `addedAt` is unchanged by an update (compare to the add result) and `listWatchlist` order is unaffected when two entries exist and the older one is edited.
- `watchlist.test.ts`: `notes: null` stores `NULL` and returns `notes: null`; `notes: ''` also stores `NULL` (raw `SELECT notes … WHERE ticker = ?` is `null`).
- `watchlist.test.ts`: adding a condition — update with `ivrTrigger: 50` on an entry that had none returns `ivrTrigger: 50` and the raw row's `ivr_trigger` is `50`.
- `watchlist.test.ts`: removing a condition — update with `ivrTrigger: null` on an entry that had `50` returns `ivrTrigger: null` while `ownBelowPrice` stays `'170.0000'`.
- `watchlist.test.ts`: booleans round-trip — `postEarningsOnly: true, coreHolding: true` stores `1`/`1` and reads back `true`/`true`.
- `watchlist.test.ts`: normalises the ticker — `updateWatchlistEntry(db, { ticker: 'aapl', … })` updates the `AAPL` row.
- `watchlist.test.ts`: throws `ValidationError` with `field 'ticker'`, `code 'not_found'`, message `TSLA is not on the watchlist` when the ticker is absent, and writes nothing.

**Green — implementation:**

- `const UPDATE_QUERY = 'UPDATE watchlist SET notes = ?, own_below_price = ?, ivr_trigger = ?, post_earnings_only = ?, core_holding = ? WHERE ticker = ?'` and `const SELECT_ONE_QUERY = 'SELECT ticker, notes, own_below_price, ivr_trigger, post_earnings_only, core_holding, added_at FROM watchlist WHERE ticker = ?'` in `src/main/services/watchlist.ts`.
- `export function updateWatchlistEntry(db, payload: WatchlistUpdatePayload): WatchlistEntryRecord` — `normalizeTicker`, `logger.debug({ ticker, ownBelowPrice, ivrTrigger }, 'watchlist_update_input')`, run `UPDATE_QUERY`, throw a `ValidationError` with field `ticker`, code `not_found` and message `<TICKER> is not on the watchlist` when `result.changes === 0`, `logger.info({ ticker }, 'watchlist_entry_updated')`, return `mapRow(db.prepare(SELECT_ONE_QUERY).get(ticker))`. Storage mapping per `plans/us-69/data-model.md` → "Storage mapping".
- `toStoredFields(payload)` → `{ notes, ownBelowPrice, ivrTrigger, postEarningsOnly: 0|1, coreHolding: 0|1 }` with `notes` normalising `undefined | null | ''` → `null`; used by both `addWatchlistEntry` and `updateWatchlistEntry`.

**Refactor — cleanup to consider:**

- Confirm `addWatchlistEntry` after the extraction still returns the same literal shape its tests pin (it builds the return value by hand rather than re-selecting; keep that unless the tests are also simplified).
- Update the file's header comment (`// [US-63] Watchlist service — add / list / remove`) to include update.

**Acceptance criteria covered:**

- "Edit the thesis text" (persistence), "Clear the thesis", "Change a condition value", "Add a condition to an existing entry", "Remove a condition", "The ticker cannot be changed in the edit form" (ticker is the `WHERE` key, never a `SET` column).

### 3. IPC channel `watchlist:update` and preload bridge

**Files to create or modify:**

- `src/main/ipc/watchlist.ts` — register `watchlist:update`.
- `src/main/ipc/watchlist.test.ts` — add `updateWatchlistEntry` to the service mock; three new cases.
- `src/preload/index.ts` — `update: (payload: unknown) => invoke('watchlist:update', payload)`.
- `src/preload/index.d.ts` — `IpcWatchlistUpdatePayload`, `IpcWatchlistUpdateResult`, `update` on the `watchlist` namespace.

**Red — tests to write:**

- `ipc/watchlist.test.ts`: `watchlist:update` parses the payload (ticker `'aapl'` → `'AAPL'`) and returns `{ ok: true, entry: SAMPLE_ENTRY }` having called `updateWatchlistEntry(db, expect.objectContaining({ ticker: 'AAPL', notes: 'x' }))`.
- `ipc/watchlist.test.ts`: `watchlist:update` maps a service `ValidationError('ticker','not_found','AAPL is not on the watchlist')` to `{ ok: false, errors: [{ field: 'ticker', code: 'not_found', message: 'AAPL is not on the watchlist' }] }`.
- `ipc/watchlist.test.ts`: `watchlist:update` with a 501-char `notes` returns `{ ok: false, errors: [expect.objectContaining({ field: 'notes', message: 'Note must be 500 characters or fewer' })] }` and never calls the service.

**Green — implementation:**

- `ipcMain.handle('watchlist:update', (_, payload: unknown) => handleIpcCall('watchlist_update_error', () => ({ entry: updateWatchlistEntry(db, WatchlistUpdatePayloadSchema.parse(payload)) })))` in `src/main/ipc/watchlist.ts` — thin: Zod parse + one service call, nothing else (contract: `plans/us-69/contracts/watchlist-update.md`).
- Preload: `update` bridge in `src/preload/index.ts`; in `index.d.ts` add `interface IpcWatchlistUpdatePayload { ticker: string; notes?: string | null; ownBelowPrice?: number | null; ivrTrigger?: number | null; postEarningsOnly?: boolean; coreHolding?: boolean }`, `type IpcWatchlistUpdateResult = IpcResult<{ entry: IpcWatchlistEntry }>`, and `update: (payload: IpcWatchlistUpdatePayload) => Promise<IpcWatchlistUpdateResult>` beside `add`.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency (`watchlist_update_error` matches the `watchlist_add_error` / `watchlist_remove_error` labels).

**Acceptance criteria covered:**

- Transport for every save scenario: "Edit the thesis text", "Clear the thesis", "Change a condition value", "Add a condition to an existing entry", "Remove a condition", "Changing a condition re-judges the bench".

### 4. Renderer adapter and `useUpdateWatchlistEntry`

**Files to create or modify:**

- `src/renderer/src/api/watchlist.ts` — `UpdateWatchlistPayload`, `updateWatchlistEntry`.
- `src/renderer/src/api/watchlist.test.ts` — add `update: mockUpdate` to the `window.api.watchlist` stub; two cases.
- `src/renderer/src/hooks/useUpdateWatchlistEntry.ts` — new.
- `src/renderer/src/hooks/useUpdateWatchlistEntry.test.ts` — new.

**Red — tests to write:**

- `api/watchlist.test.ts` → `describe('updateWatchlistEntry')`: resolves to the returned entry on `{ ok: true, entry }` and forwards the full payload `{ ticker: 'AAPL', notes: 'Would own below $165 after the split', ownBelowPrice: 165, ivrTrigger: null, postEarningsOnly: false, coreHolding: false }` verbatim to `window.api.watchlist.update`.
- `api/watchlist.test.ts`: rejects with `{ status: 400, body: { detail: [{ field: 'ticker', code: 'not_found', message: 'AAPL is not on the watchlist' }] } }` on an `ok: false` envelope.
- `useUpdateWatchlistEntry.test.ts` (mirror `useAddToWatchlist.test.ts`): `mutationFn` is `updateWatchlistEntry`; `onSuccess` invalidates `['watchlist']`, `['watchlist','snapshot']` and `['screener','results']` — one `it` per key.

**Green — implementation:**

- `export type UpdateWatchlistPayload = { ticker: string; notes: string | null; ownBelowPrice: number | null; ivrTrigger: number | null; postEarningsOnly: boolean; coreHolding: boolean }` and `export async function updateWatchlistEntry(payload): Promise<WatchlistEntry>` calling `window.api.watchlist.update(payload)` and `throwMappedIpcErrors(result.errors)` on `!result.ok`, in `src/renderer/src/api/watchlist.ts` next to `addWatchlistEntry`.
- `useUpdateWatchlistEntry(): ReturnType<typeof useMutation<WatchlistEntry, ApiError, UpdateWatchlistPayload>>` in `src/renderer/src/hooks/useUpdateWatchlistEntry.ts` — `useMutation({ mutationFn: updateWatchlistEntry, onSuccess: invalidate all / snapshot / screener results })`, with a `// [US-69]` comment stating why the screener is invalidated (the bench joins the two; a stock that clears its gates needs a fresh rank).

**Refactor — cleanup to consider:**

- Three hooks (`useAddToWatchlist`, `useRemoveFromWatchlist`, `useUpdateWatchlistEntry`) now share an identical `onSuccess`. Extract `useWatchlistMutation<TData, TVariables>(mutationFn)` in `src/renderer/src/hooks/useWatchlistMutation.ts` and make each hook a one-liner, keeping their existing tests green (they assert through the captured options object, so the extraction is invisible to them).

**Acceptance criteria covered:**

- "Changing a condition re-judges the bench" (invalidation is what makes the bench re-evaluate "without a manual refresh"); the data path for every other save scenario.

### 5. Renderer form schema message

**Files to create or modify:**

- `src/renderer/src/schemas/watchlist.ts` — custom `max` message on `thesis`.
- `src/renderer/src/schemas/watchlist.test.ts` — assert the message.

**Red — tests to write:**

- `schemas/watchlist.test.ts` → existing `describe('thesis')`: the 501-character case additionally asserts `result.error.issues[0]?.message === 'Note must be 500 characters or fewer'`.

**Green — implementation:**

- `thesis: z.string().trim().max(500, 'Note must be 500 characters or fewer').optional()` in `watchlistEntrySchema` (`src/renderer/src/schemas/watchlist.ts`).

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency (the `500` literal now appears in the schema and as `THESIS_MAX_LENGTH` in the form; leave both unless the form imports a shared constant from the schema module).

**Acceptance criteria covered:**

- "Reject an over-length thesis".

### 6. Shared `WatchlistEntryForm` with edit mode

**Files to create or modify:**

- `src/renderer/src/components/WatchlistAddForm.tsx` → **rename** to `src/renderer/src/components/WatchlistEntryForm.tsx`; export `WatchlistEntryForm`; add `entry?`, `onSaved?`, `onCancel?` props; edit-mode rendering and submit.
- `src/renderer/src/components/WatchlistEntryForm.test.tsx` — new (there is no `WatchlistAddForm.test.tsx` today; page tests covered add mode through mocks).
- `src/renderer/src/pages/WatchlistPage.tsx` — update the import (behaviour unchanged here; the edit wiring is Area 9).
- `src/renderer/src/pages/WatchlistPage.test.tsx` — update any `WatchlistAddForm` reference.

**Red — tests to write:**

- `WatchlistEntryForm.test.tsx` (mock `useAddToWatchlist` and `useUpdateWatchlistEntry` to return `{ mutate, isPending: false }` spies):
  - **Add mode is unchanged:** with no `entry`, renders heading `Add to watchlist`, a `#ticker` input, no Cancel button, and submit `watchlist-add-submit` labelled `Add ticker`; submitting `NVDA` calls the add mutation's `mutate` with `{ ticker: 'NVDA', notes: undefined, … }`.
  - **Edit heading and fixed ticker:** with `entry({ ticker: 'AAPL' })`, renders heading `Edit AAPL`, an element `watchlist-entry-ticker` with text `AAPL` and the caption `· ticker fixed`, and **no** `#ticker` input (`queryByRole('textbox', { name: /ticker/i })` is null).
  - **Seeds the thesis:** `entry({ notes: 'Would own below $170' })` → `#thesis` value is `Would own below $170` and the counter reads `20 / 500`.
  - **Seeds a price condition open:** `entry({ ownBelowPrice: '170.0000' })` → the `Would own below` row is visible with `#ownBelowPrice` value `170.00`, and the `Would own below` chip is **not** rendered.
  - **Seeds an IVR condition open:** `entry({ ivrTrigger: 50 })` → `#ivrTrigger` value `50`, presets `30/50/70` rendered.
  - **Leaves an absent condition closed:** `entry({ ownBelowPrice: null, ivrTrigger: null })` → neither row rendered, both chips rendered with `+`.
  - **Seeds the flag chips:** `entry({ postEarningsOnly: true, coreHolding: true })` → both chips render `✓` (active).
  - **Edit buttons:** renders `watchlist-edit-cancel` labelled `Cancel` and `watchlist-edit-submit` labelled `Save changes` (pending label `Saving…` when the update mutation `isPending`); no `watchlist-add-submit`.
  - **Submits a full replacement:** edit `#thesis` to `Would own below $165 after the split`, `#ownBelowPrice` to `165`, click `Save changes` → update `mutate` called with `{ ticker: 'AAPL', notes: 'Would own below $165 after the split', ownBelowPrice: 165, ivrTrigger: null, postEarningsOnly: false, coreHolding: false }`; add `mutate` never called.
  - **Clearing the thesis sends null:** clear `#thesis`, save → `notes: null`.
  - **Adding a condition:** click chip `Wait for high IV`, type `50`, save → `ivrTrigger: 50`.
  - **Removing a condition:** with `entry({ ownBelowPrice: '170.0000', ivrTrigger: 50 })`, click the `Wait for high IV` row's `Remove condition` (`✕`), save → `ivrTrigger: null` and `ownBelowPrice: 170`.
  - **Over-length note is rejected client-side:** type 501 characters into `#thesis`, save → error text `Note must be 500 characters or fewer` is shown, the counter reads `501 / 500` with class `text-wb-red`, and `mutate` is not called.
  - **Success and cancel callbacks:** `mutate`'s `onSuccess` option invokes `onSaved`; clicking Cancel invokes `onCancel` and calls no mutation.
  - **Edit-mode server errors go to the form alert:** the captured `onError` with an `ApiError` carrying `[{ field: 'ticker', code: 'not_found', message: 'AAPL is not on the watchlist' }]` renders an `ErrorAlert` with that message (there is no ticker input to bind to); an `ApiError` with no detail renders `Could not save the changes — please try again.`

**Green — implementation:**

- Rename to `WatchlistEntryForm.tsx`; `type WatchlistEntryFormProps = { entry?: WatchlistEntry; onSaved?: () => void; onCancel?: () => void }`; `const isEdit = entry !== undefined`. Call both `useAddToWatchlist()` and `useUpdateWatchlistEntry()` unconditionally.
- Defaults from `entry` per `plans/us-69/data-model.md` → "Seeding defaults": `thesis: entry?.notes ?? undefined`, `ownBelowPrice: entry?.ownBelowPrice == null ? undefined : Number(entry.ownBelowPrice).toFixed(2)`, `ivrTrigger: entry?.ivrTrigger == null ? undefined : String(entry.ivrTrigger)`, booleans as stored, `ticker: entry?.ticker ?? ''`. `useState(entry?.ownBelowPrice != null)` / `useState(entry?.ivrTrigger != null)` for the row toggles.
- Header: `Edit AAPL` (ticker interpolated) when `isEdit`, else `Add to watchlist`, in the existing eyebrow style. Ticker block per the US-63 mockup `edit` state: when `isEdit`, render a `span` with `data-testid="watchlist-entry-ticker"` and classes `font-wb-mono font-bold tracking-[0.03em] text-wb-gold` holding the ticker, followed by a muted mono caption `· ticker fixed` (`font-wb-mono text-[0.66rem] text-wb-text-muted`), instead of the `Ticker` `Field` + `NumberInput`.
- Submit: `isEdit ? updateMutation.mutate({ ticker: values.ticker, notes: values.thesis || null, ownBelowPrice: values.ownBelowPrice ? parseFloat(values.ownBelowPrice) : null, ivrTrigger: values.ivrTrigger ? parseInt(values.ivrTrigger, 10) : null, postEarningsOnly: values.postEarningsOnly, coreHolding: values.coreHolding }, { onSuccess: () => onSaved?.(), onError: (e) => mapFieldErrors(e as ApiError) }) : <existing add branch>`. Mapping per `plans/us-69/data-model.md` → "Submitting (edit mode)".
- `mapFieldErrors`: route `fe.field === 'ticker'` to `setError('ticker', …)` only when `!isEdit`, otherwise to `root`; generic fallback `isEdit ? 'Could not save the changes — please try again.' : GENERIC_ADD_ERROR`.
- Thesis textarea: **remove** `maxLength={THESIS_MAX_LENGTH}`; counter class becomes `twMerge('font-wb-mono text-[0.66rem]', thesis.length > THESIS_MAX_LENGTH ? 'text-wb-red' : 'text-wb-text-muted')`.
- Footer per the mockup: when `isEdit`, `<FormButton variant="secondary" label="Cancel" onClick={onCancel} data-testid="watchlist-edit-cancel" />` then `<FormButton label="Save changes" pendingLabel="Saving…" isPending={updateMutation.isPending} data-testid="watchlist-edit-submit" aria-label="Save changes" />`; add mode keeps `Add ticker` / `watchlist-add-submit` exactly as today.
- Keep every add-mode `id` and `data-testid` (`#ticker`, `#thesis`, `#ownBelowPrice`, `#ivrTrigger`, `watchlist-add-submit`, `button:has-text("Would own below")`, `button:has-text("Wait for high IV")`) — `e2e/watchlist.spec.ts` and `e2e/watchlist-bench.spec.ts` drive them.

**Refactor — cleanup to consider:**

- The two `mutate` branches share the string→number mapping; a small `toConditionValues(values)` returning `{ ownBelowPrice, ivrTrigger }` (nullable) removes the duplication — add mode maps `null → undefined` at the call site.
- Update the file's header comments and the `// Display-only in US-63 (click-to-edit is US-69)` note in `src/renderer/src/lib/watchlistConditionTags.ts`.

**Acceptance criteria covered:**

- "The ticker cannot be changed in the edit form", "Reject an over-length thesis", and the form half of "Edit the thesis text", "Clear the thesis", "Change a condition value", "Add a condition to an existing entry", "Remove a condition".

### 7. `BenchDetail` edit affordance

**Files to create or modify:**

- `src/renderer/src/components/BenchDetail.tsx` — `onEdit` prop and an **Edit** button.
- `src/renderer/src/components/BenchDetail.test.tsx` — new `describe('editing')`; add `onEdit={noop}` to every existing render.

**Red — tests to write:**

- `BenchDetail.test.tsx`: renders a button `bench-detail-edit` with accessible name `Edit thesis and conditions` (visible label `Edit`) in the header, for both `meets()` and `waiting()` stocks.
- `BenchDetail.test.tsx`: clicking it calls `onEdit` once; it does not call `onReview`.

**Green — implementation:**

- `onEdit: () => void` added to `BenchDetailProps`. In the header's right-hand cluster (beside the `Meets criteria` / `Watching` `Badge`), render `<Button data-testid="bench-detail-edit" size="sm" variant="outline" aria-label="Edit thesis and conditions" onClick={onEdit} className="font-wb-mono border-wb-border bg-wb-bg-elevated text-wb-text-secondary">Edit</Button>` — the same header-button treatment `BenchHeader` uses, so the panel's one action reads like the page's.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency (the header-button class string now lives in `BenchHeader` and `BenchDetail`; hoist to a shared constant only if a third use appears).

**Acceptance criteria covered:**

- "The edit is opened from the stock detail panel".

### 8. `BenchGrid` swaps the panel between read view and form

**Files to create or modify:**

- `src/renderer/src/components/BenchGrid.tsx` — `editing`, `onEdit`, `onEditDone` props; conditional panel content.
- `src/renderer/src/components/BenchGrid.test.tsx` — new (mock `./WatchlistEntryForm` and `./BenchDetail` to light stubs that expose their props).

**Red — tests to write:**

- `BenchGrid.test.tsx`: with `editing: null` and a selected stock, the panel renders `BenchDetail` for it and not the form.
- `BenchGrid.test.tsx`: with `editing === current.ticker`, the panel renders `WatchlistEntryForm` with `entry` equal to `current.row.entry` and no `BenchDetail`; the `bench-detail-panel` test id is still present.
- `BenchGrid.test.tsx`: with `editing` set to a ticker that is **not** the current selection, the panel renders `BenchDetail` (leaving the stock leaves the edit).
- `BenchGrid.test.tsx`: `BenchDetail`'s `onEdit` calls `onEdit(current.ticker)`; the form's `onSaved` and `onCancel` both call `onEditDone`.

**Green — implementation:**

- Props: `editing: string | null`, `onEdit: (ticker: string) => void`, `onEditDone: () => void` on `BenchGridProps`.
- Panel body: `current !== null && (editing === current.ticker ? <WatchlistEntryForm key={current.ticker} entry={current.row.entry} onSaved={onEditDone} onCancel={onEditDone} /> : <BenchDetail stock={current} onReview={onReview} onEdit={() => onEdit(current.ticker)} />)` inside the existing `SectionCard` under `bench-detail-panel` (ADR "Edit renders inline in the bench detail panel", `plans/us-69/research.md`). `key={ticker}` mounts the form fresh per stock so its `useState` initialisers seed from the right entry.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency; update the `// [US-96]` header comment to mention the edit swap.

**Acceptance criteria covered:**

- "The edit is opened from the stock detail panel"; the panel half of "The ticker cannot be changed in the edit form".

### 9. `WatchlistPage` editing state

**Files to create or modify:**

- `src/renderer/src/pages/WatchlistPage.tsx` — `editing` state and the four transitions.
- `src/renderer/src/pages/WatchlistPage.test.tsx` — mock `useUpdateWatchlistEntry`; new `describe('editing an entry')`.

**Red — tests to write:**

- `WatchlistPage.test.tsx`: with the KO/AAPL bench, clicking `bench-detail-edit` renders the entry form in the detail panel (`watchlist-edit-submit` present, `bench-detail-thesis` absent) seeded with the selected stock's ticker (`watchlist-entry-ticker` reads `KO`).
- `WatchlistPage.test.tsx`: opening the add form (`bench-add-toggle`) while editing closes the edit form; opening edit while the add form is open closes the add form (`watchlist-add-submit` absent) — exactly one `#thesis` in the document in each case.
- `WatchlistPage.test.tsx`: selecting another card (`watchlist-ticker` on AAPL) while editing KO exits edit mode and shows AAPL's read view.
- `WatchlistPage.test.tsx`: clicking `watchlist-edit-cancel` restores the read view for the same stock (`bench-detail-ticker` still `KO`).
- `WatchlistPage.test.tsx`: after the update mutation's `onSuccess` fires, the read view is restored and the selection is unchanged.
- `WatchlistPage.test.tsx`: removing the stock being edited (`watchlist-remove-KO`) exits edit mode.

**Green — implementation:**

- `const [editing, setEditing] = useState<string | null>(null)` in `WatchlistPage`. Transitions per `plans/us-69/data-model.md` → "UI state": `handleEdit(ticker)` → `setEditing(ticker); setAddOpen(false)`; `handleEditDone()` → `setEditing(null)`; `handleSelect(ticker)` → `setSelected(ticker); setEditing(null)`; `handleToggleAdd()` → `setAddOpen(open => !open); setEditing(null)`; `handleRemove(ticker)` → `removeMutation.mutate(ticker); if (editing === ticker) setEditing(null)`.
- Pass `editing`, `onEdit={handleEdit}`, `onEditDone={handleEditDone}`, `onSelect={handleSelect}`, `onRemove={handleRemove}` to `BenchGrid`; `onToggleAdd={handleToggleAdd}` to `BenchHeader`. Rename the `WatchlistAddForm` import/usage to `WatchlistEntryForm` (no `entry` prop → add mode).
- Extend the page's header comment ("the page itself only holds the sheet/add/selection state") to include the edit state and the one-form-at-a-time rule (ADR in `plans/us-69/research.md`).

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency across the handler names (`openSheet`, `refreshBench`, `handleSaved`, `handleReview` already exist — match that style).

**Acceptance criteria covered:**

- "The edit is opened from the stock detail panel", "Changing a condition re-judges the bench" (the panel stays on the edited stock while the invalidated queries refetch), "Clear the thesis" ("AAPL remains on the bench").

### 10. E2e Tests

**Files to create or modify:**

- `e2e/watchlist-edit.spec.ts` — new; `describe('US-69: edit a watchlist entry')`, exactly one `it()` per acceptance scenario, named verbatim.
- `e2e/screener-helpers.ts` — two small drivers: `openEdit(page, ticker)` (`selectCard` → click `bench-detail-edit` → `waitForSelector('[data-testid="watchlist-edit-submit"]')`) and `saveEdit(page)` (click `watchlist-edit-submit` → wait for `bench-detail-thesis` to reappear).

Background for every test (`launchScreener(dbPath, { fixtures: [AAPL_PUT], watchlistNotes: { AAPL: 'Would own below $170' }, conditions: { AAPL: { ownBelowPrice: 170 } }, ...delta })`), then `openEdit(page, 'AAPL')` where the scenario opens the form.

**Red — tests to write:**

- `it('Edit the thesis text')` — fill `#thesis` with `Would own below $165 after the split`, `saveEdit`; `bench-detail-thesis` reads `Would own below $165 after the split`; `reloadBench(page)`, `selectCard(page, 'AAPL')`, `bench-detail-thesis` still reads it.
- `it('Clear the thesis')` — `page.fill('#thesis', '')`, `saveEdit`; `bench-detail-thesis` reads `No thesis yet.`; `[data-testid="watchlist-row-AAPL"]` still present and `bench-count` is `1`.
- `it('Reject an over-length thesis')` — fill `#thesis` with `'a'.repeat(501)`, click `watchlist-edit-submit`; `text=Note must be 500 characters or fewer` visible; `reloadBench`, `selectCard`, `bench-detail-thesis` still reads `Would own below $170`.
- `it('Change a condition value')` — fill `#ownBelowPrice` with `165`, `saveEdit`; `bench-gate-price` text contains `≤ $165`.
- `it('Add a condition to an existing entry')` — click `button:has-text("Wait for high IV")`, fill `#ivrTrigger` with `50`, `saveEdit`; `bench-gate-iv` text contains `IVR ≥ 50` and its `data-verdict` is one of `met|unmet|unknown` (a verdict is shown).
- `it('Remove a condition')` — delta `conditions: { AAPL: { ownBelowPrice: 170, ivrTrigger: 50 } }`; in the form click the `Wait for high IV` row's `[title="Remove condition"]`, `saveEdit`; `bench-gate-iv` count is `0` and `bench-gate-price` still contains `≤ $170`.
- `it('The edit is opened from the stock detail panel')` — `selectCard(page, 'AAPL')`; `bench-detail-edit` is visible; clicking it shows `watchlist-edit-submit` inside `bench-detail-panel`.
- `it('Changing a condition re-judges the bench')` — delta `conditions: { AAPL: { ivrTrigger: 50 } }`, `ivr: { AAPL: { ivr: 34, observedAt: observedSessionsAgo(0) } }`; precondition `cardReason(page, 'AAPL')` is `IV low` and the card's `data-bench-section` is `waiting`; `openEdit`, fill `#ivrTrigger` with `30`, `saveEdit`; `bench-gate-iv` reads `IVR ≥ 30 · met` with `data-verdict="met"`, and `waitForBenchCard(page, 'AAPL', 'meets')` resolves without clicking `bench-refresh`.
- `it('The ticker cannot be changed in the edit form')` — `openEdit`; `watchlist-entry-ticker` reads `AAPL`; `page.locator('#ticker').count()` is `0` and no textbox has the accessible name `Ticker`.
- `it('The thesis seeds the promote flow')` — delta `conditions: {}` (no price gate, so the default `$100.00` quote lets AAPL meet criteria); `waitForBenchCard(page, 'AAPL', 'meets')`; `promoteCard(page, 'AAPL')`; `#thesis` on the new-wheel form has value `Would own below $170`.

**Green — implementation:**

- The suite is AC-driven; the only production code it needs is Areas 1–9. Add the two driver helpers to `e2e/screener-helpers.ts` beside `selectCard` / `promoteCard`, following their `waitForFunction` style.

**Refactor — cleanup to consider:**

- Re-run `e2e/watchlist.spec.ts` (11) and `e2e/watchlist-bench.spec.ts` (33) — both must stay green with no test renamed; the only shared surface that changed is the form component's file name and the detail panel's header.

**Acceptance criteria covered:**

- All ten scenarios, one test each (see the audit below).

## AC Audit

| #   | Acceptance scenario (Linear OPT-5)             | E2e test (Area 10)                               | Unit/integration areas                        |
| --- | ---------------------------------------------- | ------------------------------------------------ | --------------------------------------------- |
| 1   | Edit the thesis text                           | `Edit the thesis text`                           | 2, 3, 4, 6, 9                                 |
| 2   | Clear the thesis                               | `Clear the thesis`                               | 2, 6, 9                                       |
| 3   | Reject an over-length thesis                   | `Reject an over-length thesis`                   | 1, 5, 6                                       |
| 4   | Change a condition value                       | `Change a condition value`                       | 2, 6                                          |
| 5   | Add a condition to an existing entry           | `Add a condition to an existing entry`           | 2, 6                                          |
| 6   | Remove a condition                             | `Remove a condition`                             | 2, 6                                          |
| 7   | The edit is opened from the stock detail panel | `The edit is opened from the stock detail panel` | 7, 8, 9                                       |
| 8   | Changing a condition re-judges the bench       | `Changing a condition re-judges the bench`       | 3, 4, 9                                       |
| 9   | The ticker cannot be changed in the edit form  | `The ticker cannot be changed in the edit form`  | 2, 6, 8                                       |
| 10  | The thesis seeds the promote flow              | `The thesis seeds the promote flow`              | — (regression guard; existing `handleReview`) |

Every scenario has exactly one e2e test named after it; no scenario is uncovered.
