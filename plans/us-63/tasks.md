# US-63 — Create and remove watchlist entries — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (no dependencies)

> These areas can be started immediately and run in parallel.

### DB migration — `watchlist` table

- [x] **[Red]** Write failing tests — `src/main/db/migrate.test.ts`
  - After `runMigrations` on a fresh `:memory:` db, assert `watchlist` exists with expected columns via `PRAGMA table_info(watchlist)` (ticker, notes, own_below_price, ivr_trigger, post_earnings_only, core_holding, added_at)
  - Assert `idx_watchlist_added_at_desc` present via `PRAGMA index_list(watchlist)`
  - If no such assertion style exists in the repo, note that schema is covered implicitly by service tests (Area: Service layer) and skip this Red
  - Run `pnpm test src/main/db/migrate.test.ts` — new tests must fail
- [x] **[Green]** Implement — `migrations/012_create_watchlist.sql` _(depends on: DB migration Red ✓)_
  - `CREATE TABLE watchlist (ticker TEXT PRIMARY KEY, notes TEXT, own_below_price TEXT, ivr_trigger INTEGER, post_earnings_only INTEGER NOT NULL DEFAULT 0, core_holding INTEGER NOT NULL DEFAULT 0, added_at TEXT NOT NULL);`
  - `CREATE INDEX idx_watchlist_added_at_desc ON watchlist (added_at DESC);`
  - Follow the keyed-table convention from `migrations/006_add_credential_settings.sql`; migration runner auto-applies
  - Run `pnpm test src/main/db/migrate.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `migrations/012_create_watchlist.sql` _(depends on: DB migration Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm DDL matches schema-conventions (TEXT money, ISO timestamps), file is append-only and numbered `012`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Main-process IPC schemas & result type

- [x] **[Red]** Write failing tests — `src/main/schemas.test.ts`
  - `WatchlistAddPayloadSchema.parse` accepts a full payload and a ticker-only payload
  - Uppercases + trims `ticker`
  - Rejects `ownBelowPrice <= 0`, `ivrTrigger` outside 0-100 or non-integer, `notes` > 500 chars
  - `WatchlistRemovePayloadSchema.parse` accepts `{ ticker }` and normalizes it
  - Run `pnpm test src/main/schemas.test.ts` — new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts` _(depends on: Main schemas Red ✓)_
  - Add `// --- Watchlist ---` banner section
  - `WatchlistAddPayloadSchema = z.object({ ticker: <trim/uppercase/^[A-Z]{1,5}$>, notes: z.string().trim().max(500).optional(), ownBelowPrice: z.number().positive().nullable().optional(), ivrTrigger: z.number().int().min(0).max(100).nullable().optional(), postEarningsOnly: z.boolean().optional().default(false), coreHolding: z.boolean().optional().default(false) })` + `export type WatchlistAddPayload`
  - `WatchlistRemovePayloadSchema = z.object({ ticker: <trim/uppercase/^[A-Z]{1,5}$> })` + inferred type
  - `export interface WatchlistEntryRecord { ticker: string; notes: string | null; ownBelowPrice: string | null; ivrTrigger: number | null; postEarningsOnly: boolean; coreHolding: boolean; addedAt: string }`
  - Run `pnpm test src/main/schemas.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/schemas.ts` _(depends on: Main schemas Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider extracting shared `WatchlistTickerSchema` const for the trim/uppercase/regex; check `*PayloadSchema` naming convention
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Renderer add-form schema

- [x] **[Red]** Write failing tests — `src/renderer/src/schemas/watchlist.test.ts`
  - Empty ticker → `Enter a ticker symbol`
  - `'12345'` → `Enter a valid ticker symbol`
  - `'AB CD'` → `Enter a valid ticker symbol`
  - `'nvda'` → parses, `ticker` normalized to `'NVDA'`
  - Thesis > 500 chars → error; ≤ 500 passes
  - `ownBelowPrice` empty/undefined allowed; non-positive rejected
  - `ivrTrigger` accepts 30/50/70; rejects 150 and non-integers
  - `postEarningsOnly`/`coreHolding` default false
  - Run `pnpm test src/renderer/src/schemas/watchlist.test.ts` — new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/schemas/watchlist.ts` _(depends on: Renderer form schema Red ✓)_
  - `watchlistEntrySchema = z.object({ ticker: z.string().trim().min(1,'Enter a ticker symbol').toUpperCase().regex(/^[A-Z]{1,5}$/,'Enter a valid ticker symbol'), thesis: z.string().trim().max(500).optional(), ownBelowPrice: <optional positive money string>, ivrTrigger: <optional int 0-100>, postEarningsOnly: z.boolean().default(false), coreHolding: z.boolean().default(false) })` + `export type WatchlistEntryFormValues`
  - Keep `^[A-Z]{1,5}$` identical to `tickerSchema`; numeric fields are strings parsed at submit (new-wheel convention)
  - Run `pnpm test src/renderer/src/schemas/watchlist.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/schemas/watchlist.ts` _(depends on: Renderer form schema Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Reuse `positiveMoneySchema` shape from `common.ts` where possible without changing its message
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Service layer (depends on Layer 1)

> Runs after the DB migration and Main schemas Green tasks are complete.

### Service layer — add / list / remove

**Requires:** DB migration Green ✓, Main schemas Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/watchlist.test.ts` (real `makeTestDb()`) _(depends on: DB migration Green ✓, Main schemas Green ✓)_
  - `addWatchlistEntry` inserts and returns the created `WatchlistEntryRecord` with `addedAt` set, booleans mapped from 0/1, `ownBelowPrice` stored as 4dp TEXT
  - `addWatchlistEntry` normalizes lowercase ticker (`'nvda'` → `'NVDA'`)
  - `addWatchlistEntry` throws `ValidationError('ticker','duplicate','AAPL is already on the watchlist')` when normalized ticker exists (message uses uppercase ticker)
  - `addWatchlistEntry` with no thesis/conditions stores `notes=null`, `own_below_price=null`, `ivr_trigger=null`, both booleans `0`
  - `listWatchlist` returns entries ordered by `addedAt` DESC (AAPL then MSFT then NVDA → NVDA first)
  - `removeWatchlistEntry` deletes the row; removing an absent ticker is a no-op (no throw)
  - Run `pnpm test src/main/services/watchlist.test.ts` — new tests must fail
- [x] **[Green]** Implement — `src/main/services/watchlist.ts` _(depends on: Service layer Red ✓)_
  - `db` as first arg (per `pending-assignments.ts`); module-level `const XXX_QUERY` strings
  - `addWatchlistEntry`: normalize ticker (`toUpperCase()`), `SELECT 1 FROM watchlist WHERE ticker = ?` → if found throw `ValidationError` (from `../core/lifecycle`); else INSERT with `added_at = new Date().toISOString()`, `own_below_price = payload.ownBelowPrice == null ? null : new Decimal(payload.ownBelowPrice).toFixed(4)`, booleans as `? 1 : 0`; return mapped record
  - `listWatchlist`: `SELECT ... ORDER BY added_at DESC` → map rows
  - `removeWatchlistEntry`: `DELETE FROM watchlist WHERE ticker = ?` (normalize first)
  - `mapRow(row): WatchlistEntryRecord` helper (booleans `=== 1`, numbers/strings passthrough)
  - INFO log on add/remove, DEBUG on list
  - Run `pnpm test src/main/services/watchlist.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/watchlist.ts` _(depends on: Service layer Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Deduplicate ticker normalization (share a helper); confirm no logic leaked into the handler layer
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — IPC handlers + Preload bridge (depends on Layer 2)

> These areas can run in parallel with each other after their dependencies are complete.

### IPC handlers & registration

**Requires:** Service layer Green ✓, Main schemas Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/watchlist.test.ts` (mock `electron` + logger + service) _(depends on: Service layer Green ✓, Main schemas Green ✓)_
  - `watchlist:list` returns `{ ok: true, entries }` from mocked `listWatchlist`
  - `watchlist:add` parses payload and returns `{ ok: true, entry }`
  - `watchlist:add` maps service `ValidationError('ticker','duplicate',...)` to `{ ok: false, errors: [{ field: 'ticker', code: 'duplicate', message }] }` (re-declare `ValidationError` in mock so `instanceof` resolves in `handleIpcCall`)
  - `watchlist:add` maps a `ZodError` (bad payload) to `{ ok: false, errors: [...] }`
  - `watchlist:remove` parses `{ ticker }` and returns `{ ok: true, ticker }`
  - Run `pnpm test src/main/ipc/watchlist.test.ts` — new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/watchlist.ts` + `src/main/index.ts` _(depends on: IPC handlers Red ✓)_
  - `registerWatchlistIpc({ db }: { db: Database.Database })` registering:
    - `ipcMain.handle('watchlist:list', () => handleIpcCall('watchlist_list_error', () => ({ entries: listWatchlist(db) })))`
    - `ipcMain.handle('watchlist:add', (_, payload) => handleIpcCall('watchlist_add_error', () => ({ entry: addWatchlistEntry(db, WatchlistAddPayloadSchema.parse(payload)) })))`
    - `ipcMain.handle('watchlist:remove', (_, payload) => handleIpcCall('watchlist_remove_error', () => { const { ticker } = WatchlistRemovePayloadSchema.parse(payload); removeWatchlistEntry(db, ticker); return { ticker } }))`
  - Keep handlers thin (Zod parse + single service call) per the IPC ADR
  - In `src/main/index.ts`: `import { registerWatchlistIpc }` and call `registerWatchlistIpc({ db })` inside `app.whenReady()` after `initDb()` (~line 180, alongside other `register...` calls)
  - Run `pnpm test src/main/ipc/watchlist.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/ipc/watchlist.ts` _(depends on: IPC handlers Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify no branching/business logic in handler file; confirm log labels follow `{domain}_{verb}_{noun}`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Preload bridge

**Requires:** Main schemas Green ✓ (types), IPC handlers Green ✓ (channel names must match exactly)

- [x] **[Red]** No dedicated preload test (contextBridge) — covered indirectly by API-adapter tests (Layer 4) and e2e (Layer 6). Note this explicitly; no Red task.
- [x] **[Green]** Implement — `src/preload/index.ts` + `src/preload/index.d.ts` _(depends on: IPC handlers Green ✓)_
  - In `src/preload/index.ts` add a `watchlist` namespace (mirror `assignments`/`alerts` nested pattern):
    ```ts
    watchlist: {
      list: () => invoke('watchlist:list'),
      add: (payload) => invoke('watchlist:add', payload),
      remove: (payload) => invoke('watchlist:remove', payload)
    }
    ```
  - In `src/preload/index.d.ts` add matching typed methods to `Window.api` + payload/result interfaces (`IpcWatchlistAddPayload`, `IpcWatchlistEntry`) using the existing `IpcResult<T>` wrapper
  - Run `pnpm typecheck` — no errors
- [x] **[Refactor]** `/refactor` — `src/preload/index.ts` + `index.d.ts` _(depends on: Preload Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep `index.ts` and `index.d.ts` in lockstep; confirm channel strings match handlers exactly
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Renderer API adapter + hooks (depends on Layer 3)

**Requires:** Preload Green ✓

### Renderer API adapter + query hooks

- [x] **[Red]** Write failing tests _(depends on: Preload Green ✓)_
  - `src/renderer/src/api/watchlist.test.ts` (mock `window.api.watchlist`): `listWatchlist` returns entries on `{ ok: true }`; `addWatchlistEntry` throws a mapped `ApiError` (status 400) on `{ ok: false, errors: [{ field: 'ticker', code: 'duplicate', message }] }` with the field preserved; `removeWatchlistEntry` resolves on `{ ok: true }`
  - `src/renderer/src/hooks/useAddToWatchlist.test.ts` (real QueryClient, mocked api module): on success invalidates `watchlistQueryKeys.all`
  - Run `pnpm test src/renderer/src/api/watchlist.test.ts src/renderer/src/hooks/useAddToWatchlist.test.ts` — new tests must fail
- [x] **[Green]** Implement _(depends on: Renderer API adapter Red ✓)_
  - `src/renderer/src/api/watchlist.ts` — `listWatchlist()`, `addWatchlistEntry(payload)`, `removeWatchlistEntry(ticker)` over `window.api.watchlist.*`; follow `api/positions.ts`: on `!ok` call `throwMappedIpcErrors(result.errors)` (camelCase already aligned, no remapping); return typed payload
  - `src/renderer/src/hooks/watchlistQueryKeys.ts` — `{ all: ['watchlist'] as const }`
  - `src/renderer/src/hooks/useWatchlist.ts` — `useQuery({ queryKey: watchlistQueryKeys.all, queryFn: listWatchlist })`
  - `src/renderer/src/hooks/useAddToWatchlist.ts`, `useRemoveFromWatchlist.ts` — `useMutation` with `onSuccess: () => queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.all })`
  - Run `pnpm test src/renderer/src/api/watchlist.test.ts src/renderer/src/hooks/useAddToWatchlist.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — api adapter + hooks _(depends on: Renderer API adapter Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Type mutation hooks with `UseMutationResult`/`UseQueryResult`; check for duplication with existing adapters
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Watchlist page (depends on Layer 4 + Layer 1 form schema)

**Requires:** Renderer API adapter Green ✓, Renderer form schema Green ✓

### Watchlist page — routing, nav, add form, table, empty state

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/WatchlistPage.test.tsx` (mock hooks + wouter) _(depends on: Renderer API adapter Green ✓, Renderer form schema Green ✓)_
  - Renders rows for each entry, ticker uppercase, newest first (feed hook data ordered DESC)
  - Row with `ownBelowPrice` + `ivrTrigger` shows tags `≤ $38` and `IVR ≥ 50`; `postEarningsOnly` → `post-earnings`; `coreHolding` → `core`
  - Row with no conditions renders no condition tags
  - Row with a thesis shows the note text; entries render an added date
  - Remove (✕) button calls the remove mutation with the row's ticker
  - Submitting valid ticker calls the add mutation with parsed payload
  - Submitting empty ticker shows `Enter a ticker symbol`; `12345` shows `Enter a valid ticker symbol` (client-side zodResolver)
  - Add mutation rejecting with `ticker`/`duplicate` `ApiError` shows inline duplicate message on ticker field via `setError`
  - Empty entries list renders empty state guidance about enabling the screener
  - Run `pnpm test src/renderer/src/pages/WatchlistPage.test.tsx` — new tests must fail
- [x] **[Green]** Implement _(depends on: Watchlist page Red ✓)_
  - Mirror `mockups/us-63-watchlist-manager.mdx` (`add`/`duplicate`/`empty` states)
  - `src/renderer/src/pages/WatchlistPage.tsx` — `PageHeader` "Watchlist" + entry count; entries → `WatchlistTable` + add form; empty → `EmptyView` (dashed `border-wb-gold-border` card, ☰ badge, "No tickers yet" heading, screener-explaining body) with add form ready. Use `wb-*` tokens — no inline styles for color/spacing
  - `src/renderer/src/components/WatchlistAddForm.tsx` — React Hook Form + `zodResolver(watchlistEntrySchema)`; ticker `Input` (id `ticker`, uppercase styling), `data-testid="watchlist-add-submit"` submit ("Add ticker"); condition quick-pick chips ("Would own below" → `$` `NumberInput` for `ownBelowPrice`; "Wait for high IV" → `IVR ≥` `NumberInput` with `30/50/70` presets; "Post-earnings only"/"Core holding" boolean chips), each value chip removable with ✕ (clears field); thesis `textarea` with `NN / 500` counter; map server field errors to `setError('ticker', ...)` on `onError` (follow `NewWheelForm.tsx` `mapFieldErrors`); on success reset form and let invalidation refresh list
  - `WatchlistTable` — columns Ticker · Thesis (+ condition tags) · Added · ✕ via `TablePrimitives`; derive tags exactly like mockup `conditionTags()` (`≤ $<ownBelowPrice>`, `IVR ≥ <ivrTrigger>`, `post-earnings`, `core`); tags display-only; ✕ button (`data-testid="watchlist-remove-<ticker>"` or title) triggers `useRemoveFromWatchlist`. **Do not** render Price/IVR/Signal columns (US-96)
  - `src/renderer/src/App.tsx` — add `<Route path="/watchlist" component={WatchlistPage} />`, `<NavItem href="/watchlist" label="Watchlist" icon="☰" ... />` in Trading nav group, and a `location === '/watchlist'` case in the `ShellHeader` title ternary
  - Run `pnpm test src/renderer/src/pages/WatchlistPage.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — Watchlist page + components _(depends on: Watchlist page Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract condition-tag builder into a small pure helper (named concept) reused by page + future US-96; keep `WatchlistAddForm` reusable for US-69 (do not build edit mode now); confirm all styling uses `wb-*` tokens
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/watchlist.spec.ts` _(depends on: all Green tasks ✓)_
  - Launch built app with fresh `WHEELBASE_DB_PATH`, `FAKE_MARKET_DATA`/`FAKE_BROKER`; `page.firstWindow()`; `waitForLoadState('domcontentloaded')`; navigate via `location.hash = '#/watchlist'`. Seed prior tickers through the add form (UI-driven, no direct DB writes). Select by `#ticker` + condition inputs; submit via `[data-testid="watchlist-add-submit"]`; assert with `text=` / `page.textContent('body')`
  - AC coverage (one `it()` per AC):
    - AC-1: Add a ticker → `it('adds a ticker to the watchlist')`
    - AC-2: New ticker at top → `it('shows a newly added ticker at the top of the list')`
    - AC-3: Thesis + conditions → `it('creates an entry with a thesis and entry conditions')`
    - AC-4: Optional thesis/conditions → `it('creates an entry with no thesis and no conditions')`
    - AC-5: Uppercase normalization → `it('normalizes ticker symbols to uppercase')`
    - AC-6: Duplicate rejected → `it('rejects a duplicate ticker')` (inline "AAPL is already on the watchlist"; AAPL once)
    - AC-7a: Empty symbol → `it('rejects an empty symbol')` ("Enter a ticker symbol")
    - AC-7b: Numeric symbol → `it('rejects a numeric symbol')` ("Enter a valid ticker symbol")
    - AC-7c: Symbol with space → `it('rejects a symbol with a space')` ("Enter a valid ticker symbol")
    - AC-8: Remove ticker → `it('removes a ticker from the watchlist')`
    - AC-9: Empty guidance → `it('shows guidance when the watchlist is empty')`
  - Run `pnpm test:e2e` — new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Align selectors with the actual ids/testids introduced in the Watchlist page area
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests — `e2e/watchlist.spec.ts` _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract a small `addTicker(page, {...})` helper (in the spec or `e2e/helpers.ts`) to remove repetition across AC cases

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (1-9, with scenario 7's three examples as three distinct cases)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
