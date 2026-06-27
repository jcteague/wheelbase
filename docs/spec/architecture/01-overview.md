# Architecture Overview

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-8-pct-fix,us-9,us-12,us-12-refactor,us-32,us-35,us-37,missing-ac -->

Wheelbase is a single-user Electron desktop application for managing the options wheel strategy. This page summarises the cross-cutting architecture patterns that every shipped story has adhered to so far. Feature-specific details live on the per-story pages under `../features/`; deep dives on individual subsystems live on the topic pages cited inline.

## Two-Layer Electron Architecture

The application is split into a thin renderer (React) and a Node-based main process. They communicate exclusively via typed IPC channels exposed through a preload `contextBridge`. The renderer never imports anything from `src/main/`; the only shared surface lives in `src/preload/index.d.ts`.

| Layer                      | Stack                                                                                                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer (`src/renderer/`) | React 19 + TypeScript; TanStack Query for server state and caching; React Hook Form + Zod resolver for forms; wouter for routing (hash-based, required for Electron's `file://` URLs); Tailwind + `wb-*` design tokens for styling; shadcn/ui primitives used incrementally |
| Main process (`src/main/`) | TypeScript on Node; better-sqlite3 with hand-rolled migrations; pure core engines; Alpaca SDK isolated in `integrations/`; pino for logging                                                                                                                                 |
| Preload (`src/preload/`)   | `contextBridge` exposing typed `window.api.*` methods; IPC-flat types in `index.d.ts`                                                                                                                                                                                       |

The renderer's `api/positions.ts` adapter and `api/market-data.ts` adapter are the single boundary that translate between the renderer's snake_case form conventions and the IPC layer's camelCase payloads. TanStack Query hooks (`usePositions`, `usePosition`, `useStockQuotes`, `useMarketStatus`, the various `use{Action}Position` mutations) wrap those adapters so component code only sees React-idiomatic results.

Forms are uniformly built with `useForm({ resolver: zodResolver(...) })`; renderer-side Zod schemas accept string-typed inputs (form values are always strings) and parse to numbers on submit. Components render with Tailwind utilities and the project's `wb-*` color/animation tokens — inline styles are reserved for genuinely dynamic numeric values (e.g. a sheet's slide-in transform).

## Pure Core Engines

`src/main/core/` holds the domain engines: `lifecycle.ts` (state machine for wheel-phase transitions) and `costbasis.ts` (Decimal-based cost-basis arithmetic). These files have **no DB or broker imports** and are architecturally enforced as side-effect-free. Each lifecycle transition is a named function — `openWheel`, `closeCsp`, `expireCsp`, `recordAssignment`, `openCoveredCall`, `closeCoveredCall`, `expireCc`, `rollCsp` — that takes plain input values (current phase, dates, prices) and returns either a `{ phase: NextPhase }` result or throws a `ValidationError` carrying a `{ field, code, message }` triple. Each cost-basis operation has a matching pure function: `calculateInitialCspBasis`, `calculateCspClose`, `calculateCspExpiration`, `calculateAssignmentBasis`, `calculateCcOpenBasis`, `calculateCcClose`, `calculateRollBasis`.

Because the engines are pure, the service layer is responsible for loading the values they need (open fill date, expiration, premium history) and passing them in. New transitions follow a consistent recipe — see `../domain/wheel-lifecycle.md` for the full state diagram and `../domain/cost-basis.md` for the per-event basis formulas.

Logging is intentionally forbidden inside `src/main/core/`; INFO/DEBUG statements live in the service layer and the IPC handlers that wrap the engines.

## IPC Envelope Contract

Every IPC handler returns one of two shapes and **never throws to the renderer**:

```typescript
{ ok: true, ...result }
| { ok: false, errors: Array<{ field: string; code: string; message: string }> }
```

Field naming conventions, established across the lifecycle stories, are stable:

- `field: '__phase__'` — phase-mismatch errors from the lifecycle engine (`invalid_phase`).
- `field: '__root__'` — coarse errors with no field origin (`not_found`, `no_active_leg`, `internal_error`).
- `field: '<payloadFieldName>'` (camelCase) — field-level validation errors (`must_be_positive`, `close_date_before_open`, `close_date_after_expiration`, `before_assignment`, `cannot_be_future`, `too_early`, `must_be_after_current`, `exceeds_shares`, etc.).

Two IPC transports are used:

1. **Request/response** (`ipcRenderer.invoke` / `ipcMain.handle`) for every position mutation and query: `positions:list`, `positions:get`, `positions:create`, `positions:close-csp`, `positions:expire-csp`, `positions:assign-csp`, `positions:open-cc`, `positions:close-cc-early`, `positions:expire-cc`, `positions:record-call-away`, `positions:roll-csp`, `positions:roll-cc`, `market-data:stock-quotes`, `market-data:set-stock-quote-tickers`, `market-data:option-snapshots`, `market-data:option-snapshot`, `market-data:option-chain`, and `broker:market-status`. The renderer awaits a response envelope.
2. **Push events** (`webContents.send`) for fire-and-forget streams from main to renderer. The market-data subsystem uses this for `market-data:stock-quote` (per-tick price updates) and `market-data:stream-error` (WebSocket failures); the renderer subscribes via `onStockQuote(cb)` / `onStreamError(cb)` helpers that return an `unsubscribe` function.

A complete handler-by-handler reference lives in `../contracts/ipc-handlers.md`.

## Validation Discipline (Double-Parsed Payloads)

Every IPC payload is validated twice — once at the boundary on each side — so renderer bugs and main-process bugs surface at the layer that caused them:

1. **Renderer adapter** (`src/renderer/src/api/positions.ts`, `api/market-data.ts`) maps snake_case form fields to camelCase IPC fields and wraps `{ ok: false }` responses into thrown `ApiError`s so TanStack Query treats them as errors. A shared `mapIpcErrors(errors)` helper applies an `IPC_TO_FORM_FIELD` map so server-side field names (`closePricePerContract`, `fillDate`, `assignmentDate`, etc.) surface on the matching form field (`close_price_per_contract`, `fill_date`, `assignment_date`).
2. **Main-process Zod schemas** (`src/main/schemas.ts`) define a `*PayloadSchema` for each mutation — `CreatePositionPayloadSchema`, `CloseCspPayloadSchema`, `ExpireCspPayloadSchema`, `AssignCspPayloadSchema`, `OpenCcPayloadSchema`, `CloseCcPayloadSchema`, `ExpireCcPayloadSchema`, `RollCspPayloadSchema`, `GetStockQuotesPayloadSchema`, `SetStockQuoteTickersPayloadSchema`. Handlers parse the payload before doing anything else.

Two helpers keep handlers thin:

- `handleIpcCall(logLabel, fn)` — the one shared helper, exported from `src/main/ipc/utils.ts`. It wraps the body of a handler, catches `ValidationError` (maps to `{ ok: false, errors }`) and unhandled errors (logs with the label, returns `internal_error`).
- `registerParsedPositionHandler(db, channel, logLabel, schema, service)` — a module-private helper in `src/main/ipc/positions.ts` (not exported). It registers a handler that parses the payload with the supplied Zod schema, invokes the service, and returns the envelope. Used by every position mutation in that file; the result is that the IPC layer carries no business logic — it is Zod + service call + envelope.

## Money Math

All currency-and-premium arithmetic uses `decimal.js` with `Decimal.ROUND_HALF_UP` and a shared `round4` helper, producing 4-decimal-place strings stored as `TEXT` in SQLite (see `../domain/cost-basis.md`). Native floating-point arithmetic is never used for money. The renderer reads the same string values and either renders them directly (e.g. `$176.5000` cost basis) or parses them once for live preview math (P&L previews, net credit/debit previews, guardrail comparisons) — those previews use `decimal.js` too. The `pnlPercentage` on a CSP expiration is the literal constant `"100.0000"` rather than a derived value, kept explicit to avoid drift.

## SQLite as Source of Truth

SQLite (via better-sqlite3) is the durable system of record. Every persistent fact about a wheel — open legs, roll-pair legs, expire/assign event legs, close legs, position phase, cost-basis snapshots — lives in three append-friendly tables:

- `positions` — the wheel itself; updated in place only for phase / status / closed_date / updated_at.
- `legs` — every option transaction (open, close, expire, assign, roll-from, roll-to). Rolls are stored as a linked `ROLL_FROM` + `ROLL_TO` pair sharing a `roll_chain_id` UUID; nothing is mutated in place. Event markers (`EXPIRE`, `ASSIGN`) carry `fill_price = NULL` and `premium_per_contract = '0.0000'`.
- `cost_basis_snapshots` — append-only history. The latest row by `snapshot_at DESC` is authoritative. Closing events (`CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, `WHEEL_COMPLETE` via expiration) set `final_pnl`; in-flight transitions (assignment, CC open) leave it `NULL`. CC expiry and CC close-early deliberately write no new snapshot — the CC premium was already captured at CC-open time.

The "active leg" for a position is phase-aware: the most recent `CSP_OPEN`-or-`ROLL_TO` leg when `phase = CSP_OPEN`; the most recent `CC_OPEN`-or-`ROLL_TO` leg when `phase = CC_OPEN`; null otherwise. After US-12-refactor, this resolution is centralised in `src/main/services/active-leg-sql.ts` and used by both `get-position.ts` and `list-positions.ts`.

Alpaca is the **execution layer only**. Through the currently shipped phases, every Alpaca call is read-only — live stock quotes (REST + WebSocket stream), market-status / clock data, and quote snapshots for the price column on the list. Order execution against Alpaca is reserved for a later phase. Manual trade entry remains the source of every leg in the database.

## Migrations

Schema migrations are filename-ordered SQL files in `migrations/` (`001_initial_schema.sql`, `002_…`, `003_rename_option_type_to_instrument_type.sql`, …). The runner in `src/main/db/migrate.ts` discovers and applies them on startup. New migrations are added only when the schema literally cannot accommodate the change: rename `option_type` → `instrument_type` (US-6, to admit `STOCK`) needed a migration; every other story since has reused the existing schema. Enum-only changes (adding `EXPIRE` / `ASSIGN` to `LegAction`) are type-system updates because the relevant columns have no CHECK constraints to widen.

Because better-sqlite3 ships native bindings, it must be rebuilt for each ABI: `npx electron-rebuild -f -w better-sqlite3` for the Electron runtime, then `pnpm rebuild better-sqlite3` for the Node runtime that Vitest uses. Running these out of order causes "waiting for event 'window'" timeouts on subsequent e2e launches.

## Market-Data Subsystem

US-31 introduced a `MarketDataProvider` interface in `src/main/integrations/market-data-provider.ts`; US-32 wired it into the renderer. The provider is constructed once at app startup, lazily connected on the first subscription request, and disconnected during the consolidated `before-quit` shutdown alongside the polling scheduler (see "Polling Scheduler" below). Two transport patterns coexist:

- A REST seed via `market-data:stock-quotes` populates the renderer's TanStack Query cache with `price`, `bid`, `ask`, `prevClose`, and `volume` for each ticker; the renderer derives `change` and `changePercent` client-side from `(price, prevClose)` so the math lives in one place.
- A WebSocket stream, multiplexed across all active position tickers, pushes per-tick updates over `market-data:stock-quote`. The renderer merges each tick into the TanStack Query cache via `setQueryData`, carrying `prevClose` forward from the seed because stream frames don't carry it.

A separate `useMarketStatus()` hook polls `broker:market-status` every 60s. The pill (`<MarketStatusPill>`) derives `LIVE` / `EXT` / `CLOSED` / `DELAYED` from market session + `dataUpdatedAt` freshness + stream error state; the same pill is intended for reuse on list and detail headers (no "POLL" or timing copy — the pill is the status indicator). When no quotes have arrived for >5 minutes, `<StaleDataBanner>` renders above the table and the pill flips to `DELAYED`.

The full price-column flow lives on `../features/us-32-live-position-prices.md`.

## Polling Scheduler

Background polling across the app is owned by a single shared `PollingScheduler` (`src/main/services/polling-scheduler.ts`, introduced by US-46 bundled with US-35). It is a generic, market-session-aware, setTimeout-chain-based job runner: each registered job — `{ name, cadence, handler }` — manages its own `setTimeout` chain, so async handlers naturally serialise (a tick never overlaps the previous tick) and cadence is recomputed per tick against the current market session. Cadence policies are either `{ kind: 'interval', marketOpenMs, extendedHoursMs?, marketClosedMs? }` (varies by session, with `null` parking the job until the next open) or `{ kind: 'afterClose', offsetMinutes }` (once per trading day at market-close + offset, skipping weekends/holidays, no backfill of missed runs).

A module-level singleton in `src/main/services/scheduler-instance.ts` exports the shared scheduler — built with a safe-broker fallback (`getSafeBroker()` returns a stub `BrokerProvider` reporting `session: 'closed'` when credentials are missing, so the module never throws at import time). Consumers `register()` their job at module load; the first consumer is `detect-assignments` (US-35), and future polling stories (e.g. US-44 IVR collector) attach to the same instance.

The `detect-assignments` job is the canonical example of how a poll job interoperates with the US-37 credential workflow: rather than capture a broker provider once at registration time, its handler **lazy-reads both the active environment and the broker provider on every tick** — `settings.getCredentialStatus().activeBrokerEnv` first (a no-op return when `'none'`), then `brokerFactory.create()` inside a try/catch (WARN-and-skip on failure). This means that when a trader saves Alpaca credentials or switches paper ↔ live via the Settings page, the next scheduler tick picks up the new provider with no app restart and no scheduler re-registration. The scheduler itself stays oblivious to broker state; it is the handler's responsibility to resolve dependencies per tick.

The scheduler integrates with the main-process bootstrap in `src/main/index.ts`:

1. IPC handlers are registered first.
2. `scheduler.register({ name: DETECT_ASSIGNMENTS_JOB_NAME, cadence, handler })` attaches the assignment-detection job (handler shape described above).
3. `scheduler.start()` is called, which fires every registered job once and then on cadence.
4. A consolidated `app.on('before-quit', ...)` handler awaits `Promise.all([scheduler.stop(), marketDataFactory.disconnect()])` and then calls `app.exit(0)`. `scheduler.stop()` cancels all pending invocations and drains in-flight handler promises with a 5-second timeout so neither subsystem is killed mid-tick.

Exceptions in handlers are caught, WARN-logged, and the chain is rescheduled — a failing handler never stops the scheduler or piles up runs. Handler crashes also do not affect other registered jobs. A dev-only `_test:scheduler-*` IPC surface (guarded by `NODE_ENV === 'test'` in `src/main/ipc/test-scheduler.ts`) lets E2E specs introspect the registry and trigger out-of-band runs without polluting the production IPC.

See `../features/us-46-polling-scheduler.md` for the scheduler itself, `../features/us-35-assignment-detection.md` for the assignment-detection wiring, and `../features/us-37-settings-environment.md` for the credential workflow whose changes flow through via the lazy-resolve pattern.

## Cross-Poll State (`app_settings`)

Background jobs that need a watermark or other small piece of cross-poll state share a single key/value table, `app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`. The table is **owned by US-37's migration** `006_add_credential_settings.sql` — it was minted alongside `credential_settings` to track `active_broker_environment`. US-35 originally proposed its own migration 007 to create a stripped-down version of the same table; that migration was dropped during merge resolution and US-35 consumes the richer schema instead, writing `updated_at` on every `set()`. (The US-35 pending_assignments table is now `migrations/008_create_pending_assignments.sql`, renumbered for the same reason.) The scheduler itself is intentionally stateless — any handler that cares about "what did I see last time" owns its own watermark here. The convention is one row per concern, keyed with an environment suffix where paper/live separation matters (e.g. `assignments_last_poll_at:paper`, `assignments_last_poll_at:live`, `active_broker_environment`).

Reads and writes go through the thin `appSettings.get(db, key)` / `appSettings.set(db, key, value)` helper in `src/main/services/app-settings.ts`. Current consumers: the assignment watermark (US-35), captured **at poll start, not poll end**, so any activity that arrives during the broker call is replayed on the next poll and deduped via `INSERT OR IGNORE` on the compound unique index; and the active broker environment (US-37), read by both the broker factory and the `detect-assignments` handler on every tick. Future polling stories should reuse the same table rather than minting new one-row tables.

## Test Discipline

Every story follows Red → Green → Refactor:

1. **Red** — write the failing test first, including service-layer integration tests (in-memory SQLite seeded through earlier services like `createPosition → assignCspPosition → openCoveredCallPosition` to reach the right phase) and component tests (mocking `usePosition` / mutation hooks).
2. **Green** — minimum implementation that makes the tests pass.
3. **Refactor** — extract shared helpers (e.g. `requirePositiveStrike`, `requirePositivePremium`, `requirePositiveClosePrice` in `lifecycle.ts`; `mapIpcErrors`, `handleIpcCall`, `registerParsedPositionHandler`, `activeLegSubquery`; `getRollTypeLabel` and `computeNetCreditDebit` in `src/renderer/src/lib/rolls.ts`; `deriveMarketStatusDisplay` in `src/renderer/src/lib/market-status.ts`), split oversized files (the canonical case is US-7's `OpenCoveredCallSheet` splitting into orchestrator + form + success + guardrail module), and keep tests + lint + typecheck green.

Two test runners cover different layers:

- **Vitest** for unit and integration tests across `src/main/core/`, `src/main/services/`, `src/main/ipc/`, the renderer adapters, hooks, and components. Pino logging is `silent` in Vitest.
- **Playwright `_electron`** for end-to-end tests in `e2e/`. E2E specs use a `launchFreshApp()` helper and per-story helpers (`createPosition`, `assignPosition`, `openCcSheet`, etc.) to drive UIs through real Electron windows. For market-data tests, `window.api` is stubbed via `page.evaluate` so the test harness controls quotes and timing without hitting Alpaca.

The post-change checklist is fixed: `pnpm test` → `pnpm lint` → `pnpm typecheck` → `pnpm format`, with logging additions (INFO for business events, DEBUG for workflow checkpoints) added in the same pass.

## Renderer Style

Hash-based wouter routing (`useHashLocation`) is mandatory because Electron loads the renderer over `file://`. Forms are RHF + Zod resolver exclusively — `register`, `Controller` for custom inputs, `useWatch` for reactive derived values. shadcn primitives are adopted on demand (the `Sheet` primitive landed with US-5; `DatePicker` and `Popover`/`Calendar` are reused widely); the project's own UI surface (`SectionCard`, `PhaseBadge`, `Field`, `AlertBox`, `FormButton`, `Button`, `Caption`, `ErrorAlert`, `StatBox`) sits above shadcn. Animations and colors flow through `wb-*` tokens (`text-wb-green`, `bg-wb-gold`, `animate-wb-pulse`) defined in `src/renderer/src/index.css`. Right-side action sheets (Expiration, Assignment, OpenCoveredCall, CloseCcEarly, CcExpiration, RollCsp) all follow the same `createPortal` + fixed 400/420 px panel + form-state → success-state pattern.

<!-- /generated -->
