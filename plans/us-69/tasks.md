# US-69 — Edit a watchlist entry — Tasks

Derived from `plans/us-69/plan.md`. Story of record: Linear **OPT-5**. Contract:
`plans/us-69/contracts/watchlist-update.md`. Field shapes and UI state: `plans/us-69/data-model.md`.

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Every add-mode selector the inherited suites use (`#ticker`, `#thesis`, `#ownBelowPrice`,
  `#ivrTrigger`, `watchlist-add-submit`, `button:has-text("Would own below")`,
  `button:has-text("Wait for high IV")`) and every US-96 detail-panel test id must survive
  unchanged — `e2e/watchlist.spec.ts` (11) and `e2e/watchlist-bench.spec.ts` (33) are regression gates

---

## Layer 1 — Foundation (no cross-area dependencies)

> These three areas can be started immediately and run in parallel.

### Main-process payload schema

- [x] **[Red]** Write failing tests — `src/main/schemas.test.ts` (new `describe('WatchlistUpdatePayloadSchema')`)
  - Test cases:
    - parses `{ ticker: 'aapl', notes: 'x', ownBelowPrice: 165, ivrTrigger: 50, postEarningsOnly: true, coreHolding: false }` and uppercases the ticker to `AAPL`
    - accepts `notes: null`, `ownBelowPrice: null`, `ivrTrigger: null` and defaults omitted booleans to `false`
    - rejects a 501-char `notes` with `issues[0].path[0] === 'notes'` and message `Note must be 500 characters or fewer`
    - rejects `ticker: '12345'` (`Enter a valid ticker symbol`), `ownBelowPrice: 0`, `ivrTrigger: 101`, `ivrTrigger: 50.5`
    - regression on `WatchlistAddPayloadSchema`: still parses `{ ticker: 'AAPL' }` alone; a 501-char `notes` now fails with the same message
  - Run `pnpm test src/main/schemas.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts` _(depends on: Main-process payload schema Red ✓)_
  - `WatchlistEntryFieldsSchema = z.object({ notes: z.string().trim().max(500, 'Note must be 500 characters or fewer').nullable().optional(), ownBelowPrice: z.number().positive().nullable().optional(), ivrTrigger: z.number().int().min(0).max(100).nullable().optional(), postEarningsOnly: z.boolean().optional().default(false), coreHolding: z.boolean().optional().default(false) })` directly above the add schema
  - `WatchlistAddPayloadSchema = WatchlistEntryFieldsSchema.extend({ ticker: WatchlistTickerSchema })`; `WatchlistUpdatePayloadSchema` with the identical `extend`; `export type WatchlistUpdatePayload = z.infer<typeof WatchlistUpdatePayloadSchema>`
  - Run `pnpm test src/main/schemas.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/schemas.ts` _(depends on: Main-process payload schema Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `WatchlistAddPayload['notes']` now admits `null`: confirm `addWatchlistEntry`'s `payload.notes ?? null` still type-checks and no other add caller assumed `string | undefined`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Renderer form schema message

- [x] **[Red]** Write failing test — `src/renderer/src/schemas/watchlist.test.ts` (existing `describe('thesis')`)
  - Test case: the 501-character case additionally asserts `result.error.issues[0]?.message === 'Note must be 500 characters or fewer'`
  - Run `pnpm test src/renderer/src/schemas/watchlist.test.ts` — the new assertion must fail
- [x] **[Green]** Implement — `src/renderer/src/schemas/watchlist.ts` _(depends on: Renderer form schema message Red ✓)_
  - `thesis: z.string().trim().max(500, 'Note must be 500 characters or fewer').optional()` in `watchlistEntrySchema`
  - Run `pnpm test src/renderer/src/schemas/watchlist.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/schemas/watchlist.ts` _(depends on: Renderer form schema message Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - The `500` literal lives in the schema and as `THESIS_MAX_LENGTH` in the form; leave both unless the form can import one shared constant from the schema module
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### BenchDetail edit affordance

- [x] **[Red]** Write failing tests — `src/renderer/src/components/BenchDetail.test.tsx` (new `describe('editing')`; add `onEdit={noop}` to every existing render)
  - Test cases:
    - renders a button `bench-detail-edit` with accessible name `Edit thesis and conditions` (visible label `Edit`) in the header, for both `meets()` and `waiting()` stocks
    - clicking it calls `onEdit` once and does not call `onReview`
  - Run `pnpm test src/renderer/src/components/BenchDetail.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/BenchDetail.tsx` _(depends on: BenchDetail edit affordance Red ✓)_
  - Add `onEdit: () => void` to `BenchDetailProps`
  - In the header's right-hand cluster beside the `Meets criteria` / `Watching` `Badge`, render `<Button data-testid="bench-detail-edit" size="sm" variant="outline" aria-label="Edit thesis and conditions" onClick={onEdit} className="font-wb-mono border-wb-border bg-wb-bg-elevated text-wb-text-secondary">Edit</Button>` — the header-button treatment `BenchHeader` uses
  - Run `pnpm test src/renderer/src/components/BenchDetail.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/BenchDetail.tsx` _(depends on: BenchDetail edit affordance Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - The header-button class string now appears in `BenchHeader` and `BenchDetail`; hoist only if a third use appears
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Service (depends on Layer 1)

> Starts after **Main-process payload schema Green ✓** (needs the `WatchlistUpdatePayload` type).

### Service: `updateWatchlistEntry`

**Requires:** Main-process payload schema Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/watchlist.test.ts` (new `describe('updateWatchlistEntry')`) _(depends on: Main-process payload schema Green ✓)_
  - Test cases (real `:memory:` db via `makeTestDb()`, seeded with `addWatchlistEntry`):
    - after adding AAPL with notes `Would own below $170` and `ownBelowPrice: 170`, `updateWatchlistEntry(db, { ticker: 'AAPL', notes: 'Would own below $165 after the split', ownBelowPrice: 165, ivrTrigger: null, postEarningsOnly: false, coreHolding: false })` returns `{ ticker: 'AAPL', notes: 'Would own below $165 after the split', ownBelowPrice: '165.0000', ivrTrigger: null, postEarningsOnly: false, coreHolding: false, addedAt: <original> }`
    - `addedAt` is unchanged by an update; `listWatchlist` order is unaffected when the older of two entries is edited
    - `notes: null` stores `NULL` and returns `notes: null`; `notes: ''` also stores `NULL` (raw `SELECT notes … WHERE ticker = ?`)
    - adding a condition: `ivrTrigger: 50` on an entry that had none → returns `ivrTrigger: 50`, raw `ivr_trigger` is `50`
    - removing a condition: `ivrTrigger: null` on an entry that had `50` → `ivrTrigger: null` while `ownBelowPrice` stays `'170.0000'`
    - booleans round-trip: `postEarningsOnly: true, coreHolding: true` stores `1`/`1`, reads back `true`/`true`
    - normalises the ticker: `{ ticker: 'aapl', … }` updates the `AAPL` row
    - absent ticker throws `ValidationError` with field `ticker`, code `not_found`, message `TSLA is not on the watchlist`, and writes nothing
  - Run `pnpm test src/main/services/watchlist.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/watchlist.ts` _(depends on: Service: `updateWatchlistEntry` Red ✓)_
  - `UPDATE_QUERY = 'UPDATE watchlist SET notes = ?, own_below_price = ?, ivr_trigger = ?, post_earnings_only = ?, core_holding = ? WHERE ticker = ?'`; `SELECT_ONE_QUERY = 'SELECT ticker, notes, own_below_price, ivr_trigger, post_earnings_only, core_holding, added_at FROM watchlist WHERE ticker = ?'`
  - `export function updateWatchlistEntry(db, payload: WatchlistUpdatePayload): WatchlistEntryRecord` — `normalizeTicker`; `logger.debug({ ticker, ownBelowPrice, ivrTrigger }, 'watchlist_update_input')`; run `UPDATE_QUERY`; on `result.changes === 0` throw `ValidationError('ticker', 'not_found', '<TICKER> is not on the watchlist')`; `logger.info({ ticker }, 'watchlist_entry_updated')`; return `mapRow(db.prepare(SELECT_ONE_QUERY).get(ticker))`
  - `toStoredFields(payload)` → `{ notes, ownBelowPrice, ivrTrigger, postEarningsOnly: 0|1, coreHolding: 0|1 }` with `notes` normalising `undefined | null | ''` → `null` and `ownBelowPrice` via `new Decimal(n).toFixed(4)`; used by both `addWatchlistEntry` and `updateWatchlistEntry`
  - Run `pnpm test src/main/services/watchlist.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/watchlist.ts` _(depends on: Service: `updateWatchlistEntry` Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm `addWatchlistEntry` after the `toStoredFields` extraction still returns the literal shape its tests pin
  - Update the header comment `// [US-63] Watchlist service — add / list / remove` to include update
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — IPC + preload (depends on Layer 2)

> Starts after **Service: `updateWatchlistEntry` Green ✓**.

### IPC channel `watchlist:update` and preload bridge

**Requires:** Service: `updateWatchlistEntry` Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/watchlist.test.ts` (add `updateWatchlistEntry` to the `../services/watchlist` mock) _(depends on: Service: `updateWatchlistEntry` Green ✓)_
  - Test cases:
    - `watchlist:update` parses the payload (`'aapl'` → `'AAPL'`) and returns `{ ok: true, entry: SAMPLE_ENTRY }`, having called `updateWatchlistEntry(db, expect.objectContaining({ ticker: 'AAPL', notes: 'x' }))`
    - maps a service `ValidationError('ticker','not_found','AAPL is not on the watchlist')` to `{ ok: false, errors: [{ field: 'ticker', code: 'not_found', message: 'AAPL is not on the watchlist' }] }`
    - a 501-char `notes` returns `{ ok: false, errors: [expect.objectContaining({ field: 'notes', message: 'Note must be 500 characters or fewer' })] }` and never calls the service
  - Run `pnpm test src/main/ipc/watchlist.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/watchlist.ts`, `src/preload/index.ts`, `src/preload/index.d.ts` _(depends on: IPC channel `watchlist:update` and preload bridge Red ✓)_
  - `ipcMain.handle('watchlist:update', (_, payload: unknown) => handleIpcCall('watchlist_update_error', () => ({ entry: updateWatchlistEntry(db, WatchlistUpdatePayloadSchema.parse(payload)) })))` — Zod parse + one service call, no branching
  - Preload `index.ts`: `update: (payload: unknown) => invoke('watchlist:update', payload)` beside `add`
  - Preload `index.d.ts`: `interface IpcWatchlistUpdatePayload { ticker: string; notes?: string | null; ownBelowPrice?: number | null; ivrTrigger?: number | null; postEarningsOnly?: boolean; coreHolding?: boolean }`; `type IpcWatchlistUpdateResult = IpcResult<{ entry: IpcWatchlistEntry }>`; `update: (payload: IpcWatchlistUpdatePayload) => Promise<IpcWatchlistUpdateResult>` on the `watchlist` namespace
  - Run `pnpm test src/main/ipc/watchlist.test.ts` — all tests must pass; `pnpm typecheck` clean
- [x] **[Refactor]** `/refactor` — `src/main/ipc/watchlist.ts` _(depends on: IPC channel `watchlist:update` and preload bridge Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Log label `watchlist_update_error` matches the `watchlist_add_error` / `watchlist_remove_error` naming
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Renderer data layer (depends on Layer 3)

> Starts after **IPC channel `watchlist:update` and preload bridge Green ✓** (the adapter types against `window.api.watchlist.update`).

### Renderer adapter and `useUpdateWatchlistEntry`

**Requires:** IPC channel `watchlist:update` and preload bridge Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/api/watchlist.test.ts` (add `update: mockUpdate` to the `window.api.watchlist` stub) and new `src/renderer/src/hooks/useUpdateWatchlistEntry.test.ts` _(depends on: IPC channel `watchlist:update` and preload bridge Green ✓)_
  - `api/watchlist.test.ts` → `describe('updateWatchlistEntry')`:
    - resolves to the returned entry on `{ ok: true, entry }` and forwards `{ ticker: 'AAPL', notes: 'Would own below $165 after the split', ownBelowPrice: 165, ivrTrigger: null, postEarningsOnly: false, coreHolding: false }` verbatim to `window.api.watchlist.update`
    - rejects with `{ status: 400, body: { detail: [{ field: 'ticker', code: 'not_found', message: 'AAPL is not on the watchlist' }] } }` on an `ok: false` envelope
  - `useUpdateWatchlistEntry.test.ts` (mirror `useAddToWatchlist.test.ts`):
    - `mutationFn` is `updateWatchlistEntry`
    - `onSuccess` invalidates `['watchlist']` — one `it`
    - `onSuccess` invalidates `['watchlist', 'snapshot']` — one `it`
    - `onSuccess` invalidates `['screener', 'results']` — one `it`
  - Run `pnpm test src/renderer/src/api/watchlist.test.ts src/renderer/src/hooks/useUpdateWatchlistEntry.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/api/watchlist.ts`, new `src/renderer/src/hooks/useUpdateWatchlistEntry.ts` _(depends on: Renderer adapter and `useUpdateWatchlistEntry` Red ✓)_
  - `export type UpdateWatchlistPayload = { ticker: string; notes: string | null; ownBelowPrice: number | null; ivrTrigger: number | null; postEarningsOnly: boolean; coreHolding: boolean }` (every field required)
  - `export async function updateWatchlistEntry(payload: UpdateWatchlistPayload): Promise<WatchlistEntry>` — `window.api.watchlist.update(payload)`; `throwMappedIpcErrors(result.errors)` on `!result.ok`; return `result.entry`
  - `useUpdateWatchlistEntry(): ReturnType<typeof useMutation<WatchlistEntry, ApiError, UpdateWatchlistPayload>>` — `useMutation({ mutationFn: updateWatchlistEntry, onSuccess })` invalidating `watchlistQueryKeys.all`, `watchlistQueryKeys.snapshot`, `screenerQueryKeys.results`, with a `// [US-69]` comment on why the screener key is included (the bench joins both; a stock that clears its gates needs a fresh rank)
  - Run `pnpm test src/renderer/src/api/watchlist.test.ts src/renderer/src/hooks/useUpdateWatchlistEntry.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/hooks/useAddToWatchlist.ts`, `useRemoveFromWatchlist.ts`, `useUpdateWatchlistEntry.ts` _(depends on: Renderer adapter and `useUpdateWatchlistEntry` Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Three hooks now share an identical `onSuccess`: extract `useWatchlistMutation<TData, TVariables>(mutationFn)` in `src/renderer/src/hooks/useWatchlistMutation.ts` and make each hook a one-liner; the existing hook tests assert through the captured options object and must stay green unchanged
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Shared entry form (depends on Layers 1 and 4)

> Starts after **Renderer adapter and `useUpdateWatchlistEntry` Green ✓** and **Renderer form schema message Green ✓**.

### Shared `WatchlistEntryForm` with edit mode

**Requires:** Renderer adapter and `useUpdateWatchlistEntry` Green ✓, Renderer form schema message Green ✓

- [x] **[Red]** Write failing tests — new `src/renderer/src/components/WatchlistEntryForm.test.tsx` (mock `useAddToWatchlist` and `useUpdateWatchlistEntry` to `{ mutate, isPending: false }` spies; use `entry()` from `bench-test-utils.ts`) _(depends on: Renderer adapter and `useUpdateWatchlistEntry` Green ✓, Renderer form schema message Green ✓)_
  - Test cases:
    - add mode unchanged: no `entry` → heading `Add to watchlist`, a `#ticker` input, no Cancel, submit `watchlist-add-submit` labelled `Add ticker`; submitting `NVDA` calls the add `mutate` with `{ ticker: 'NVDA', notes: undefined, … }`
    - edit heading + fixed ticker: `entry({ ticker: 'AAPL' })` → heading `Edit AAPL`, `watchlist-entry-ticker` reads `AAPL` with caption `· ticker fixed`, and no textbox named `Ticker`
    - seeds the thesis: `entry({ notes: 'Would own below $170' })` → `#thesis` value `Would own below $170`, counter `20 / 500`
    - seeds a price condition open: `entry({ ownBelowPrice: '170.0000' })` → `Would own below` row visible, `#ownBelowPrice` value `170.00`, no `Would own below` chip
    - seeds an IVR condition open: `entry({ ivrTrigger: 50 })` → `#ivrTrigger` value `50`, presets 30/50/70 rendered
    - leaves absent conditions closed: `entry({ ownBelowPrice: null, ivrTrigger: null })` → no rows, both chips with `+`
    - seeds the flag chips: `entry({ postEarningsOnly: true, coreHolding: true })` → both chips active (`✓`)
    - edit buttons: `watchlist-edit-cancel` labelled `Cancel`, `watchlist-edit-submit` labelled `Save changes` (pending `Saving…` when update `isPending`); no `watchlist-add-submit`
    - full-replacement submit: edit `#thesis` to `Would own below $165 after the split`, `#ownBelowPrice` to `165`, click Save → update `mutate` called with `{ ticker: 'AAPL', notes: 'Would own below $165 after the split', ownBelowPrice: 165, ivrTrigger: null, postEarningsOnly: false, coreHolding: false }`; add `mutate` never called
    - clearing the thesis sends `notes: null`
    - adding a condition: click chip `Wait for high IV`, type `50`, save → `ivrTrigger: 50`
    - removing a condition: `entry({ ownBelowPrice: '170.0000', ivrTrigger: 50 })`, click the IV row's `Remove condition` (`✕`), save → `ivrTrigger: null`, `ownBelowPrice: 170`
    - over-length rejected client-side: 501 chars in `#thesis`, save → `Note must be 500 characters or fewer` shown, counter `501 / 500` has class `text-wb-red`, `mutate` not called
    - callbacks: update `mutate`'s `onSuccess` option invokes `onSaved`; clicking Cancel invokes `onCancel` and calls no mutation
    - edit-mode server errors go to the form alert: captured `onError` with `ApiError` detail `[{ field: 'ticker', code: 'not_found', message: 'AAPL is not on the watchlist' }]` renders an `ErrorAlert` with that message; an `ApiError` with no detail renders `Could not save the changes — please try again.`
  - Run `pnpm test src/renderer/src/components/WatchlistEntryForm.test.tsx` — all new tests must fail (the module does not exist yet)
- [x] **[Green]** Implement — rename `src/renderer/src/components/WatchlistAddForm.tsx` → `WatchlistEntryForm.tsx`; update the import in `src/renderer/src/pages/WatchlistPage.tsx` (and any reference in `WatchlistPage.test.tsx`) _(depends on: Shared `WatchlistEntryForm` with edit mode Red ✓)_
  - `type WatchlistEntryFormProps = { entry?: WatchlistEntry; onSaved?: () => void; onCancel?: () => void }`; `const isEdit = entry !== undefined`; call `useAddToWatchlist()` and `useUpdateWatchlistEntry()` unconditionally
  - Defaults (per `data-model.md` → "Seeding defaults"): `ticker: entry?.ticker ?? ''`, `thesis: entry?.notes ?? undefined`, `ownBelowPrice: entry?.ownBelowPrice == null ? undefined : Number(entry.ownBelowPrice).toFixed(2)`, `ivrTrigger: entry?.ivrTrigger == null ? undefined : String(entry.ivrTrigger)`, booleans as stored; `useState(entry?.ownBelowPrice != null)` / `useState(entry?.ivrTrigger != null)` for the row toggles
  - Header: `Edit <ticker>` when `isEdit`, else `Add to watchlist`. Ticker block when `isEdit`: a `span` with `data-testid="watchlist-entry-ticker"` and `font-wb-mono font-bold tracking-[0.03em] text-wb-gold` holding the ticker, followed by a `font-wb-mono text-[0.66rem] text-wb-text-muted` caption `· ticker fixed`, replacing the `Ticker` `Field` + `NumberInput`
  - Submit when `isEdit`: `updateMutation.mutate({ ticker: values.ticker, notes: values.thesis || null, ownBelowPrice: values.ownBelowPrice ? parseFloat(values.ownBelowPrice) : null, ivrTrigger: values.ivrTrigger ? parseInt(values.ivrTrigger, 10) : null, postEarningsOnly: values.postEarningsOnly, coreHolding: values.coreHolding }, { onSuccess: () => onSaved?.(), onError: (e) => mapFieldErrors(e as ApiError) })`; add branch unchanged
  - `mapFieldErrors`: route `fe.field === 'ticker'` to `setError('ticker', …)` only when `!isEdit`, otherwise `root`; fallback `isEdit ? 'Could not save the changes — please try again.' : GENERIC_ADD_ERROR`
  - Thesis textarea: remove `maxLength={THESIS_MAX_LENGTH}`; counter class `twMerge('font-wb-mono text-[0.66rem]', thesis.length > THESIS_MAX_LENGTH ? 'text-wb-red' : 'text-wb-text-muted')`
  - Footer when `isEdit`: `<FormButton variant="secondary" label="Cancel" onClick={onCancel} data-testid="watchlist-edit-cancel" />` then `<FormButton label="Save changes" pendingLabel="Saving…" isPending={updateMutation.isPending} data-testid="watchlist-edit-submit" aria-label="Save changes" />`; add mode keeps `Add ticker` / `watchlist-add-submit`
  - Keep every add-mode `id` and `data-testid` exactly as today
  - Run `pnpm test src/renderer/src/components/WatchlistEntryForm.test.tsx src/renderer/src/pages/WatchlistPage.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/WatchlistEntryForm.tsx` _(depends on: Shared `WatchlistEntryForm` with edit mode Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Both `mutate` branches share the string→number mapping: a small `toConditionValues(values)` returning nullable `{ ownBelowPrice, ivrTrigger }` removes the duplication (add mode maps `null → undefined` at the call site)
  - Update the file header comment and the `// Display-only in US-63 (click-to-edit is US-69)` note in `src/renderer/src/lib/watchlistConditionTags.ts`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — Panel swap (depends on Layers 1 and 5)

> Starts after **Shared `WatchlistEntryForm` with edit mode Green ✓** and **BenchDetail edit affordance Green ✓**.

### BenchGrid swaps the panel between read view and form

**Requires:** Shared `WatchlistEntryForm` with edit mode Green ✓, BenchDetail edit affordance Green ✓

- [x] **[Red]** Write failing tests — new `src/renderer/src/components/BenchGrid.test.tsx` (mock `./WatchlistEntryForm` and `./BenchDetail` with light stubs exposing their props; build a `Bench` from `meets()` / `waiting()`) _(depends on: Shared `WatchlistEntryForm` with edit mode Green ✓, BenchDetail edit affordance Green ✓)_
  - Test cases:
    - `editing: null` with a selected stock → panel renders `BenchDetail` for it, not the form
    - `editing === current.ticker` → panel renders `WatchlistEntryForm` with `entry` equal to `current.row.entry`, no `BenchDetail`, and `bench-detail-panel` still present
    - `editing` set to a ticker that is not the current selection → panel renders `BenchDetail`
    - `BenchDetail`'s `onEdit` calls `onEdit(current.ticker)`; the form's `onSaved` and `onCancel` both call `onEditDone`
  - Run `pnpm test src/renderer/src/components/BenchGrid.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/BenchGrid.tsx` _(depends on: BenchGrid swaps the panel Red ✓)_
  - Props: `editing: string | null`, `onEdit: (ticker: string) => void`, `onEditDone: () => void`
  - Panel body inside the existing `SectionCard` under `bench-detail-panel`: `current !== null && (editing === current.ticker ? <WatchlistEntryForm key={current.ticker} entry={current.row.entry} onSaved={onEditDone} onCancel={onEditDone} /> : <BenchDetail stock={current} onReview={onReview} onEdit={() => onEdit(current.ticker)} />)` — `key={ticker}` mounts the form fresh per stock so its `useState` initialisers seed from the right entry
  - Run `pnpm test src/renderer/src/components/BenchGrid.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/BenchGrid.tsx` _(depends on: BenchGrid swaps the panel Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Update the `// [US-96]` header comment to mention the edit swap
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 7 — Page state (depends on Layer 6)

> Starts after **BenchGrid swaps the panel Green ✓**.

### WatchlistPage editing state

**Requires:** BenchGrid swaps the panel Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/WatchlistPage.test.tsx` (add `vi.mock('../hooks/useUpdateWatchlistEntry')`; new `describe('editing an entry')` on the existing KO/AAPL bench) _(depends on: BenchGrid swaps the panel Green ✓)_
  - Test cases:
    - clicking `bench-detail-edit` renders the entry form in the detail panel (`watchlist-edit-submit` present, `bench-detail-thesis` absent) seeded with the selected stock (`watchlist-entry-ticker` reads `KO`)
    - opening the add form (`bench-add-toggle`) while editing closes the edit form; opening edit while the add form is open closes the add form (`watchlist-add-submit` absent) — exactly one `#thesis` in the document in each case
    - selecting AAPL's `watchlist-ticker` while editing KO exits edit mode and shows AAPL's read view
    - clicking `watchlist-edit-cancel` restores the read view for the same stock (`bench-detail-ticker` still `KO`)
    - after the update mutation's `onSuccess` fires, the read view is restored and the selection is unchanged
    - removing the stock being edited (`watchlist-remove-KO`) exits edit mode
  - Run `pnpm test src/renderer/src/pages/WatchlistPage.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/WatchlistPage.tsx` _(depends on: WatchlistPage editing state Red ✓)_
  - `const [editing, setEditing] = useState<string | null>(null)`
  - Transitions (per `data-model.md` → "UI state"): `handleEdit(ticker)` → `setEditing(ticker); setAddOpen(false)`; `handleEditDone()` → `setEditing(null)`; `handleSelect(ticker)` → `setSelected(ticker); setEditing(null)`; `handleToggleAdd()` → `setAddOpen(open => !open); setEditing(null)`; `handleRemove(ticker)` → `removeMutation.mutate(ticker); if (editing === ticker) setEditing(null)`
  - Pass `editing`, `onEdit={handleEdit}`, `onEditDone={handleEditDone}`, `onSelect={handleSelect}`, `onRemove={handleRemove}` to `BenchGrid`; `onToggleAdd={handleToggleAdd}` to `BenchHeader`; render `WatchlistEntryForm` (no `entry`) where `WatchlistAddForm` was
  - Extend the page header comment to cover the edit state and the one-form-at-a-time rule
  - Run `pnpm test src/renderer/src/pages/WatchlistPage.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/WatchlistPage.tsx` _(depends on: WatchlistPage editing state Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Handler names follow the existing `openSheet` / `refreshBench` / `handleSaved` / `handleReview` style
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 8 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/watchlist-edit.spec.ts` (`describe('US-69: edit a watchlist entry')`) plus drivers `openEdit(page, ticker)` and `saveEdit(page)` in `e2e/screener-helpers.ts` _(depends on: all Green tasks ✓)_
  - Background for every test: `launchScreener(dbPath, { fixtures: [AAPL_PUT], watchlistNotes: { AAPL: 'Would own below $170' }, conditions: { AAPL: { ownBelowPrice: 170 } }, ...delta })`; `openEdit` = `selectCard` → click `bench-detail-edit` → wait for `watchlist-edit-submit`; `saveEdit` = click `watchlist-edit-submit` → wait for `bench-detail-thesis` to reappear
  - One `it()` per AC scenario, named verbatim:
    - AC-1: Edit the thesis text → `it('Edit the thesis text')` — fill `#thesis` `Would own below $165 after the split`, `saveEdit`; `bench-detail-thesis` reads it; `reloadBench` + `selectCard('AAPL')` still reads it
    - AC-2: Clear the thesis → `it('Clear the thesis')` — `fill('#thesis', '')`, `saveEdit`; `bench-detail-thesis` reads `No thesis yet.`; `watchlist-row-AAPL` present, `bench-count` is `1`
    - AC-3: Reject an over-length thesis → `it('Reject an over-length thesis')` — fill 501 chars, click `watchlist-edit-submit`; `text=Note must be 500 characters or fewer` visible; after `reloadBench` + `selectCard`, thesis still `Would own below $170`
    - AC-4: Change a condition value → `it('Change a condition value')` — fill `#ownBelowPrice` `165`, `saveEdit`; `bench-gate-price` contains `≤ $165`
    - AC-5: Add a condition to an existing entry → `it('Add a condition to an existing entry')` — click `button:has-text("Wait for high IV")`, fill `#ivrTrigger` `50`, `saveEdit`; `bench-gate-iv` contains `IVR ≥ 50` with a `data-verdict` of `met|unmet|unknown`
    - AC-6: Remove a condition → `it('Remove a condition')` — delta `conditions: { AAPL: { ownBelowPrice: 170, ivrTrigger: 50 } }`; click the IV row's `[title="Remove condition"]`, `saveEdit`; `bench-gate-iv` count `0`, `bench-gate-price` still contains `≤ $170`
    - AC-7: The edit is opened from the stock detail panel → `it('The edit is opened from the stock detail panel')` — `selectCard('AAPL')`; `bench-detail-edit` visible; clicking it shows `watchlist-edit-submit` inside `bench-detail-panel`
    - AC-8: Changing a condition re-judges the bench → `it('Changing a condition re-judges the bench')` — delta `conditions: { AAPL: { ivrTrigger: 50 } }`, `ivr: { AAPL: { ivr: 34, observedAt: observedSessionsAgo(0) } }`; precondition `cardReason('AAPL')` is `IV low` and section `waiting`; `openEdit`, fill `#ivrTrigger` `30`, `saveEdit`; `bench-gate-iv` reads `IVR ≥ 30 · met` with `data-verdict="met"`; `waitForBenchCard(page, 'AAPL', 'meets')` resolves without clicking `bench-refresh`
    - AC-9: The ticker cannot be changed in the edit form → `it('The ticker cannot be changed in the edit form')` — `openEdit`; `watchlist-entry-ticker` reads `AAPL`; `#ticker` count `0`; no textbox named `Ticker`
    - AC-10: The thesis seeds the promote flow → `it('The thesis seeds the promote flow')` — delta `conditions: {}`; `waitForBenchCard(page, 'AAPL', 'meets')`; `promoteCard(page, 'AAPL')`; `#thesis` on the new-wheel form has value `Would own below $170`
  - Run `pnpm test:e2e e2e/watchlist-edit.spec.ts` — the nine new-behaviour tests must fail; AC-10 may already pass (it is a regression guard on existing promote behaviour)
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - No production code beyond Layers 1–7 is expected; fix selectors/timing in the drivers only
  - Run `pnpm test:e2e e2e/watchlist-edit.spec.ts e2e/watchlist.spec.ts e2e/watchlist-bench.spec.ts` — all 54 tests must pass
  - If the launch hangs on `waiting for event 'window'`, run `npx electron-rebuild -f -w better-sqlite3` (ABI mismatch after `pnpm test`)
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Drivers sit beside `selectCard` / `promoteCard` and follow their `waitForFunction` style; no test renamed in the two inherited suites

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (10 of 10 — see the AC Audit in `plans/us-69/plan.md`)
- [x] `e2e/watchlist.spec.ts` and `e2e/watchlist-bench.spec.ts` still green, no test renamed
- [x] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
- [x] Logging present: INFO `watchlist_entry_updated`, DEBUG `watchlist_update_input`; nothing added under `src/main/core/`
- [ ] `/update-spec us-69` run once the story completes
