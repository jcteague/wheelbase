---
story: us-63
kind: feature
parent: null
topics: [watchlist, ipc-handlers, database-schema]
status: planned
---

# Implementation Plan: US-63 — Create and remove watchlist entries

## Summary

Build the foundation of the candidate-screener watchlist: a `watchlist` table keyed by normalized
ticker, `watchlist:list/add/remove` IPC handlers through `handleIpcCall`, and a new Watchlist page
where a trader adds a ticker (optionally with a thesis and structured entry conditions) and removes
ones they no longer track. Done state: the Watchlist nav item opens a page that lists entries
newest-first with thesis + condition tags, an add form that validates symbols / rejects duplicates /
normalizes to uppercase, a remove action, and an empty-state that explains the screener. Live
price/IVR/earnings/Signal columns (US-96) and editing (US-69) are out of scope.

## Supporting Documents

Read these before starting implementation:

- **User Story & Acceptance Criteria:** `docs/epics/08-stories/US-63-manage-watchlist-tickers.md`
- **Mockup:** `mockups/us-63-watchlist-manager.mdx` (US-63 owns `add`, `duplicate`, `empty` states)
- **Research & Design Decisions:** `plans/us-63/research.md`
- **Data Model:** `plans/us-63/data-model.md`
- **API Contracts:** `plans/us-63/contracts/watchlist-list.md`, `watchlist-add.md`, `watchlist-remove.md`
- **Quickstart & Verification:** `plans/us-63/quickstart.md`

## Prerequisites

None new — all required infrastructure exists: `handleIpcCall` + `ValidationError` (envelope),
`makeTestDb()` (test db), `tickerSchema` / `newWheelSchema.thesis` (reusable field rules), wouter
hash routing + `NavItem`, React Hook Form + `zodResolver`, TanStack Query hooks, and the
`src/renderer/src/components/ui/` component set. Migration runner auto-applies the new SQL file.

## Implementation Areas

### 1. Database migration — `watchlist` table

**Files to create or modify:**

- `migrations/012_create_watchlist.sql` — new table + index (see `data-model.md` for exact DDL).

**Red — tests to write:**

- In `src/main/db/migrate.test.ts` (or the nearest existing migration test), assert that after
  `runMigrations` on a fresh `:memory:` db, `watchlist` exists with the expected columns
  (`PRAGMA table_info(watchlist)`) and that `idx_watchlist_added_at_desc` is present
  (`PRAGMA index_list(watchlist)`). If no such assertion style exists, cover the schema implicitly
  via the service tests in Area 3 (which `makeTestDb()` and INSERT/SELECT).

**Green — implementation:**

- Write `migrations/012_create_watchlist.sql`: `CREATE TABLE watchlist (ticker TEXT PRIMARY KEY,
notes TEXT, own_below_price TEXT, ivr_trigger INTEGER, post_earnings_only INTEGER NOT NULL DEFAULT
0, core_holding INTEGER NOT NULL DEFAULT 0, added_at TEXT NOT NULL);` plus
  `CREATE INDEX idx_watchlist_added_at_desc ON watchlist (added_at DESC);`. Follow the keyed-table
  convention from `migrations/006_add_credential_settings.sql`.

**Refactor — cleanup to consider:**

- Check the DDL matches the schema-conventions page (TEXT money, ISO timestamps). Confirm file is
  append-only and correctly numbered (012).

**Acceptance criteria covered:**

- Enables all persistence-backed scenarios (foundation; no AC directly).

---

### 2. Main-process IPC schemas & result type

**Files to create or modify:**

- `src/main/schemas.ts` — add `WatchlistAddPayloadSchema`, `WatchlistRemovePayloadSchema`,
  their inferred types, and `interface WatchlistEntryRecord`.

**Red — tests to write:**

- `src/main/schemas.test.ts` (or co-located): `WatchlistAddPayloadSchema.parse` accepts a full
  payload and a ticker-only payload; uppercases + trims `ticker`; rejects `ownBelowPrice <= 0`,
  `ivrTrigger` outside 0-100 or non-integer, and `notes` longer than 500 chars.
  `WatchlistRemovePayloadSchema.parse` accepts `{ ticker }` and normalizes it.

**Green — implementation:**

- Add a `// --- Watchlist ---` banner section to `src/main/schemas.ts`:
  - `WatchlistAddPayloadSchema = z.object({ ticker: <trim/uppercase/^[A-Z]{1,5}$>, notes:
z.string().trim().max(500).optional(), ownBelowPrice: z.number().positive().nullable().optional(),
ivrTrigger: z.number().int().min(0).max(100).nullable().optional(), postEarningsOnly:
z.boolean().optional().default(false), coreHolding: z.boolean().optional().default(false) })` - `export type WatchlistAddPayload = z.infer<typeof WatchlistAddPayloadSchema>`.
  - `WatchlistRemovePayloadSchema = z.object({ ticker: <trim/uppercase/^[A-Z]{1,5}$> })`
    - inferred type.
  - `export interface WatchlistEntryRecord { ticker; notes: string | null; ownBelowPrice: string |
null; ivrTrigger: number | null; postEarningsOnly: boolean; coreHolding: boolean; addedAt: string }`
    (shape per `contracts/watchlist-add.md`).

**Refactor — cleanup to consider:**

- Extract a shared `WatchlistTickerSchema` const for the trim/uppercase/regex if reused by both
  payload schemas. Check naming matches existing `*PayloadSchema` convention.

**Acceptance criteria covered:**

- Supports "normalized to uppercase" and thesis/condition validation (foundation for scenarios 3-7).

---

### 3. Service layer — add / list / remove

**Files to create or modify:**

- `src/main/services/watchlist.ts` — `addWatchlistEntry(db, payload)`, `listWatchlist(db)`,
  `removeWatchlistEntry(db, ticker)`, and row→record mapping.

**Red — tests to write (`src/main/services/watchlist.test.ts`, real `makeTestDb()`):**

- `addWatchlistEntry` inserts and returns the created `WatchlistEntryRecord` with `addedAt` set,
  booleans mapped from 0/1, `ownBelowPrice` stored as 4dp TEXT.
- `addWatchlistEntry` normalizes a lowercase ticker (`'nvda'` → stored/returned `'NVDA'`).
- `addWatchlistEntry` throws `ValidationError('ticker','duplicate','AAPL is already on the
watchlist')` when the (normalized) ticker already exists; the message uses the uppercase ticker.
- `addWatchlistEntry` with no thesis and no conditions stores `notes=null`, `own_below_price=null`,
  `ivr_trigger=null`, both booleans `0`.
- `listWatchlist` returns entries ordered by `addedAt` DESC (insert AAPL then MSFT then NVDA →
  NVDA first).
- `removeWatchlistEntry` deletes the row; removing an absent ticker is a no-op (no throw).

**Green — implementation:**

- Module-level `const XXX_QUERY` strings; obtain `db` as the first arg (per
  `pending-assignments.ts`). `addWatchlistEntry`: normalize ticker (`toUpperCase()`), `SELECT 1 FROM
watchlist WHERE ticker = ?` → if found throw `ValidationError` (imported from
  `../core/lifecycle`); else INSERT with `added_at = new Date().toISOString()` and
  `own_below_price = payload.ownBelowPrice == null ? null : new Decimal(payload.ownBelowPrice).toFixed(4)`,
  booleans as `? 1 : 0`; return the mapped record. `listWatchlist`: `SELECT ... ORDER BY added_at
DESC` → map rows to records. `removeWatchlistEntry`: `DELETE FROM watchlist WHERE ticker = ?`
  (normalize first). Add a `mapRow(row): WatchlistEntryRecord` helper (booleans `=== 1`,
  numbers/strings passthrough). Add INFO log on add/remove, DEBUG on list per logging standards.

**Refactor — cleanup to consider:**

- Deduplicate ticker normalization (share a helper). Confirm no logic leaked into the handler layer.

**Acceptance criteria covered:**

- Scenarios 1, 2 (ordering), 4 (optional), 5 (uppercase), 6 (duplicate), 8 (remove).

---

### 4. IPC handlers & registration

**Files to create or modify:**

- `src/main/ipc/watchlist.ts` — `registerWatchlistIpc({ db })` with the three channels.
- `src/main/index.ts` — import + call `registerWatchlistIpc({ db })` alongside the other
  `register...` calls (~line 180).

**Red — tests to write (`src/main/ipc/watchlist.test.ts`, mock `electron` + logger + service):**

- `watchlist:list` returns `{ ok: true, entries }` from the mocked `listWatchlist`.
- `watchlist:add` parses the payload and returns `{ ok: true, entry }`.
- `watchlist:add` maps a service `ValidationError('ticker','duplicate',...)` to
  `{ ok: false, errors: [{ field: 'ticker', code: 'duplicate', message: '...' }] }` (re-declare
  `ValidationError` in the mock so `instanceof` resolves in `handleIpcCall`).
- `watchlist:add` maps a `ZodError` (bad payload) to `{ ok: false, errors: [...] }`.
- `watchlist:remove` parses `{ ticker }` and returns `{ ok: true, ticker }`.

**Green — implementation:**

- `registerWatchlistIpc({ db }: { db: Database.Database })` registering:
  - `ipcMain.handle('watchlist:list', () => handleIpcCall('watchlist_list_error', () => ({ entries:
listWatchlist(db) })))`
  - `ipcMain.handle('watchlist:add', (_, payload) => handleIpcCall('watchlist_add_error', () => ({
entry: addWatchlistEntry(db, WatchlistAddPayloadSchema.parse(payload)) })))`
  - `ipcMain.handle('watchlist:remove', (_, payload) => handleIpcCall('watchlist_remove_error', () =>
{ const { ticker } = WatchlistRemovePayloadSchema.parse(payload); removeWatchlistEntry(db,
ticker); return { ticker } }))`
  - Keep handlers thin (Zod parse + single service call) per the IPC ADR.
- In `src/main/index.ts`: `import { registerWatchlistIpc } from './ipc/watchlist'` and call
  `registerWatchlistIpc({ db })` inside `app.whenReady()` after `initDb()`.

**Refactor — cleanup to consider:**

- Verify no branching/business logic in the handler file. Confirm log labels follow the
  `{domain}_{verb}_{noun}` convention.

**Acceptance criteria covered:**

- Wires scenarios 1-8 end-to-end through the envelope; duplicate error routing (6).

---

### 5. Preload bridge

**Files to create or modify:**

- `src/preload/index.ts` — add a `watchlist` namespace to the `api` object.
- `src/preload/index.d.ts` — extend `Window.api` with the `watchlist` methods + payload/result types.

**Red — tests to write:**

- No dedicated preload test in this repo (contextBridge). Covered indirectly by the api-adapter
  tests (Area 7, which mock `window.api.watchlist.*`) and e2e (Area 9). Note this explicitly.

**Green — implementation:**

- In `src/preload/index.ts` add (mirroring the `assignments`/`alerts` nested pattern):
  ```ts
  watchlist: {
    list: () => invoke('watchlist:list'),
    add: (payload) => invoke('watchlist:add', payload),
    remove: (payload) => invoke('watchlist:remove', payload)
  }
  ```
- In `src/preload/index.d.ts` add matching typed methods to the `Window.api` interface and the
  payload/result interfaces (`IpcWatchlistAddPayload`, `IpcWatchlistEntry`, using the existing
  `IpcResult<T>` wrapper).

**Refactor — cleanup to consider:**

- Keep `index.ts` and `index.d.ts` in lockstep. Confirm channel strings match the handlers exactly.

**Acceptance criteria covered:**

- Transport for all scenarios (foundation).

---

### 6. Renderer add-form schema

**Files to create or modify:**

- `src/renderer/src/schemas/watchlist.ts` — `watchlistEntrySchema` + `WatchlistEntryFormValues`.

**Red — tests to write (`src/renderer/src/schemas/watchlist.test.ts`):**

- Empty ticker → error message `Enter a ticker symbol`.
- `'12345'` → `Enter a valid ticker symbol`.
- `'AB CD'` → `Enter a valid ticker symbol`.
- `'nvda'` → parses, `ticker` normalized to `'NVDA'`.
- Thesis > 500 chars → error; ≤ 500 passes.
- `ownBelowPrice` empty/undefined allowed; non-positive rejected. `ivrTrigger` accepts 30/50/70;
  rejects 150 and non-integers. `postEarningsOnly`/`coreHolding` default false.

**Green — implementation:**

- `watchlistEntrySchema = z.object({ ticker: z.string().trim().min(1,'Enter a ticker
symbol').toUpperCase().regex(/^[A-Z]{1,5}$/,'Enter a valid ticker symbol'), thesis:
z.string().trim().max(500).optional(), ownBelowPrice: <optional positive money string, mirroring
positiveMoneySchema but optional>, ivrTrigger: <optional int 0-100>, postEarningsOnly:
z.boolean().default(false), coreHolding: z.boolean().default(false) })` +
  `export type WatchlistEntryFormValues = z.infer<...>`. Keep the `^[A-Z]{1,5}$` rule identical to
  `tickerSchema` (see research ADR); numeric fields are strings parsed at submit (matching the
  new-wheel form convention).

**Refactor — cleanup to consider:**

- Reuse `positiveMoneySchema` shape from `common.ts` where possible without changing its message.

**Acceptance criteria covered:**

- Scenario 5 (uppercase), 7 (empty + malformed messages), and thesis/condition capture (3, 4).

---

### 7. Renderer API adapter + query hooks

**Files to create or modify:**

- `src/renderer/src/api/watchlist.ts` — `listWatchlist()`, `addWatchlistEntry(payload)`,
  `removeWatchlistEntry(ticker)` over `window.api.watchlist.*`.
- `src/renderer/src/hooks/watchlistQueryKeys.ts` — `{ all: ['watchlist'] as const }`.
- `src/renderer/src/hooks/useWatchlist.ts` — list query.
- `src/renderer/src/hooks/useAddToWatchlist.ts`, `useRemoveFromWatchlist.ts` — mutations.

**Red — tests to write:**

- `src/renderer/src/api/watchlist.test.ts` (mock `window.api.watchlist`): `listWatchlist` returns
  entries on `{ ok: true }`; `addWatchlistEntry` throws a mapped `ApiError` (status 400) on
  `{ ok: false, errors: [{ field: 'ticker', code: 'duplicate', message }] }`, with the field
  preserved for the form; `removeWatchlistEntry` resolves on `{ ok: true }`.
- `src/renderer/src/hooks/useAddToWatchlist.test.ts` (real QueryClient, mocked api module): on
  success invalidates `watchlistQueryKeys.all`.

**Green — implementation:**

- Adapters follow `src/renderer/src/api/positions.ts`: call `window.api.watchlist.<m>()`, on `!ok`
  `throwMappedIpcErrors(result.errors)` (from `api/error.ts`) — no field remapping needed since
  camelCase is already aligned; return the typed payload.
- Hooks follow `useCreatePosition.ts`: `useWatchlist` → `useQuery({ queryKey:
watchlistQueryKeys.all, queryFn: listWatchlist })`; `useAddToWatchlist`/`useRemoveFromWatchlist` →
  `useMutation` with `onSuccess: () => queryClient.invalidateQueries({ queryKey:
watchlistQueryKeys.all })`.

**Refactor — cleanup to consider:**

- Type mutation hooks with `UseMutationResult`/`UseQueryResult`. Check for duplication with existing
  adapters.

**Acceptance criteria covered:**

- Data flow for scenarios 1-8; duplicate error surfacing (6).

---

### 8. Watchlist page — routing, nav, add form, table, empty state

**Files to create or modify:**

- `src/renderer/src/pages/WatchlistPage.tsx` — page container (list + add form/trigger + empty).
- `src/renderer/src/components/WatchlistAddForm.tsx` — the shared add surface (ticker input,
  condition chips, thesis).
- `src/renderer/src/App.tsx` — add `<Route path="/watchlist" component={WatchlistPage} />`, a
  `<NavItem href="/watchlist" label="Watchlist" icon="☰" ... />` in the Trading nav group, and a
  `location === '/watchlist'` case in the `ShellHeader` title ternary.

**Red — tests to write (`src/renderer/src/pages/WatchlistPage.test.tsx`, mock hooks + wouter):**

- Renders rows for each entry, ticker uppercase, newest first (feed hook data ordered DESC).
- A row with `ownBelowPrice` and `ivrTrigger` shows condition tags `≤ $38` and `IVR ≥ 50`;
  `postEarningsOnly` → `post-earnings` tag; `coreHolding` → `core` tag.
- A row with no conditions renders no condition tags.
- A row with a thesis shows the note text; entries render an added date.
- The remove (✕) button calls the remove mutation with the row's ticker.
- Submitting the add form with a valid ticker calls the add mutation with the parsed payload.
- Submitting empty ticker shows `Enter a ticker symbol`; `12345` shows `Enter a valid ticker
symbol` (client-side zodResolver).
- When the add mutation rejects with a `ticker`/`duplicate` `ApiError`, the form shows the inline
  duplicate message on the ticker field via `setError`.
- With an empty entries list, the empty state renders guidance text about enabling the screener.

**Green — implementation (mirror `mockups/us-63-watchlist-manager.mdx` — `add`/`duplicate`/`empty`):**

- `WatchlistPage`: `PageHeader` "Watchlist" + entry count; when entries exist render a
  `WatchlistTable` and an `AddTrigger`/`WatchlistAddForm`; when empty render the `EmptyView` (dashed
  `border-wb-gold-border` card, ☰ badge, heading "No tickers yet", body explaining the screener) with
  the add form ready. Use `wb-*` Tailwind tokens (`bg-wb-bg-surface`, `text-wb-gold`,
  `border-wb-border`, `font-wb-mono`) — no inline styles for color/spacing.
- `WatchlistAddForm`: React Hook Form + `zodResolver(watchlistEntrySchema)`. Ticker `Input`
  (id `ticker`, uppercase styling), `data-testid="watchlist-add-submit"` submit button
  (label "Add ticker"). Entry-condition quick-pick chips ("Would own below", "Wait for high IV",
  "Post-earnings only", "Core holding"): toggling a value-bearing chip expands a labelled input — a
  `$` `NumberInput` for `ownBelowPrice`, an `IVR ≥` `NumberInput` with `30 / 50 / 70` preset buttons
  for `ivrTrigger` — each removable with ✕ (clearing the field). Boolean chips toggle
  `postEarningsOnly`/`coreHolding` directly. Free-text thesis `textarea` with a `NN / 500` counter.
  Map server field errors to `setError('ticker', ...)` on mutation `onError` (follow
  `NewWheelForm.tsx` `mapFieldErrors`). On success reset the form and let query invalidation refresh
  the list (new entry appears at top).
- `WatchlistTable`: columns Ticker · Thesis (+ condition tags) · Added · ✕, using
  `TablePrimitives` (`TableHeader`/`TableCell`). Derive condition tags from the record exactly like
  the mockup `conditionTags()` (`≤ $<ownBelowPrice>`, `IVR ≥ <ivrTrigger>`, `post-earnings`,
  `core`). Tags are display-only in US-63 (click-to-edit is US-69). ✕ button (`data-testid`
  `watchlist-remove-<ticker>` or a title) triggers `useRemoveFromWatchlist`. **Do not** render
  Price/IVR/Signal columns (US-96).
- App shell: register the route, nav item, and header title.

**Refactor — cleanup to consider:**

- Extract the condition-tag builder into a small pure helper (named concept) reused by page +
  future US-96. Keep `WatchlistAddForm` reusable for US-69 (ticker becomes fixed in edit mode) but
  do not build the edit mode now. Confirm all styling uses `wb-*` tokens.

**Acceptance criteria covered:**

- Scenarios 1, 2, 3, 4, 5, 6, 7, 8, 9 (UI surface for every scenario).

---

### 9. E2e Tests

**Files to create or modify:**

- `e2e/watchlist.spec.ts` — Playwright `_electron`, one `it()` per acceptance criterion.

**Red — tests to write (each maps to exactly one AC; navigate via `location.hash = '#/watchlist'`):**

- `it('adds a ticker to the watchlist')` — with AAPL & MSFT present, add "NVDA" → NVDA appears and
  the list shows 3 tickers.
- `it('shows a newly added ticker at the top of the list')` — with AAPL & MSFT present, add "NVDA"
  → NVDA is the first row.
- `it('creates an entry with a thesis and entry conditions')` — add "PLTR" with thesis "Would own
  below $38 after the run-up", `own_below_price` 38.00, `ivr_trigger` 50 → row shows the note and
  the tags `≤ $38` and `IVR ≥ 50`.
- `it('creates an entry with no thesis and no conditions')` — add "NVDA" with nothing else → NVDA
  created, row carries no condition tags.
- `it('normalizes ticker symbols to uppercase')` — add "nvda" → list shows "NVDA".
- `it('rejects a duplicate ticker')` — with AAPL present, add "AAPL" → inline error "AAPL is already
  on the watchlist"; AAPL appears only once.
- `it('rejects an empty symbol')` — submit empty ticker → error "Enter a ticker symbol"; nothing
  added.
- `it('rejects a numeric symbol')` — add "12345" → error "Enter a valid ticker symbol"; nothing
  added.
- `it('rejects a symbol with a space')` — add "AB CD" → error "Enter a valid ticker symbol";
  nothing added.
- `it('removes a ticker from the watchlist')` — with AAPL & MSFT present, remove AAPL → AAPL gone,
  MSFT remains.
- `it('shows guidance when the watchlist is empty')` — open Watchlist with no tickers → empty state
  explains that adding tickers enables the screener.

**Green — implementation:**

- Author the spec per the skeleton in the spec-research (launch built app with fresh
  `WHEELBASE_DB_PATH`, `FAKE_MARKET_DATA`/`FAKE_BROKER`; `page.firstWindow()`;
  `waitForLoadState('domcontentloaded')`). Seed prior tickers through the add form (UI-driven, no
  direct DB writes). Select fields by `#ticker` and condition inputs; submit via
  `[data-testid="watchlist-add-submit"]`; assert with `text=` / `page.textContent('body')`. Align
  selectors with the actual ids/testids introduced in Area 8.

**Refactor — cleanup to consider:**

- Extract a small `addTicker(page, {...})` helper in the spec (or `e2e/helpers.ts`) to remove
  repetition across the AC cases.

**Acceptance criteria covered:**

- Every AC scenario (1-9, with scenario 7's three examples as three distinct cases).

## AC Audit

| #   | Acceptance criterion (story scenario)              | E2e case (Area 9)                                     |
| --- | -------------------------------------------------- | ----------------------------------------------------- |
| 1   | Add a ticker to the watchlist                      | `adds a ticker to the watchlist`                      |
| 2   | Newly added ticker appears at the top              | `shows a newly added ticker at the top of the list`   |
| 3   | Create an entry with a thesis and entry conditions | `creates an entry with a thesis and entry conditions` |
| 4   | Conditions and thesis are optional                 | `creates an entry with no thesis and no conditions`   |
| 5   | Ticker symbols are normalized to uppercase         | `normalizes ticker symbols to uppercase`              |
| 6   | Reject a duplicate ticker                          | `rejects a duplicate ticker`                          |
| 7a  | Reject empty symbol → "Enter a ticker symbol"      | `rejects an empty symbol`                             |
| 7b  | Reject "12345" → "Enter a valid ticker symbol"     | `rejects a numeric symbol`                            |
| 7c  | Reject "AB CD" → "Enter a valid ticker symbol"     | `rejects a symbol with a space`                       |
| 8   | Remove a ticker from the watchlist                 | `removes a ticker from the watchlist`                 |
| 9   | Empty watchlist shows guidance                     | `shows guidance when the watchlist is empty`          |

All acceptance criteria are covered by a named e2e case.
