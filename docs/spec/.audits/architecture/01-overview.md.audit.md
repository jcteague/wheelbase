---
page: docs/spec/architecture/01-overview.md
audited_at: 2026-06-27
findings: 4
---

# Audit: docs/spec/architecture/01-overview.md

## Verified (29)

- ✓ Core engines `lifecycle.ts` and `costbasis.ts` exist in `src/main/core/` (`src/main/core/lifecycle.ts`, `src/main/core/costbasis.ts`).
- ✓ Lifecycle transitions are named pure functions: `openWheel` (`lifecycle.ts:67`), `closeCsp` (`:112`), `expireCsp` (`:149`), `openCoveredCall` (`:181`), `recordAssignment` (`:273`), `expireCc` (`:303`), `closeCoveredCall` (`:331`), `rollCsp` (`:365`).
- ✓ Cost-basis functions all exist: `calculateInitialCspBasis` (`costbasis.ts:37`), `calculateCspClose` (`:71`), `calculateAssignmentBasis` (`:115`), `calculateCcOpenBasis` (`:155`), `calculateCspExpiration` (`:173`), `calculateCcClose` (`:195`), `calculateRollBasis` (`:235`).
- ✓ Renderer adapters `src/renderer/src/api/positions.ts` and `src/renderer/src/api/market-data.ts` exist.
- ✓ Preload IPC-flat types live in `src/preload/index.d.ts` (file exists).
- ✓ `handleIpcCall(logLabel, fn)` is exported from `src/main/ipc/utils.ts:10`.
- ✓ `mapIpcErrors` exists in `src/renderer/src/api/positions.ts:94` and is applied to thrown `ApiError`s (`:103`, `:265`, etc.).
- ✓ Mutation payload schemas exist in `src/main/schemas.ts`: `CloseCspPayloadSchema` (`:103`), `ExpireCspPayloadSchema` (`:160`), `AssignCspPayloadSchema` (`:183`), `OpenCcPayloadSchema` (`:207`), `ExpireCcPayloadSchema` (`:254`), `CloseCcPayloadSchema` (`:278`), `RollCspPayloadSchema` (`:322`), `GetStockQuotesPayloadSchema` (`:363`), `SetStockQuoteTickersPayloadSchema` (`:368`).
- ✓ Request/response IPC channels exist in `src/main/ipc/positions.ts`: `positions:list` (`:48`), `positions:get` (`:54`), `positions:create` (`:50`), `positions:close-csp` (`:67`), `positions:expire-csp` (`:83`), `positions:assign-csp` (`:75`), `positions:open-cc` (`:91`), `positions:close-cc-early` (`:99`), `positions:roll-csp` (`:122`); and in `src/main/ipc/market-data.ts`: `market-data:stock-quotes` (`:29`), `market-data:set-stock-quote-tickers` (`:37`), `market-data:market-status` (registered, see test ref `:593`).
- ✓ Push-event channels `market-data:stock-quote` (`market-data.ts:45`) and `market-data:stream-error` (`:46`, `:91`) exist.
- ✓ `decimal.js` with `ROUND_HALF_UP` and a `round4` helper: `Decimal.set({ rounding: Decimal.ROUND_HALF_UP })` (`costbasis.ts:8`), `function round4` (`:23`).
- ✓ Three tables in `migrations/001_initial_schema.sql`: `positions` (`:1`), `legs` (`:20`), `cost_basis_snapshots` (`:40`).
- ✓ `legs.roll_chain_id` column (`001_initial_schema.sql:33`); leg actions `ASSIGN`, `ROLL_FROM`, `ROLL_TO`, `EXPIRE` enumerated in `src/main/core/types.ts:25-29`.
- ✓ `cost_basis_snapshots.final_pnl` (`001:45`) and `snapshot_at` (`001:47`) columns exist.
- ✓ Active-leg resolution centralised: `activeLegSubquery()` exported from `src/main/services/active-leg-sql.ts:6`, imported by `list-positions.ts:11` and `get-position.ts:16`.
- ✓ Alpaca SDK isolated in `src/main/integrations/alpaca.ts` (file exists).
- ✓ Migrations are filename-ordered SQL in `migrations/` (`001`–`009`); runner `src/main/db/migrate.ts` exists.
- ✓ `003_rename_option_type_to_instrument_type.sql` renames to `instrument_type` with CHECK allowing `STOCK` (`:6`).
- ✓ `MarketDataProvider` interface file `src/main/integrations/market-data-provider.ts` exists.
- ✓ `useMarketStatus`/pill subsystem: `src/renderer/src/components/MarketStatusPill.tsx`, `StaleDataBanner.tsx`, and `deriveMarketStatusDisplay` in `src/renderer/src/lib/market-status.ts:18`.
- ✓ `PollingScheduler` in `src/main/services/polling-scheduler.ts`; singleton in `scheduler-instance.ts`.
- ✓ `getSafeBroker()` with `session: 'closed'` stub fallback in `src/main/services/scheduler-instance.ts:7,18`; scheduler exported `:26`.
- ✓ `detect-assignments` is the first registered job (`DETECT_ASSIGNMENTS_JOB_NAME`, `src/main/index.ts:19,182`).
- ✓ Bootstrap order in `src/main/index.ts`: `scheduler.register(...)` (`:182`), `scheduler.start()` (`:251`).
- ✓ Consolidated `app.on('before-quit', ...)` awaiting `Promise.all([scheduler.stop(), marketDataFactory.disconnect()])` then `app.exit(0)` (`src/main/index.ts:259-262`).
- ✓ Dev-only `_test:scheduler-*` IPC guarded by `NODE_ENV === 'test'` (`src/main/index.ts:230`), handlers in `src/main/ipc/test-scheduler.ts` (`_test:scheduler-registry` `:46`, `-run-now` `:48`, `-register` `:52`).
- ✓ `app_settings(key, value, updated_at)` table owned by `migrations/006_add_credential_settings.sql:13`.
- ✓ `appSettings.get(db, key)` / `appSettings.set(db, key, value)` helper in `src/main/services/app-settings.ts:3-13` (object-method form), `set()` writes `updated_at`.
- ✓ `app-settings.ts` `set()` uses `INSERT OR REPLACE` (`:13`); pending_assignments compound unique index `uq_pending_assignments_activity_position` (`008:19`) backs `INSERT OR IGNORE` dedup. US-35 table is `migrations/008_create_pending_assignments.sql`.

## Drift (4)

- ✗ Page (line 56) claims `OpenWheelPayloadSchema` is among the `*PayloadSchema`s in `src/main/schemas.ts`. No such symbol exists; the open-wheel/create-position schema is named `CreatePositionPayloadSchema` (`src/main/schemas.ts:21`). Suggested fix: rename the reference to `CreatePositionPayloadSchema`.

- ✗ Page (line 61) claims `registerParsedPositionHandler(db, channel, logLabel, schema, service)` is one of "two shared helpers in `src/main/ipc/utils.ts`". It is not in `utils.ts` — only `handleIpcCall` is exported there (`utils.ts:10`). `registerParsedPositionHandler` is a module-private function defined in `src/main/ipc/positions.ts:32` and used only within that file. Suggested fix: state that `handleIpcCall` lives in `utils.ts` while `registerParsedPositionHandler` is a local helper in `positions.ts` (not shared/exported).

- ✗ Page (line 109) names the disconnect call as `marketDataProvider.disconnect()`. The actual bootstrap calls `marketDataFactory.disconnect()` (`src/main/index.ts:261`). Suggested fix: update the symbol name to `marketDataFactory`.

- ✗ Page (line 46) lists the request/response position channels but omits several that exist in `src/main/ipc/positions.ts`: `positions:record-call-away` (`:107`) and `positions:roll-cc` (`:130`); likewise `market-data:option-snapshots` / `option-snapshot` / `option-chain` / `activities` / `account` (`market-data.ts:52,59,67`) are not mentioned. The page also writes the close-cc channel as `positions:close-cc-early`, which matches code (`:99`). Suggested fix: either acknowledge the list is illustrative or add the call-away / roll-cc / option-data channels. (Flagged as drift because the page presents the list as complete via "for every position mutation and query".)

## Unverifiable (3)

- ? "These files have no DB or broker imports and are architecturally enforced as side-effect-free" — plausible but the "architecturally enforced" mechanism (e.g. lint rule) was not located mechanically; flag for human review.
- ? Field-naming conventions for error `code` strings (`must_be_positive`, `close_date_before_open`, etc., lines 41-42) are narrative summaries of validation behaviour spread across many services; not mechanically verified here.
- ? "US-35 originally proposed its own migration 007 ... dropped during merge resolution" (line 117) — historical narrative about merge history; not verifiable from current source (current `007` is `007_create_ivr_snapshot.sql`).

## Missing files (0)

- (No broken `../` links checked beyond those referenced; topic/feature cross-links not resolved in this audit pass.)
