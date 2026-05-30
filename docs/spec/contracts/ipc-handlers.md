# IPC Handlers

<!-- generated:from us-4,us-12,us-12-refactor,us-32 -->
## Overview

Every interaction between the renderer and the main process flows through `ipcMain.handle` channels registered under `src/main/ipc/`. Handlers follow a strict envelope contract: they return either `{ ok: true, ...result }` or `{ ok: false, errors: [{ field, code, message }] }` and **never throw to the renderer** (per `CLAUDE.md`). Validation and error normalisation are centralised in two helpers in `src/main/ipc/utils.ts`: `handleIpcCall(logLabel, fn)` wraps any handler with try/catch + structured logging, and `registerParsedPositionHandler(db, channel, errLabel, schema, service)` adds Zod payload parsing on top for the common "validate → call service → return result" shape used by every position mutation handler.

Two transport patterns are in use. Most handlers are request/response (`ipcRenderer.invoke` ↔ `ipcMain.handle`) and carry a Zod-validated payload from the renderer through to a service function. The market-data subsystem additionally uses **fire-and-forget push events** (`webContents.send` ↔ `ipcRenderer.on`) for stream ticks (`market-data:stock-quote`) and stream failures (`market-data:stream-error`); these are one-way, main → renderer, and have no response envelope. Payload validation happens twice: the renderer adapter (`src/renderer/src/api/*.ts`) maps snake_case form state to camelCase IPC fields, and the main-process handler re-validates via the matching `*PayloadSchema` from `src/main/schemas.ts` before calling the service.
<!-- /generated -->

<!-- generated:from us-4,us-12,us-12-refactor,us-32 -->
## Handler reference

Handlers are grouped by namespace. Each subsection documents the request payload, success response, error codes, source path, and the feature page that introduced it.

### `positions:get`

- **Purpose:** hydrate the position detail page with full position record, current active leg, and latest cost-basis snapshot.
- **Request:**
  ```typescript
  {
    positionId: string // UUID
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: WheelPhase
      status: WheelStatus
      openedDate: string        // ISO date
      closedDate: string | null
    },
    activeLeg: {
      id: string
      legRole: string           // 'CSP_OPEN' | 'CC_OPEN' | 'ROLL_TO'
      action: string
      optionType: string
      strike: string            // 4 dp TEXT
      expiration: string        // ISO date
      contracts: number
      premiumPerContract: string // 4 dp TEXT
      fillDate: string          // ISO date
    } | null,
    costBasisSnapshot: {
      id: string
      basisPerShare: string           // 4 dp TEXT
      totalPremiumCollected: string   // 4 dp TEXT
      finalPnl: string | null         // 4 dp TEXT, set on close
    } | null
  }
  ```
- **Error codes:**

  | field | code | message |
  | --- | --- | --- |
  | `__root__` | `not_found` | `Position not found` |
  | `__root__` | `internal_error` | `An unexpected error occurred` |

- **Active-leg resolution:** the underlying query is phase-aware (`CSP_OPEN → CSP_OPEN|ROLL_TO`, `CC_OPEN → CC_OPEN|ROLL_TO`) and ties break with `ORDER BY fill_date DESC, created_at DESC LIMIT 1`. The same SQL fragment is shared via `activeLegSubquery()` in `src/main/services/active-leg-sql.ts` so the positions list and detail views agree.
- **Source:** `src/main/ipc/positions.ts`, `src/main/services/get-position.ts`, `src/main/services/active-leg-sql.ts`
- **Driven by:** [us-4 — Close a CSP early](../features/us-4-close-csp.md)

### `positions:close-csp`

- **Purpose:** record a buy-to-close transaction for an open CSP, persist a `CSP_CLOSE` leg and cost-basis snapshot with `final_pnl`, and transition the position to `CSP_CLOSED_PROFIT` or `CSP_CLOSED_LOSS`.
- **Request:**
  ```typescript
  {
    positionId: string                 // UUID — required
    closePricePerContract: number      // positive number — required
    fillDate?: string                  // ISO date (YYYY-MM-DD) — defaults to today
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'CSP_CLOSED_PROFIT' | 'CSP_CLOSED_LOSS'
      status: 'CLOSED'
      closedDate: string    // ISO date
    },
    leg: {
      id: string
      legRole: 'CSP_CLOSE'
      action: 'BUY'
      optionType: 'PUT'
      strike: string        // 4 dp TEXT
      expiration: string    // ISO date
      contracts: number
      premiumPerContract: string  // 4 dp TEXT (= close price)
      fillDate: string            // ISO date
    },
    costBasisSnapshot: {
      id: string
      basisPerShare: string             // 4 dp TEXT
      totalPremiumCollected: string     // 4 dp TEXT
      finalPnl: string                  // 4 dp TEXT
    }
  }
  ```
- **Error codes:**

  | field | code | message |
  | --- | --- | --- |
  | `__phase__` | `invalid_phase` | `Position is not in CSP_OPEN phase` |
  | `closePricePerContract` | `must_be_positive` | `Close price must be positive` |
  | `fillDate` | `close_date_before_open` | `Close date cannot be before the open date` |
  | `fillDate` | `close_date_after_expiration` | `Close date cannot be after expiration date` |
  | `__root__` | `internal_error` | `An unexpected error occurred` |

- **Note:** breakeven (`netPnl == 0`) is classified as `CSP_CLOSED_LOSS`. Fill date equal to expiration is accepted. `fillDate` defaults to `new Date().toISOString().slice(0, 10)` when omitted.
- **Source:** `src/main/ipc/positions.ts`, `src/main/services/close-csp-position.ts`
- **Driven by:** [us-4 — Close a CSP early](../features/us-4-close-csp.md)

### `positions:roll-csp`

- **Purpose:** atomically record a CSP roll as a linked `ROLL_FROM` (buy-to-close) / `ROLL_TO` (sell-to-open) leg pair sharing a `roll_chain_id`, recalculate cost basis, and keep the position in `CSP_OPEN`.
- **Request:**
  ```typescript
  // Zod schema: RollCspPayloadSchema
  {
    positionId: string                  // UUID
    costToClosePerContract: number      // positive
    newPremiumPerContract: number       // positive
    newExpiration: string               // YYYY-MM-DD (strict regex)
    newStrike?: number                  // positive; defaults to current strike (roll-out)
    fillDate?: string                   // YYYY-MM-DD; defaults to today
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'CSP_OPEN'
      status: 'ACTIVE'
    },
    rollFromLeg: LegRecord,   // ROLL_FROM BUY leg
    rollToLeg: LegRecord,     // ROLL_TO SELL leg
    rollChainId: string,      // shared UUID
    costBasisSnapshot: CostBasisSnapshotRecord
  }
  ```
- **Error codes:**

  | field | code | message |
  | --- | --- | --- |
  | `__phase__` | `invalid_phase` | `Position is not in CSP_OPEN phase` |
  | `newExpiration` | `must_be_after_current` | `New expiration must be after the current expiration` |
  | `costToClosePerContract` | `must_be_positive` | `Cost to close must be greater than zero` |
  | `newPremiumPerContract` | `must_be_positive` | `New premium must be greater than zero` |
  | `__root__` | `not_found` | `Position not found` |
  | `__root__` | `no_active_leg` | `Position has no active leg` |

- **Registration:** uses `registerParsedPositionHandler(db, 'positions:roll-csp', 'positions_roll_csp_unhandled_error', RollCspPayloadSchema, rollCspPosition)` — no inline `ipcMain.handle` boilerplate.
- **Source:** `src/main/ipc/positions.ts`, `src/main/services/roll-csp-position.ts`
- **Driven by:** [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md)

### `market-data:stock-quotes`

- **Purpose:** REST-style snapshot of current price, bid/ask, and `prevClose` for a list of tickers. Used by `useStockQuotes` as the TanStack Query `queryFn` to seed the cache before stream ticks arrive.
- **Request:**
  ```typescript
  // Zod: GetStockQuotesPayloadSchema
  {
    tickers: string[]   // each min(1) max(10) chars; up to 50 tickers; empty array is valid
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    quotes: Record<string, IpcStockQuote>
  }

  type IpcStockQuote = {
    price: string              // 2dp
    bid: string                // 2dp
    ask: string                // 2dp
    prevClose: string | null   // 2dp; populated on REST seed; null on stream tick
    volume: number
    timestamp: string          // ISO-8601
  }
  ```
- **Error codes:**

  | field | code | message |
  | --- | --- | --- |
  | `__root__` | `auth_failed` | provider auth rejected |
  | `__root__` | `network_error` | upstream network failure |
  | `__root__` | `rate_limited` | provider rate limit hit |
  | `__root__` | `internal_error` | uncaught error |
  | (zod path) | (zod code) | zod issue message |

- **Note:** the renderer adapter throws `apiError(502, { detail: result.errors })` on `ok: false` so TanStack Query sets `isError`. `change` / `changePercent` are intentionally NOT included in `IpcStockQuote` — the renderer derives them from `(price, prevClose)`.
- **Source:** `src/main/ipc/market-data.ts`, `src/main/schemas.ts`
- **Driven by:** [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)

### `market-data:set-stock-quote-tickers`

- **Purpose:** tell the main process which tickers to subscribe to over the WebSocket stream. The renderer calls this whenever its active-ticker list changes; the handler tears down the previous Observable subscription, connects the provider on first non-empty call, subscribes to `provider.stream('stockQuotes', tickers)`, and pushes per-tick `market-data:stock-quote` events via `webContents.send`.
- **Request:**
  ```typescript
  // Zod: SetStockQuoteTickersPayloadSchema (alias of GetStockQuotesPayloadSchema)
  {
    tickers: string[]
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    subscribedTickers: string[]
  }
  ```
- **Error codes:**

  | field | code | message |
  | --- | --- | --- |
  | `__root__` | `auth_failed` | provider auth rejected |
  | `__root__` | `network_error` | upstream network failure |
  | `__root__` | `rate_limited` | provider rate limit hit |
  | `__root__` | `streaming_unsupported` | provider does not support streaming |
  | `__root__` | `internal_error` | uncaught error |
  | (zod path) | (zod code) | zod issue message |

- **Lifecycle:** module-scoped `connected` flag inside `registerMarketDataHandlers` ensures `provider.connect()` runs at most once per app session; `app.on('before-quit', () => provider.disconnect())` closes the socket on shutdown. Empty array tears down without reconnecting.
- **Source:** `src/main/ipc/market-data.ts`
- **Driven by:** [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)

### `market-data:market-status`

- **Purpose:** return current session (`regular`/`pre`/`post`/`closed`) plus `nextOpen`/`nextClose` timestamps. Polled by `useMarketStatus()` every 60 s to drive the `MarketStatusPill`.
- **Request:** none.
- **Response (success):**
  ```typescript
  {
    ok: true,
    status: {
      isOpen: boolean
      nextOpen: string    // ISO-8601
      nextClose: string   // ISO-8601
      session: 'regular' | 'pre' | 'post' | 'closed'
    }
  }
  ```
- **Error codes:**

  | field | code | message |
  | --- | --- | --- |
  | `__root__` | `auth_failed` | provider auth rejected |
  | `__root__` | `network_error` | upstream network failure |
  | `__root__` | `rate_limited` | provider rate limit hit |
  | `__root__` | `internal_error` | uncaught error |

- **Source:** `src/main/ipc/market-data.ts`
- **Driven by:** [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)
<!-- /generated -->

<!-- generated:from us-4,us-12,us-12-refactor,us-32 -->
## Push events

Push events are one-way `main → renderer` messages sent via `webContents.send`. They carry no response envelope; the renderer subscribes through `window.api.on*` (which returns an unsubscribe function wrapping `ipcRenderer.removeListener`).

### `market-data:stock-quote`

- **Channel:** `market-data:stock-quote`
- **Direction:** main → renderer
- **Payload:**
  ```typescript
  type IpcStockQuoteEvent = {
    ticker: string
    quote: IpcStockQuote   // prevClose is always null on a tick
  }
  ```
- **Trigger:** emitted from inside the Observable subscription's `next` callback in the `market-data:set-stock-quote-tickers` handler, for every `StreamEvent<StockQuote>` received from the provider. The renderer's TanStack Query cache merges the tick into the existing entry via `setQueryData`, carrying `prevClose` forward from whatever the REST seed populated.
- **Source:** `src/main/ipc/market-data.ts`
- **Driven by:** [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)

### `market-data:stream-error`

- **Channel:** `market-data:stream-error`
- **Direction:** main → renderer
- **Payload:**
  ```typescript
  type IpcStreamErrorEvent = {
    feed: 'stockQuotes' | 'optionQuotes' | 'optionTrades'
    code: string         // mirrors provider StreamError.code
    message: string
    reconnectable: boolean
  }
  ```
- **Trigger:** emitted when the provider's stream Observable errors (WebSocket failure, auth loss, etc.). For US-32 the `feed` is always `'stockQuotes'`. The renderer treats receipt of this event as an immediate signal to render the `StaleDataBanner` and override the market-status pill to `DELAYED`, bypassing the 5-minute freshness threshold.
- **Source:** `src/main/ipc/market-data.ts`
- **Driven by:** [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)
<!-- /generated -->

<!-- generated:from us-4,us-12,us-12-refactor,us-32 -->
## Standard error codes

Cross-handler catalogue of every error `code` value emitted, with the set of handlers that produce it.

| code | meaning | used by |
| --- | --- | --- |
| `invalid_phase` | wrong position phase for the requested operation | `positions:close-csp`, `positions:roll-csp` |
| `must_be_positive` | numeric input was ≤ 0 | `positions:close-csp`, `positions:roll-csp` |
| `must_be_after_current` | new date is not strictly after the current date being replaced | `positions:roll-csp` |
| `close_date_before_open` | close fill date earlier than open leg's fill date | `positions:close-csp` |
| `close_date_after_expiration` | close fill date later than the option's expiration | `positions:close-csp` |
| `not_found` | record (position) does not exist | `positions:get`, `positions:roll-csp` |
| `no_active_leg` | position has no resolvable active open leg | `positions:roll-csp` |
| `auth_failed` | upstream market-data provider rejected credentials | `market-data:stock-quotes`, `market-data:set-stock-quote-tickers`, `market-data:market-status` |
| `network_error` | upstream market-data provider unreachable | `market-data:stock-quotes`, `market-data:set-stock-quote-tickers`, `market-data:market-status` |
| `rate_limited` | upstream market-data provider returned 429 | `market-data:stock-quotes`, `market-data:set-stock-quote-tickers`, `market-data:market-status` |
| `streaming_unsupported` | provider does not implement streaming for the requested feed | `market-data:set-stock-quote-tickers` |
| `internal_error` | uncaught error in the handler | all request/response handlers |
| `(zod path)` | Zod payload validation failure — `field` is the issue's `path.join('.')`, `code` is the Zod issue `code` | all schema-parsed handlers |

Sentinel `field` values used across handlers:

- `__phase__` — phase-mismatch errors (`positions:close-csp`, `positions:roll-csp`).
- `__root__` — errors not attributable to a specific input field (not-found, no-active-leg, provider errors, internal errors).

Renderer adapters in `src/renderer/src/api/*.ts` translate IPC camelCase field names back to renderer snake_case form-field names via an `IPC_TO_FORM_FIELD` map shared by `closePosition`, `createPosition`, and `rollCsp`. The shared `mapIpcErrors(errors)` helper lives in `src/renderer/src/api/positions.ts`.
<!-- /generated -->

<!-- generated:from us-4,us-12,us-12-refactor,us-32 -->
## Driven by

- [us-4 — Close a CSP early](../features/us-4-close-csp.md)
- [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md)
- [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)

(us-12-refactor introduced no new IPC handlers; it centralised the active-leg SQL into `src/main/services/active-leg-sql.ts` which is consumed by the existing `positions:get` handler and the positions list query. Tracked here for regeneration completeness.)
<!-- /generated -->

<!-- Hand-written sections below this line are preserved across regeneration. -->
