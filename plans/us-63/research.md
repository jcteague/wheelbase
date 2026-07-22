# Research: US-63 — Create and remove watchlist entries

## Story

`docs/epics/08-stories/US-63-manage-watchlist-tickers.md` — a wheel trader adds a ticker
(optionally with a thesis and structured entry conditions) to a curated watchlist and removes
ones they no longer track. This is the foundation story for Epic 08 (Candidate Screener and
Watchlist). Editing an entry is US-69; live price / IVR / earnings / Signal on the list is US-96.

Mockup: `mockups/us-63-watchlist-manager.mdx` — US-63 owns the `add`, `duplicate`, and `empty`
states (the `list` state's Price/IVR/Signal columns and the `edit` state belong to US-96/US-69).

## Current State (verified against `src/`)

- **No watchlist artifacts exist yet.** No `watchlist` table, no `watchlist:*` IPC, no renderer
  page/route. The spec wiki (`docs/spec/`) has no watchlist page — only exclusions. This is a
  clean vertical slice: migration → schema → service → IPC → preload → renderer → e2e.
- **Reusable renderer field rules:** `tickerSchema` in `src/renderer/src/schemas/common.ts`
  (`z.string().trim().toUpperCase().regex(/^[A-Z]{1,5}$/, 'Ticker must be 1-5 uppercase letters')`);
  `newWheelSchema.thesis` in `src/renderer/src/schemas/new-wheel.ts` is
  `z.string().trim().max(500).optional()` — the 500-char thesis bound the story reuses.
- **IPC envelope:** `handleIpcCall(logLabel, fn)` in `src/main/ipc/utils.ts` maps `ValidationError`
  (field/code/message) and `ZodError` to `{ ok: false, errors: [...] }`. `ValidationError` lives in
  `src/main/core/lifecycle.ts` (`field`, `code`, `message`).
- **Migrations:** filename-ordered `NNN_snake_case.sql` under `migrations/`, applied at startup by
  `src/main/db/migrate.ts` (lexicographic sort, append-only). Highest is
  `011_add_alerts_dismissal.sql`; next is **`012_create_watchlist.sql`**.
- **Keyed-table precedent:** `app_settings` (`key TEXT PRIMARY KEY`) and `credential_settings`
  (composite PK) in `migrations/006_add_credential_settings.sql`. Money stored as `TEXT` (4dp,
  `decimal.js`); enums as `TEXT` + CHECK; timestamps as ISO-8601 strings; ids via
  `randomUUID()` from `node:crypto`.
- **Service DB access:** services take `db: Database.Database` as an explicit first argument (e.g.
  `src/main/services/pending-assignments.ts`); SQL kept as module-level `const XXX_QUERY` strings;
  writes wrapped in `db.transaction(() => { ... })()`. No shared db singleton.
- **IPC registration:** `registerXxxIpc({ db })` functions in `src/main/ipc/`, wired inside
  `app.whenReady()` in `src/main/index.ts` (~lines 150-181) after `const db = initDb()`.
- **schemas.ts:** all IPC Zod payload schemas + TS result interfaces live in `src/main/schemas.ts`
  (`export const XxxPayloadSchema = z.object({...})` + `export type XxxPayload = z.infer<...>`).
- **Renderer wiring:** routing in `src/renderer/src/App.tsx` (`<Router hook={useHashLocation}>`,
  `<Switch>` route table, `<Sidebar>` `<NavItem>` list, `<ShellHeader>` title ternary). Forms use
  React Hook Form + `zodResolver` (see `src/renderer/src/components/NewWheelForm.tsx`). API adapters
  in `src/renderer/src/api/*.ts` throw `ApiError` via `throwMappedIpcErrors` on `!ok`; TanStack Query
  hooks + per-domain query-key files in `src/renderer/src/hooks/`. Preload bridge exposes
  `window.api.<namespace>.<method>` in `src/preload/index.ts` (+ types in `index.d.ts`).
- **shadcn/app components** available under `src/renderer/src/components/ui/`: `Field`/`FieldLabel`,
  `NumberInput`, `FormButton`, `Badge`, `SectionCard`, `ErrorAlert`, `TablePrimitives`
  (`TableHeader`/`TableCell`), plus lowercase shadcn primitives (`Button`, `Input`). Design tokens
  are `wb-*` Tailwind classes (`text-wb-gold`, `bg-wb-gold-dim`, `border-wb-border`, `font-wb-mono`,
  etc.) defined in `src/renderer/src/index.css`.
- **E2E:** Vitest + Playwright `_electron` against the built `out/main/index.js`; per-test fresh
  SQLite via `WHEELBASE_DB_PATH`; navigate by setting `location.hash`; inputs by `#id`, actions by
  `data-testid`, content by `text=`.

## Architecture Decisions

### ADR: Duplicate ticker surfaces as a field-scoped `ValidationError`, not a new error class

- **Decision:** The `addWatchlistEntry` service throws
  `new ValidationError('ticker', 'duplicate', '<TICKER> is already on the watchlist')` when the
  normalized ticker already exists. Reuse the existing `ValidationError` class from
  `src/main/core/lifecycle.ts`; do **not** introduce a new `WatchlistError` class.
- **Why:** `handleIpcCall` already maps `ValidationError` to `{ field, code, message }`, so the
  duplicate error routes back to the add form's `ticker` field via `setError` with zero changes to
  `src/main/ipc/utils.ts`. The AC message ("AAPL is already on the watchlist") is field-scoped by
  nature. A new domain-error class would require editing `handleIpcCall` (which only maps a fixed set
  of classes; anything else falls through to `internal_error`).
- **Alternatives considered:** A dedicated `WatchlistError` (code-only, `__root__` field) like
  `AlertError`/`PendingAssignmentError` — rejected because it needs a new `instanceof` branch in
  `utils.ts` and surfaces on `__root__` rather than the `ticker` field the mockup highlights in red.

### ADR: `watchlist` table is keyed by normalized ticker (ticker as PRIMARY KEY)

- **Decision:** `CREATE TABLE watchlist (ticker TEXT PRIMARY KEY, ...)`. Columns per the story:
  `ticker`, `notes` (nullable TEXT), `own_below_price` (nullable TEXT, money 4dp),
  `ivr_trigger` (nullable INTEGER), `post_earnings_only` (INTEGER NOT NULL DEFAULT 0),
  `core_holding` (INTEGER NOT NULL DEFAULT 0), `added_at` (TEXT NOT NULL, ISO-8601). Index
  `idx_watchlist_added_at_desc ON watchlist (added_at DESC)` drives newest-first ordering.
- **Why:** The story specifies "keyed by normalized ticker". A ticker PK is the natural unique key
  (single-user app, one row per symbol) and matches the `app_settings` keyed-table precedent. The
  service still checks for an existing row first to emit the friendly duplicate message rather than
  relying on a raw SQLite constraint error.
- **Alternatives considered:** A separate `id TEXT PRIMARY KEY` (uuid) + `UNIQUE INDEX` on ticker
  (the `positions` pattern) — rejected as unnecessary indirection for a symbol-keyed bench; the
  story explicitly keys by ticker. `updated_at` omitted for US-63 (only create/remove; no in-place
  edit until US-69) to honor Simplicity-First and the story's exact column list.

### ADR: Money vs. rank column types — `own_below_price` as TEXT(4dp), `ivr_trigger` as INTEGER

- **Decision:** `own_below_price` stored as `TEXT` formatted with `decimal.js` `.toFixed(4)` (money
  convention); `ivr_trigger` stored as `INTEGER` (IV rank is a whole number 0–100, matching the
  mockup's 30/50/70 presets).
- **Why:** The schema-conventions page mandates money-as-TEXT (4dp, `ROUND_HALF_UP`). IV rank is an
  integer percentile with no fractional storage need and is compared numerically, so INTEGER is
  simplest and avoids decimal parsing on read.
- **Alternatives considered:** Both as TEXT (uniform "nullable numerics") — rejected because IVR has
  no money semantics; INTEGER keeps the Signal comparison (US-96) trivial.

### ADR: Watchlist add form uses AC-specified ticker messages while keeping `tickerSchema`'s rule

- **Decision:** The renderer add-form schema (`src/renderer/src/schemas/watchlist.ts`) defines a
  ticker field that keeps the identical `^[A-Z]{1,5}$` symbol rule from `tickerSchema` but supplies
  the AC message strings: empty → "Enter a ticker symbol"; malformed → "Enter a valid ticker
  symbol". Implement as
  `z.string().trim().min(1, 'Enter a ticker symbol').toUpperCase().regex(/^[A-Z]{1,5}$/, 'Enter a valid ticker symbol')`.
- **Why:** The story says "reuse the existing `tickerSchema`" (intent: identical symbol rules across
  watchlist and new-wheel), but the ACs mandate two distinct message strings that `tickerSchema`'s
  single message can't produce. The AC messages are load-bearing (verified by e2e), so they win; the
  underlying regex stays identical, satisfying the story's real intent. `tickerSchema` is left
  untouched so the new-wheel form keeps its current message.
- **Alternatives considered:** Refactor `tickerSchema` to take a message param — rejected as it
  would ripple into `newWheelSchema` and change unrelated behavior. Reusing `tickerSchema` verbatim —
  rejected because it fails the empty and malformed AC message assertions.

### ADR: US-63 list renders thesis + condition tags only — no live/Signal columns

- **Decision:** The US-63 watchlist table columns are: Ticker, Thesis (notes) + condition tags,
  Added, and a remove (✕) action. Condition tags derive from stored conditions exactly as the mockup
  `conditionTags()` helper does: `≤ $<own_below_price>`, `IVR ≥ <ivr_trigger>`, `post-earnings`,
  `core`. No Price, IVR value, or Signal chip.
- **Why:** The story's Out of Scope explicitly defers live price / IV-rank / earnings / Signal to
  US-96; condition-tag rendering is in-scope per the AC ("the row shows the condition tags '≤ $38'
  and 'IVR ≥ 50'"). Tags are display-only in US-63 (click-to-edit is US-69).
- **Alternatives considered:** Building the full mockup `list` state now — rejected; it pulls in
  market-data dependencies (Epic 06 Massive adapter, US-45 IVR service) not owned by this story.

## Open Questions

None — all unknowns resolved against the story, mockup, and current source.
