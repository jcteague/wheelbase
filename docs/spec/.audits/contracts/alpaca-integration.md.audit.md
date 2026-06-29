---
page: docs/spec/contracts/alpaca-integration.md
audited_at: 2026-06-29
findings: 6
---

# Audit: docs/spec/contracts/alpaca-integration.md

## Verified (24)

- ✓ `BrokerProvider` interface defined in `src/main/integrations/broker-provider.ts:50-54` with methods `getAccountInfo`, `getActivities`, `getMarketStatus`.
- ✓ `AccountInfo`, `MarketStatus`, `BrokerActivity`, `ActivityFilter` types and `BrokerError` class all live in `src/main/integrations/broker-provider.ts:1-48`.
- ✓ `AlpacaBrokerProvider` is a concrete class at `src/main/integrations/alpaca-broker.ts:92` implementing `BrokerProvider`.
- ✓ Lazy SDK construction — constructor stores config, `lazyClient` getter creates client on first use (`alpaca-broker.ts:96-109`); no network I/O in constructor.
- ✓ `AlpacaBrokerProvider` imports `@alpacahq/typescript-sdk` (`createClient`) at `alpaca-broker.ts:2`.
- ✓ `FakeBrokerProvider` exists at `src/main/integrations/fake-broker.ts:35`, implements `BrokerProvider`, env-driven (`FAKE_BROKER_ACCOUNT_*`, `FAKE_BROKER_ERROR`).
- ✓ `requireCredentials()` is the first line of every public method (`alpaca-broker.ts:154,170,197`); throws `BrokerError('auth_failed', 'Alpaca credentials not configured', 'settings/credentials/alpaca')` (`:113-117`).
- ✓ `getAccountInfo()` uses `client.getAccount`, returns `{ buyingPower, portfolioValue, cash, environment, accountNumberMasked }` with all three money fields via `new Decimal(s).toFixed(4)` (`alpaca-broker.ts:83-85,156-163`).
- ✓ `getMarketStatus()` uses `client.getClock`; `session` derived client-side via `deriveSession()` comparing pre 4:00–9:30 / regular / post 16:00–20:00 ET windows (`alpaca-broker.ts:37-61,199-204`).
- ✓ `getActivities()` uses `client.getActivity` with manual query-param construction (`activity_type`, optional `date`), returns array sorted by `transactionTime` descending (`alpaca-broker.ts:172-190`).
- ✓ `BrokerActivity` entry shape carries `activityId, activityType, symbol, qty, price, transactionTime` (`broker-provider.ts:29-36`).
- ✓ `wrapError` 401-body-code parsing: `isAuthError` parses `err.message` JSON for a `code` starting with `401` (`alpaca-broker.ts:70-79`).
- ✓ Environment-mismatch detection both directions: paper+`AK` → LIVE-keys message, live+`P` → PAPER-keys message (`alpaca-broker.ts:125-136`).
- ✓ `BrokerError` carries `code`, `message`, `deeplink?`; `deeplink` populated only by `requireCredentials()` (`broker-provider.ts:9-19`, `alpaca-broker.ts:116`).
- ✓ `BrokerErrorCode` union = `auth_failed | network_error | rate_limited | environment_mismatch | unknown` (`broker-provider.ts:1-6`).
- ✓ IPC channels `broker:account`, `broker:activities`, `broker:market-status` registered in `src/main/ipc/broker.ts:9,16,24`.
- ✓ `src/main/integrations/alpaca.ts` exports `client` / `resetClient`, both marked `@deprecated` (`alpaca.ts:17,23-28`).
- ✓ Settings persistence: `src/main/services/settings.ts` uses `safeStorage.encryptString`, stores to `credential_settings`, `getCredentialStatus()` returns `activeBrokerEnv` (`settings.ts:152,157-166,177-178`).
- ✓ `app_settings.active_broker_environment` key (`settings.ts:86`); `app_settings` table created in `migrations/006_add_credential_settings.sql`.
- ✓ Per-environment watermark `assignments_last_poll_at:${env}`, `pollStartedAt = new Date().toISOString()` captured before `getActivities({ type: 'OPASN', since })`, persisted on success (`detect-assignments.ts:87,95,99,153`).
- ✓ Dedupe: `INSERT OR IGNORE INTO pending_assignments` against `UNIQUE(activity_id, position_id)` in `migrations/008_create_pending_assignments.sql:19-20`; one row per matching position.
- ✓ `index.ts` lazy-reads `brokerFactory.create()` + `settings.getCredentialStatus().activeBrokerEnv` each tick, no-op on `'none'` (`index.ts:191-200`); recreates only broker on settings change (`index.ts:161-162`).
- ✓ Polling cadence `{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }` (`index.ts:185-188`).
- ✓ Settings probe IPC: `settings:test-connection`, `settings:test-stored-alpaca-connection`, `settings:set-active-broker-environment` all registered (`ipc/settings.ts:96,109,83`); Alpaca probe hits `${ALPACA_BASE_URLS[env]}/v2/account` (`settings-connections.ts:40-41,143`).
- ✓ `loadMassiveApiKey` prefers `MAIN_VITE_MASSIVE_API_KEY`, falls back to `MASSIVE_API_KEY` (`massive-credentials.ts`); `market-data:*` channels present: `stock-quotes`, `option-snapshot` (singular), `option-chain`, `option-snapshots` (bulk, retained), `set-stock-quote-tickers`, push events `stock-quote` / `stream-error` (`ipc/market-data.ts:29,37,45,46,52,59,67`).

## Drift (6)

- ✗ **`createBrokerProvider` factory does not exist.** The page names `createBrokerProvider` as "the single entrypoint" (lines 39-41), in the SDK-bypass section, in US-37 (line 180), and in Source files (line 256). Grep for `createBrokerProvider` across `src/` returns **zero** hits. The actual factory in `src/main/integrations/broker-factory.ts` is an object `brokerFactory` with `configure()`, `create()`, and `recreate()`. Suggested fix: replace all `createBrokerProvider` references with `brokerFactory.create()` (and `brokerFactory.recreate()` for the refresh path).

- ✗ **Factory does not "return `null` when no environment is active or no credentials exist".** Page line 41 claims null return. `broker-factory.ts:36` throws `new BrokerError('auth_failed', 'Alpaca credentials not configured')` when no credentials resolve. Suggested fix: update page to say the factory throws `BrokerError('auth_failed')`, not returns null.

- ✗ **Single-import-site rule is inaccurate.** Page lines 37/45-47 and Source files line 255 claim `alpaca-broker.ts` is "the only module/file in the repo permitted to import `@alpacahq/typescript-sdk`." The deprecated `src/main/integrations/alpaca.ts:4` also imports `createClient` from `@alpacahq/typescript-sdk`. The page acknowledges `alpaca.ts` elsewhere (lines 65-67, 258) but the absolute "only file" phrasing is contradicted by it. Suggested fix: qualify as "the only non-deprecated module" or note `alpaca.ts` is the lingering second importer.

- ✗ **`before-quit` symbol name drift.** Page line 264 claims `before-quit` awaits `Promise.all([scheduler.stop(), marketDataProvider.disconnect()])`. Actual code is `Promise.all([scheduler.stop(), marketDataFactory.disconnect()])` (`index.ts:261`) — `marketDataFactory`, not `marketDataProvider`. Suggested fix: correct the symbol name.

- ✗ **`rate_limited` not specifically handled in detect-assignments.** Page line 150 claims `rate_limited` gets "WARN log + bail out; treated like `network_error`." In `detect-assignments.ts:101-109` only `auth_failed` is branched specially (typed return); ALL other `BrokerError` codes (`network_error`, `rate_limited`, `environment_mismatch`, `unknown`) fall into one generic `return { detected: 0, skipped: 0 }` after a single WARN. The per-code outcome matches (WARN + bail, watermark not advanced), but there is no per-code branch as the table implies; `environment_mismatch` is also handled by the same generic branch from this path, not "surfaced via the settings page." Suggested fix: collapse the table to "auth_failed → typed brokerError return; all other codes → WARN + bail, watermark not advanced."

- ✗ **`wrapError` does not classify 429 → `rate_limited`.** Page line 75 and the Error-model table (line 235) claim `429 → rate_limited`. `wrapError` (`alpaca-broker.ts:121-151`) only classifies auth (401/403), network, and unknown — there is no `rate_limited` branch in the adapter; a 429 falls through to `unknown`. `rate_limited` exists in the `BrokerErrorCode` union and is handled by `detect-assignments`, but the adapter never produces it. Suggested fix: either add a 429 branch to `wrapError` or update the page to note `rate_limited` is defined but not currently emitted by the Alpaca adapter.

## Unverifiable (3)

- ? "SDK is a Deno-to-Node transpile, marked no-longer-maintained" (line 55) — narrative/external claim, not mechanically verifiable.
- ? "OPASN events typically post overnight" (line 169) — domain rationale, not code.
- ? `@alpacahq/typescript-sdk` version "v0.0.32-preview" (line 55) — not checked against package.json in this audit; flag for human review.

## Missing files (0)

- All cited source files exist: `broker-provider.ts`, `alpaca-broker.ts`, `broker-factory.ts`, `fake-broker.ts`, `alpaca.ts`, `ipc/broker.ts`, `services/settings.ts`, `services/settings-connections.ts`, `services/detect-assignments.ts`, `services/scheduler-instance.ts`, `index.ts`, `massive-credentials.ts`, `ipc/market-data.ts`. (Cross-page links to `domain/market-data.md`, `ipc-handlers.md`, ADR not resolved in this audit — out of scope for this page's code claims.)
