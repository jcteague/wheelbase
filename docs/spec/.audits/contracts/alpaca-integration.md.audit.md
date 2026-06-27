---
page: docs/spec/contracts/alpaca-integration.md
audited_at: 2026-06-27
findings: 5
---

# Audit: docs/spec/contracts/alpaca-integration.md

## Verified (18)

- ✓ `BrokerProvider` interface with `getAccountInfo`, `getMarketStatus`, `getActivities` exists in `src/main/integrations/broker-provider.ts:50-53`.
- ✓ `BrokerError` class with `code: BrokerErrorCode`, `message`, `deeplink?` fields in `src/main/integrations/broker-provider.ts:9-19`.
- ✓ `BrokerErrorCode` union = `auth_failed | network_error | rate_limited | environment_mismatch | unknown` (`broker-provider.ts:1-6`) — matches the Error model table exactly.
- ✓ `AlpacaBrokerProvider` class in `src/main/integrations/alpaca-broker.ts:92`; the only file importing `@alpacahq/typescript-sdk` (`alpaca-broker.ts:2`). Grep across `src/` confirms single import site.
- ✓ Lazy client construction — `_client` built on first `lazyClient` access, not in constructor (`alpaca-broker.ts:95-108`); constructor does no network I/O.
- ✓ SDK methods `getAccount` / `getClock` / `getActivity` used for the three reads (`alpaca-broker.ts:156,199,177`).
- ✓ Money fields normalized to 4 dp via `new Decimal(value).toFixed(4)` (`alpaca-broker.ts:84`).
- ✓ `requireCredentials()` called as first line of each public method (`alpaca-broker.ts:154,170,197`); throws `BrokerError('auth_failed', 'Alpaca credentials not configured', 'settings/credentials/alpaca')` (`alpaca-broker.ts:111-118`).
- ✓ `wrapError` re-throws existing `BrokerError`, then detects both directions of env/key mismatch (`AK`→paper, `P`→live) with the documented messages (`alpaca-broker.ts:121-135`).
- ✓ `deeplink` populated only by `requireCredentials()` with value `'settings/credentials/alpaca'` (`alpaca-broker.ts:115`).
- ✓ `createBrokerProvider` factory + `brokerFactory.recreate()` in `src/main/integrations/broker-factory.ts:41,50`; returns `null` when no credentials (`broker-factory.ts:15`).
- ✓ `FakeBrokerProvider` implements `BrokerProvider` in `src/main/integrations/fake-broker.ts:35`.
- ✓ `src/main/integrations/alpaca.ts` marked `@deprecated` (`alpaca.ts:17,23`); exports `client` and `resetClient` (`alpaca.ts:24,28`).
- ✓ `detect-assignments.ts` stamps `pollStartedAt = new Date().toISOString()` BEFORE `getActivities` (`detect-assignments.ts:95,99`), persists watermark key `assignments_last_poll_at:${env}` (`detect-assignments.ts:87,153`).
- ✓ `getActivities({ type: 'OPASN', since })` is the consumer pattern (`detect-assignments.ts:99`).
- ✓ `INSERT OR IGNORE INTO pending_assignments` (`detect-assignments.ts:117`) against `UNIQUE(activity_id, position_id)` index `uq_pending_assignments_activity_position` (`migrations/008_create_pending_assignments.sql:19-20`).
- ✓ `app_settings` key-value table owned by migration 006 (`migrations/006_add_credential_settings.sql:13`); `credential_settings` also in 006 (`:1`).
- ✓ Encrypted credential persistence via `safeStorage.encryptString` into `credential_settings`, `getCredentialStatus()`, `active_broker_environment` key (`src/main/services/settings.ts:86,111,177-181`); settings probes in `src/main/services/settings-connections.ts` (paper/live base URLs at `:40-41`, alpaca/massive probes present).

## Drift (5)

- ✗ Page repeatedly claims the IPC channel `broker:account-info` (lines 88 and 259). The actual registered channel is **`broker:account`** (`src/main/ipc/broker.ts:9`; also `src/preload/index.ts:36` and `broker.test.ts:54`). `broker:account-info` appears nowhere in `src/`. `broker:activities` and `broker:market-status` are correct (`broker.ts:16,24`). Suggested fix: rename the documented channel to `broker:account`.
- ✗ Page (line 37, 87) describes the constructor as `new AlpacaBrokerProvider({ keyId, secretKey, paper })` and says `environment` is "derived from the provider's `paper` config flag." The actual config field is **`environment: 'paper' | 'live'`** (a string), not a boolean `paper` flag — `paper` is computed as `config.environment === 'paper'` only when building the SDK client (`alpaca-broker.ts:103`). Suggested fix: document the config as `{ keyId, secretKey, environment }`.
- ✗ Page (line 191) claims `environment_mismatch` "was added to `BrokerError` in US-39 for one direction," but `wrapError` now detects both directions (`alpaca-broker.ts:124-135`). This is internally consistent with the US-47 narrative elsewhere on the page; flag only that the historical attribution mixes versions. Low severity.
- ✗ Page (line 191) references probe helpers in `src/main/services/settings-connections.ts` and `settings:test-connection` / `settings:test-stored-alpaca-connection`. The handlers exist (`src/main/ipc/settings.ts:96,109`) and the service file exists, but the page (line 189) says `settings:test-connection` "calls `GET /v2/account`" — the service uses base URLs `paper-api.alpaca.markets` / `api.alpaca.markets` (`settings-connections.ts:40-41`); the `/v2/account` path was not directly visible in the grepped lines. Likely correct but the exact path line was not confirmed mechanically. Low confidence — flag for spot check.
- ✗ Page (line 55) states SDK version `v0.0.32-preview`. Not verified against `package.json` in this audit (version string is a narrative claim). Recommend confirming the pinned version.

## Unverifiable (3)

- ? "Session derived client-side from `is_open` + windows" with the specific ET window boundaries (line 94) — the derivation exists in `getMarketStatus` but the exact pre/regular/post/closed boundary constants were not line-verified.
- ? Scheduler back-off behaviour table (lines 146-152) — `detect-assignments.ts` handles `auth_failed` distinctly (`:103`) and instanceof `BrokerError` (`:101`); the per-code WARN/bail mapping is plausible but the full branch set was not exhaustively traced.
- ? Polling cadence config block (lines 160-167) and `before-quit` `Promise.all([scheduler.stop(), marketDataProvider.disconnect()])` (line 264) — registration in `src/main/index.ts` not line-verified in this pass.

## Missing files (0)

- All cited source files exist: `broker-provider.ts`, `alpaca-broker.ts`, `broker-factory.ts`, `fake-broker.ts`, `alpaca.ts`, `src/main/ipc/broker.ts`, `settings.ts`, `settings-connections.ts`, `detect-assignments.ts`, `scheduler-instance.ts`, `migrations/008_create_pending_assignments.sql`.
