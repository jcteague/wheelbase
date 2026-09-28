---
page: docs/spec/architecture/01-overview.md
audited_at: 2026-09-28
findings: 7
---

# Audit: docs/spec/architecture/01-overview.md

## Verified (30)

- ✓ Preload shared types file exists: `src/preload/index.d.ts`
- ✓ Renderer adapters `src/renderer/src/api/positions.ts` and `src/renderer/src/api/market-data.ts` exist
- ✓ Hooks `usePositions`, `usePosition`, `useStockQuotes`, `useMarketStatus` exist under `src/renderer/src/hooks/`
- ✓ Lifecycle transitions `openWheel`, `closeCsp`, `expireCsp`, `openCoveredCall`, `recordAssignment`, `expireCc`, `closeCoveredCall`, `rollCsp` exported from `src/main/core/lifecycle.ts:67,112,149,181,273,303,331,365`
- ✓ Cost-basis functions `calculateInitialCspBasis`, `calculateCspClose`, `calculateAssignmentBasis`, `calculateCcOpenBasis`, `calculateCspExpiration`, `calculateCcClose`, `calculateRollBasis` exported from `src/main/core/costbasis.ts:37,71,115,155,173,195,235`
- ✓ `lifecycle.ts` / `costbasis.ts` import only `decimal.js` and `./types` — no DB, broker or logger imports (`lifecycle.ts:4-5`, `costbasis.ts:6`)
- ✓ All 12 `positions:*` request/response channels named on line 46 are registered in `src/main/ipc/positions.ts`
- ✓ `market-data:stock-quotes`, `set-stock-quote-tickers`, `option-snapshots`, `option-snapshot`, `option-chain`, `market-status` registered via `ipcMain.handle` in `src/main/ipc/market-data.ts`
- ✓ Push events `market-data:stock-quote` / `market-data:stream-error` exposed as `onStockQuote` / `onStreamError` at `src/preload/index.ts:34-35`
- ✓ `IPC_TO_FORM_FIELD` + `mapIpcErrors` at `src/renderer/src/api/positions.ts:78,89`
- ✓ All ten `*PayloadSchema` names exist in `src/main/schemas.ts` (45, 129, 186, 209, 233, 304, 280, 348, 389, 394)
- ✓ `handleIpcCall` exported from `src/main/ipc/utils.ts:18`
- ✓ `registerParsedPositionHandler` is module-private (not exported) in `src/main/ipc/positions.ts:35`, used at 73–144
- ✓ `Decimal.ROUND_HALF_UP` + `round4` in `src/main/core/costbasis.ts:8,23`
- ✓ CSP expiration `pnlPercentage: '100.0000'` literal at `src/main/core/costbasis.ts:181`
- ✓ CC expire / CC close-early services write no `cost_basis_snapshots` row (no insert in `expire-cc-position.ts`, `close-covered-call-position.ts`)
- ✓ `activeLegSubquery` from `src/main/services/active-leg-sql.ts` used by `get-position.ts:16` and `list-positions.ts:11`
- ✓ Migration runner discovers `.sql` files by filename in `src/main/db/migrate.ts:21-22`; `003_rename_option_type_to_instrument_type.sql` exists
- ✓ `MarketDataProvider` file `src/main/integrations/market-data-provider.ts` exists
- ✓ Consolidated `before-quit` awaiting `Promise.all([scheduler.stop(), marketDataFactory.disconnect()])` then `app.exit(0)` at `src/main/index.ts:337-341`
- ✓ Cadence policy shapes (`interval` with `marketOpenMs`/`extendedHoursMs?`/`marketClosedMs?` nullable; `afterClose` with `offsetMinutes`) at `src/main/services/polling-scheduler.ts:6-11`
- ✓ `detect-assignments` handler lazy-reads `activeBrokerEnv` (no-op on `'none'`) then `brokerFactory.create()` in try/catch with WARN at `src/main/index.ts:240-258`
- ✓ `_test:scheduler-*` IPC registered only when `NODE_ENV === 'test'` (`src/main/index.ts:308`, `src/main/ipc/test-scheduler.ts:46-55`)
- ✓ `app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)` in `migrations/006_add_credential_settings.sql:13-17`; `migrations/008_create_pending_assignments.sql` exists
- ✓ `appSettings` helper in `src/main/services/app-settings.ts:3`; watermark key `assignments_last_poll_at:${env}` at `src/main/services/detect-assignments.ts:87`; `INSERT OR IGNORE INTO pending_assignments` at `:117`; `active_broker_environment` key at `src/main/services/settings.ts:89`
- ✓ `useMarketStatus` polls `market-data:market-status` every 60 s (`src/renderer/src/hooks/useMarketStatus.ts:6,14`)
- ✓ `deriveMarketStatusDisplay` returns `LIVE`/`EXT`/`CLOSED`/`DELAYED` (`src/renderer/src/lib/market-status.ts:18-26`); `MarketStatusPill.tsx` and `StaleDataBanner.tsx` exist
- ✓ `getRollTypeLabel` / `computeNetCreditDebit` at `src/renderer/src/lib/rolls.ts:25,40`; `requirePositiveStrike` / `requirePositivePremium` / `requirePositiveClosePrice` at `src/main/core/lifecycle.ts:35,47,51`
- ✓ `useHashLocation` router at `src/renderer/src/App.tsx:118`; `wb-green`/`wb-gold`/`wb-pulse` tokens in `src/renderer/src/index.css:66,72,104`; stream ticks merged via `setQueryData` at `src/renderer/src/hooks/useStockQuotes.ts:76`
- ✓ Named sheets (Expiration, Assignment, OpenCoveredCall, CloseCcEarly, CcExpiration, RollCsp) exist under `src/renderer/src/components/` and use `createPortal`; `SectionCard`, `PhaseBadge`, `AlertBox`, `FormButton`, `Caption`, `ErrorAlert`, `Field` (`ui/FormField.tsx:22`), `Button` (`ui/button.tsx:50`) exist; `launchFreshApp` used in `e2e/`

## Drift (6)

- ✗ Line 9: "The renderer never imports anything from `src/main/`". 13 non-test renderer files import from `src/main/`, e.g. `src/renderer/src/components/PositionCard.tsx:3-5` imports `main/core/costbasis`, `main/core/profit-target`, `main/core/types`; also `lib/format.ts`, `lib/verdict.ts`, `schemas/alert-thresholds.ts`. Suggested fix: say the renderer imports only pure `src/main/core/` modules, never services/DB/integrations.
- ✗ Line 81: "every other story since has reused the existing schema" (only the 003 rename needed a migration). `migrations/` now holds 001–016, including `007_create_ivr_snapshot.sql` through `016_create_iv30_history.sql`. Suggested fix: drop the claim or point at `../schema/migrations.md`.
- ✗ Line 83: Node rebuild given as `pnpm rebuild better-sqlite3`; the project script is `rebuild:node` → `npm rebuild better-sqlite3` (`package.json:20`), and `rebuild:electron` wraps `electron-rebuild` (`package.json:21`). Suggested fix: name `pnpm rebuild:electron` / `pnpm rebuild:node`.
- ✗ Line 100: scheduler singleton "built with a safe-broker fallback (`getSafeBroker()` returns a stub `BrokerProvider` reporting `session: 'closed'`…)". There is no `getSafeBroker` in `src/`. `src/main/services/scheduler-instance.ts:13-37` builds the scheduler from a `MarketStatusSource` backed by `marketDataFactory`, which degrades only on `MarketDataError` `auth_failed` to a closed `unconfiguredProviderStatus`. This is the US-116 move of market status off the broker. Suggested fix: rewrite for the market-data status source.
- ✗ Lines 100, 104-108: "the first consumer is `detect-assignments`… future polling stories (e.g. US-44 IVR collector) attach", and the bootstrap sequence registers only the assignment job. `src/main/index.ts:266` already registers `IVR_COLLECT_JOB_NAME` (afterClose +60, now `collectIvHistoryBatch`) and `:289` registers `ALERT_EVAL_JOB_NAME`. Suggested fix: list all three registered jobs.
- ✗ Line 46: the request/response list claims to cover "every position mutation and query" but leaves out `positions:save-alert-overrides`, which is registered in `src/main/ipc/positions.ts`. (The other namespaces are also missing: alerts, assignments, settings, ivr, screener, watchlist. That may be acceptable because the page defers to `ipc-handlers.md`.)

## Unverifiable (6)

- ? Line 5 / 138: "cross-cutting patterns every shipped story has adhered to" and "shadcn primitives adopted on demand": narrative.
- ? Line 138 lists `StatBox` among the project's shared UI surface. It exists only as a module-private component in `src/renderer/src/components/OpenCcSuccess.tsx:9`. Whether it counts as "shared surface" is a judgment call.
- ? Line 77: "every Alpaca call is read-only". No order endpoints were found in the integrations, but the full claim cannot be proven mechanically.
- ? Line 111: "Handler crashes also do not affect other registered jobs; exceptions WARN-logged and rescheduled": behavioural claim, not mechanically verified beyond the scheduler's existence.
- ? Line 125-127: TDD process description and the "canonical" OpenCoveredCallSheet split: process narrative.
- ? Line 65: "Native floating-point arithmetic is never used for money": cannot be proven by grep. The renderer does import `decimal.js` (e.g. `PositionCard.tsx`, `UnrealizedPnlCell.tsx`, `CallAwayForm.tsx`).

## Missing files (1)

- ✗ Line 113 links `../features/us-37-settings-environment.md`, which doesn't exist. The US-37 page is `docs/spec/features/us-37-paper-live-broker-environment-toggle.md`. (`us-32-live-position-prices.md`, `us-46-polling-scheduler.md`, `us-35-assignment-detection.md` exist.)
