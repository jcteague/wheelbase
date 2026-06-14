# Alpaca Integration

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39 -->

## Overview

Alpaca is Wheelbase's **broker** integration — the source of account info, broker activities (assignments, exercises, expirations), and the market clock used to drive session-aware UI and polling. As of US-39, Alpaca is **no longer the market-data vendor**: stock quotes, option snapshots, and option chains are now sourced from Massive via a separate provider. The two concerns are split across two interfaces (`BrokerProvider` and `MarketDataProvider`) with independent factories and IPC namespaces.

This page documents the Alpaca-facing surface:

- The `BrokerProvider` contract (Alpaca-backed via `AlpacaBrokerProvider`)
- The `broker:*` IPC namespace
- Activity polling (the only consumer pattern in the codebase today is US-35's assignment detection)
- Settings-side credential probes for paper/live environments
- Runtime broker recreation when credentials or the active environment change

For the Massive-backed market-data adapter and the `MarketDataProvider` interface it implements, see [contracts/ipc-handlers.md](./ipc-handlers.md) and [domain/market-data.md](../domain/market-data.md). For the activity-driven cost-basis flow that consumes assignment events, see [domain/cost-basis.md](../domain/cost-basis.md).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39 -->

## Boundary layout

Wheelbase keeps every Alpaca SDK call behind a small set of files. Three layers compose the boundary:

### `BrokerProvider` interface

Provider-agnostic contract every broker implementation satisfies. Defined in `src/main/integrations/broker-provider.ts`. Methods:

- `getAccountInfo(): Promise<AccountInfo>`
- `getMarketStatus(): Promise<MarketStatus>`
- `getActivities(filter: ActivityFilter): Promise<BrokerActivity[]>`

### `AlpacaBrokerProvider` implementation

The Alpaca-backed concrete class. Lives at `src/main/integrations/alpaca-broker.ts` (post-US-39 split; absorbed the broker-side methods that used to live on the combined `AlpacaMarketDataProvider`). It is the only module in the repo permitted to import `@alpacahq/typescript-sdk`. Constructed lazily — `new AlpacaBrokerProvider({ keyId, secretKey, paper })` does not perform any network I/O.

### `createBrokerProvider` factory

The single entrypoint downstream code uses. Defined in `src/main/integrations/broker-factory.ts`. Resolves the active broker environment (`'paper' | 'live' | 'none'`) and the corresponding stored credentials via `src/main/services/settings.ts`, then constructs an `AlpacaBrokerProvider` for the active environment. Returns `null` when no environment is active or no credentials exist.

A `FakeBrokerProvider` sibling exists for e2e and dev (`src/main/integrations/fake-broker.ts`) — same interface, env-driven canned responses.

### Single-import-site rule

Only `src/main/integrations/alpaca-broker.ts` may `import` from `@alpacahq/typescript-sdk`. IPC handlers (`src/main/ipc/broker.ts`), services (`src/main/services/detect-assignments.ts`, `src/main/services/scheduler-instance.ts`), the renderer, and the pure-core engines all consume `BrokerProvider` via the factory. SDK raw shapes (`activity_type`, `transaction_time`, etc.) never leak past the adapter; the boundary only emits domain types (`AccountInfo`, `MarketStatus`, `BrokerActivity`).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39 -->

## SDK usage and bypass

The provider uses `@alpacahq/typescript-sdk` (v0.0.32-preview) selectively for broker REST calls — the SDK is a Deno-to-Node transpile, marked no-longer-maintained, but the broker-side endpoints work reliably. Rewriting them with raw `fetch` would be unnecessary churn.

| SDK method           | Used to implement                                                          |
| -------------------- | -------------------------------------------------------------------------- |
| `client.getAccount`  | `getAccountInfo()`                                                         |
| `client.getClock`    | `getMarketStatus()` (session derived client-side from `is_open` + windows) |
| `client.getActivity` | `getActivities(filter)` (with manual query-param construction)             |

**Streaming, stock quotes, option snapshots, and option chains do not go through Alpaca anymore.** Those concerns were removed from the Alpaca path entirely in US-39 — see the [Massive market-data adapter](../domain/market-data.md) for current behaviour.

### Deprecated `src/main/integrations/alpaca.ts`

The pre-existing `src/main/integrations/alpaca.ts` (`client`, `resetClient`) is marked `@deprecated`. It remains in the tree to avoid breaking any in-flight branch that imports it, but no new code uses it — new code goes through `createBrokerProvider`. Removal happens once downstream callers have migrated.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39 -->

## REST surface

Each REST method is wrapped in a `try` / `wrapError(err, opLabel)` block that normalises HTTP 401 → `auth_failed`, 429 → `rate_limited`, network failures → `network_error`, and unknown failures → `unknown` (IPC handlers default that to `internal_error`).

### `getAccountInfo(): Promise<AccountInfo>`

- **SDK method:** `client.getAccount`.
- **Returns:** `{ buyingPower, portfolioValue, cash, environment: 'paper' | 'live' }`. `environment` is derived from the provider's `paper` config flag — Alpaca's `getAccount()` carries no paper/live indicator.
- **IPC channel:** `broker:account-info` (US-39 split namespace).

### `getMarketStatus(): Promise<MarketStatus>`

- **SDK method:** `client.getClock`.
- **Used by:** `broker:market-status` IPC handler, polled by the renderer's `useMarketStatus()` hook every 60 s. Drives the `MarketStatusPill` (`LIVE` / `EXT` / `CLOSED` / `DELAYED`). Also queried by the `PollingScheduler` per tick to decide the next-tick cadence (see [Activity polling pattern](#activity-polling-pattern-us-35) below).
- **Returns:** `{ isOpen, nextOpen, nextClose, session: 'regular' | 'pre' | 'post' | 'closed' }`. Alpaca's `/v2/clock` only returns `is_open`, `next_open`, `next_close` — `session` is **derived client-side** by comparing the clock timestamp against calendar windows (pre: 4:00–9:30 AM ET, regular: 9:30 AM–4:00 PM ET when `is_open`, post: 4:00–8:00 PM ET, closed: otherwise).
- **Why poll instead of stream?** Alpaca offers no streaming option for clock/session changes; transitions are predictable boundaries (4 AM, 9:30 AM, 4 PM, 8 PM ET, weekends/holidays) so a 60 s poll catches them within a minute.
- **Why broker, not market-data?** Per US-39, Massive's market-status endpoint is per-asset-class and doesn't map cleanly to the single `MarketStatus` shape — Alpaca's clock is the authoritative session signal used across the UI and scheduler.

### `getActivities(filter): Promise<BrokerActivity[]>`

- **SDK method:** `client.getActivity` (with manual query-param construction — the SDK ignores some params on this endpoint).
- **Filter shape:** `{ type: string; since?: string /* ISO-8601 */ }`. `type` is an Alpaca activity code:
  - `'OPASN'` — option assignment (the only consumer in the codebase today; see US-35)
  - `'OPEXP'` — option expiration
  - `'OPXRC'` — option exercise
- **Returns:** array sorted by `transactionTime` descending. Each entry carries `activityId`, `activityType`, `symbol`, `qty`, `price`, `transactionTime`.
- **IPC channel:** `broker:activities` (US-39 split namespace).

<!-- /generated -->

<!-- generated:from us-35 -->

## Activity polling pattern (US-35)

US-35 is the first real consumer of `BrokerProvider.getActivities({ type: 'OPASN', since })`. It introduces a watermark + dedupe pattern that any future activity-polling job (`OPEXP`, `OPXRC`, etc.) should follow.

### Watermark captured at poll start, not poll end

The detection service stamps `pollStartedAt = new Date().toISOString()` **before** awaiting `brokerProvider.getActivities({ type: 'OPASN', since })`, then persists that timestamp (not `now()`) once the batch completes successfully.

- **Why:** Stamping at the end of the call would lose any activity that lands during the broker round trip. Stamping at the start means anything that arrived during the gap is replayed on the next poll, and dedupe handles it.
- **Cost:** Slightly more re-processing per poll — bounded by the activity volume during the call, and absorbed by `INSERT OR IGNORE` against the compound unique index.

### Per-environment watermark keys

The watermark is stored in the `app_settings` key-value table (owned by main's migration 006; see [domain/market-data.md](../domain/market-data.md) for the table shape). Keys are **per environment**, with an `:env` suffix:

- `assignments_last_poll_at:paper`
- `assignments_last_poll_at:live`

This keeps paper and live histories independent — switching the active broker environment (US-37) starts the new environment's polling from its own last-seen watermark without leaking activity from the other.

The same suffix convention should be used for any future activity-polling watermark (`<job>_last_poll_at:<env>`).

### Dedupe via compound UNIQUE

Detected assignments are persisted with `INSERT OR IGNORE` against `UNIQUE(activity_id, position_id)` on `pending_assignments` (see migration `008_create_pending_assignments.sql`). The compound index allows one pending row per matching position when a single OPASN activity collides with multiple open CSPs on the same OCC symbol, while still rejecting genuine replays.

### `BrokerError` handling and scheduler back-off

When `getActivities` throws a `BrokerError`, the detect-assignments job classifies and surfaces it without crashing the app:

| `BrokerError.code`     | Detection-service behaviour                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `network_error`        | WARN log + bail out of the tick. Watermark is **not** advanced; the next scheduler tick retries naturally.            |
| `auth_failed`          | Typed return (`{ detected: 0, skipped: 0, brokerError: { code: 'auth_failed' } }`). Scheduler can back off this job.  |
| `rate_limited`         | WARN log + bail out; treated like `network_error` from the poll's perspective. Recovery on the next tick.             |
| `environment_mismatch` | Typed return; surfaced via the settings page during credential entry, not during a normal poll.                       |
| other / unknown        | WARN log + bail out; the scheduler's outer try/catch ensures it does not stop the scheduler (see `PollingScheduler`). |

The job handler in `src/main/index.ts` lazy-reads `brokerFactory.create()` plus `settings.getCredentialStatus().activeBrokerEnv` on every tick, then **short-circuits to a no-op when `activeBrokerEnv === 'none'`** — there is nothing to poll when no environment is active, and US-37's runtime credential changes flow through without restart.

### Polling cadence

The job registers with the `PollingScheduler` (see [features/us-46-polling-scheduler.md](../features/us-46-polling-scheduler.md)) using a market-aware interval policy:

```ts
{
  kind: 'interval',
  marketOpenMs: 60_000,      // 60s during regular hours
  extendedHoursMs: 300_000,  // 5min during pre/post
  marketClosedMs: null       // parked overnight; next run on market open
}
```

OPASN events typically post overnight after expiration, so the next morning's first poll catches them; during-hours polling exists for same-day early-exercise corner cases.

<!-- /generated -->

<!-- generated:from us-37 -->

## Broker settings and environment selection (US-37)

US-37 moves Alpaca credentials into encrypted settings persistence and adds runtime broker-environment switching, while keeping Massive's shared app-level configuration out of user settings.

- **Encrypted persistence.** `src/main/services/settings.ts` stores Alpaca paper and live credentials in `credential_settings` with Electron `safeStorage.encryptString`. Plaintext secrets never round-trip to the renderer — saved cards render masked placeholders plus a `Replace` flow.
- **Active environment persisted separately.** `app_settings.active_broker_environment` stores `'paper' | 'live' | 'none'`. `createBrokerProvider` resolves the effective environment via this setting plus credential presence.
- **Broker-only refresh.** Settings mutations that change broker state call `brokerFactory.recreate()`, which rebuilds only the broker provider cache. The Massive market-data factory is **not** touched — quote streams and option polls continue uninterrupted.
- **Vendor-scoped query invalidation.** Renderer query keys are namespaced (`['broker', ...]` vs `['market', ...]`). Settings mutations invalidate broker queries via a predicate on `queryKey[0] === 'broker'`, refreshing buying power / activities / market-status surfaces without causing stock or option quote churn.
- **LIVE confirmation.** The renderer shows a `LiveBrokerConfirmDialog` before invoking `settings:set-active-broker-environment` with `environment: 'live'`. Switching from live back to paper is immediate (no dialog).

### Settings probe flows

Settings-side Alpaca probes are intentionally separate from regular `BrokerProvider` reads so the app can test paper and live environments directly without depending on the currently active broker:

- **Candidate credentials:** `settings:test-connection` with `{ vendor: 'alpaca', environment, keyId, secret }` calls `GET /v2/account` against paper or live using the candidate credentials and returns a masked account number on success.
- **Stored credentials:** `settings:test-stored-alpaca-connection` loads encrypted credentials for the requested environment and runs the same probe without exposing secrets back to the renderer.
- **Environment mismatch:** entering live keys in the paper card returns `environment_mismatch` with the exact message `Environment mismatch — these are LIVE keys, not paper keys`. (`environment_mismatch` was added to `BrokerError` in US-39 specifically for this detection.)

All Alpaca HTTP/SDK interaction stays inside `alpaca-broker.ts` or the settings-probe helpers in `src/main/services/settings-connections.ts`; the renderer and IPC layers only see typed result objects.

<!-- /generated -->

<!-- generated:from us-39 -->

## Massive market-data adapter (US-39)

US-39 introduced `MassiveMarketDataProvider` as the second concrete `MarketDataProvider` implementation and **removed the old `AlpacaMarketDataProvider` class entirely**. Market data and broker are now two independent stacks.

This page documents the Alpaca side; below is a brief summary of the Massive side and how it relates.

- **REST-only, raw `fetch`.** No SDK — Massive has no official Node client and Node 20+ `fetch` is sufficient. Bearer auth via `Authorization: Bearer ${apiKey}` header.
- **Shared app configuration.** The Massive API key loads once per process from app configuration (not user settings). US-37 deliberately keeps Massive out of `credential_settings`.
- **Optional Greeks.** `OptionSnapshot.greeks` and `OptionSnapshot.impliedVolatility` are optional — the adapter returns `undefined` when Massive omits them rather than fabricating zeros. Renderers must use `snapshot.greeks?.delta` and render `—` when absent.
- **Streaming declared but deferred.** `supportsStreaming('stockQuotes' | 'optionQuotes')` returns `true`, but `stream()` throws `MarketDataError` with `code: 'streaming_unsupported'`. REST polling meets Phase 2 requirements; Massive WebSocket auth is a separate story.
- **`market-data:*` IPC.** New `market-data:stock-quotes` (plural batch), `market-data:option-snapshot` (singular per-contract), and `market-data:option-chain` (filtered paginated) channels replace the old US-33 `market-data:option-snapshots` plural-bulk channel.
- **No fallback to Alpaca.** Users without Massive configured see a clear `auth_failed` error; the codebase does not retain a dual-path implementation.

See [domain/market-data.md](../domain/market-data.md) and [contracts/ipc-handlers.md](./ipc-handlers.md) for the full Massive surface.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39 -->

## Error model

Every SDK error path and every probe failure funnels through a single helper inside the adapter:

```ts
function wrapError(err: unknown, op: string): never {
  // inspect err.response.status, err.code, etc.
  // throw new BrokerError({ op, code: '<code>', cause: err })
}
```

`BrokerError` is a structured `Error` subclass with a discriminating `code` field:

| Code                   | When                                                                             |
| ---------------------- | -------------------------------------------------------------------------------- |
| `auth_failed`          | SDK rejects credentials (HTTP 401, missing credentials)                          |
| `network_error`        | Upstream unreachable, DNS failure, timeout                                       |
| `rate_limited`         | SDK returns HTTP 429                                                             |
| `environment_mismatch` | Live keys submitted to paper card or vice versa (US-39 addition; US-37 consumer) |
| `unknown`              | Catch-all for unclassified failures                                              |

`MarketDataError` is a parallel taxonomy used by the Massive adapter and the (now-removed) old Alpaca market-data path — see [domain/market-data.md](../domain/market-data.md). Per US-39, `MarketDataError` no longer includes `options_no_subscription` (Alpaca-specific code) since Alpaca no longer serves market data.

**Errors are thrown, not returned** (no `Result<T, E>` tuples), consistent with the rest of the codebase. IPC handler layers map the codes directly to envelope error codes — see the [Standard error codes](./ipc-handlers.md#standard-error-codes) table. Unclassified exceptions propagate as generic `Error` and become `internal_error` at the handler.

The adapter records **no explicit retry policy, no exponential backoff, and no per-call rate-limit tracker**. Recovery is:

- For broker reads driven by the renderer: the next user action (refresh, re-mount of the settings or positions page) or the next 60 s `useMarketStatus` poll.
- For broker reads driven by the scheduler: the next tick (cadence-aware) — see the [Activity polling pattern](#activity-polling-pattern-us-35).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39 -->

## Source files

- `src/main/integrations/broker-provider.ts` — `BrokerProvider` interface; `AccountInfo`, `MarketStatus`, `BrokerActivity`, `ActivityFilter` types; `BrokerError` class.
- `src/main/integrations/alpaca-broker.ts` — `AlpacaBrokerProvider` implementation. The only file in the repo permitted to import `@alpacahq/typescript-sdk`. Owns lazy SDK client construction, REST mapping for `getAccountInfo` / `getMarketStatus` / `getActivities`, and `wrapError` normalisation.
- `src/main/integrations/broker-factory.ts` — `createBrokerProvider` factory + `brokerFactory.recreate()`. Resolves the active environment via `src/main/services/settings.ts`.
- `src/main/integrations/fake-broker.ts` — `FakeBrokerProvider` for e2e and dev; env-driven canned responses.
- `src/main/integrations/alpaca.ts` — pre-existing helper marked `@deprecated`; kept available, no new code uses it.
- `src/main/ipc/broker.ts` — `broker:account-info`, `broker:market-status`, `broker:activities` IPC handlers (US-39 split namespace).
- `src/main/services/settings.ts` — encrypted `credential_settings` persistence; `getCredentialStatus()` reads the active broker environment.
- `src/main/services/settings-connections.ts` — Massive and Alpaca probe helpers with typed error mapping. The Alpaca probes (`settings:test-connection`, `settings:test-stored-alpaca-connection`) are deliberately separate from regular `BrokerProvider` reads.
- `src/main/services/detect-assignments.ts` — US-35 poll job. Captures `pollStartedAt` before `getActivities`, persists per-environment watermarks (`assignments_last_poll_at:paper` / `:live`), handles `BrokerError.code` for graceful back-off.
- `src/main/services/scheduler-instance.ts` — module-level singleton `PollingScheduler` with safe-broker fallback. Consumes `BrokerProvider.getMarketStatus()` per tick for cadence decisions.
- `src/main/index.ts` — wires broker handlers against a current-provider accessor so US-37 settings changes recreate only the broker provider; registers the US-35 `detect-assignments` job; consolidated `before-quit` awaits `Promise.all([scheduler.stop(), marketDataProvider.disconnect()])`.

For the Massive market-data adapter files (`massive-market-data.ts`, `market-data-provider.ts`, `market-data-factory.ts`, `massive-credentials.ts`, `fake-market-data.ts`, `src/main/ipc/market-data.ts`), see [domain/market-data.md](../domain/market-data.md).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39 -->

## Driven by

- [us-31 — Market Data Provider Adapter](../features/us-31-market-data-provider-adapter.md)
- [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)
- [us-33 — Option Mid Price & Unrealized P&L](../features/us-33-option-mid-pnl.md)
- [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md)
- [us-37 — Paper / Live Broker Environment Toggle](../features/us-37-paper-live-broker-environment-toggle.md)
- [us-39 — Massive Market Data Provider](../features/us-39-massive-market-data-provider.md)

<!-- /generated -->

<!-- Hand-written sections below this line are preserved across regeneration. -->
