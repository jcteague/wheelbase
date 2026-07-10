# IPC Handlers

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-13,us-14,us-15,us-32,us-33,us-35,us-37,us-39 -->

## Overview

Every interaction between the renderer and the main process flows through `ipcMain.handle` channels registered under `src/main/ipc/`. Handlers follow a strict envelope contract: they return either `{ ok: true, ...result }` or `{ ok: false, errors: [{ field, code, message }] }` and **never throw to the renderer** (per `CLAUDE.md`). Validation and error normalisation are centralised in two helpers in `src/main/ipc/utils.ts`: `handleIpcCall(logLabel, fn)` wraps any handler with try/catch + structured logging, and `registerParsedPositionHandler(db, channel, errLabel, schema, service)` adds Zod payload parsing on top for the common "validate → call service → return result" shape used by every position mutation handler.

**Documented envelope deviation (us-35).** The `assignments:confirm` and `assignments:dismiss` handlers return an error envelope with an **additional top-level `code` field** alongside the standard `errors` array: `{ ok: false, code: 'NOT_FOUND' | 'NOT_PENDING' | 'TRANSITION_REJECTED', errors: [{ field: '__root__', code, message }] }`. The deviation exists because `handleIpcCall` cannot express a top-level discriminator alongside the field-level error array, and the renderer's banner state machine switches on the top-level `code` without having to scan the `errors[]` list. The shared helper `pendingAssignmentErrorResponse(err: PendingAssignmentError)` in `src/main/ipc/assignments.ts` produces this shape; treat it as an exceptional pattern, not a precedent — every other handler in this document uses the canonical `{ ok, errors }` envelope.

Two transport patterns are in use. Most handlers are request/response (`ipcRenderer.invoke` ↔ `ipcMain.handle`) and carry a Zod-validated payload from the renderer through to a service function. The market-data subsystem additionally uses **fire-and-forget push events** (`webContents.send` ↔ `ipcRenderer.on`) for stream ticks (`market-data:stock-quote`) and stream failures (`market-data:stream-error`); these are one-way, main → renderer, and have no response envelope. Payload validation happens twice: the renderer adapter (`src/renderer/src/api/*.ts`) maps snake_case form state to camelCase IPC fields, and the main-process handler re-validates via the matching `*PayloadSchema` from `src/main/schemas.ts` before calling the service.

**Broker / market-data namespace split (us-39).** US-39 separated broker concerns from market-data concerns at the IPC layer. The old `AlpacaMarketDataProvider` (which handled both quote data and broker calls) was replaced by two separate providers: `MassiveMarketDataProvider` (market data) and `AlpacaBrokerProvider` (broker). Three new `broker:*` channels (`broker:account`, `broker:market-status`, `broker:activities`) now route to `AlpacaBrokerProvider` via `src/main/ipc/broker.ts`. All `market-data:*` channels route to `MassiveMarketDataProvider` via `src/main/ipc/market-data.ts`. The `market-data:market-status` channel (which previously forwarded to Alpaca) is now served by `broker:market-status`; the old channel name is still registered for backward compatibility but the canonical broker path is the `broker:*` namespace.

**Leg shape (`instrumentType`, not `optionType`).** us-6 renamed the leg field `optionType` → `instrumentType` across every handler that returns a leg and added `'STOCK'` as a third enum value (`PUT | CALL | STOCK`). The DB column was renamed from `option_type` to `instrument_type` via `migrations/003_rename_option_type_to_instrument_type.sql`, and the CHECK constraint was expanded accordingly. All handler responses below use `instrumentType`; older plan extracts that still reference `optionType` are stale.

**`LegAction` enum.** Now `'SELL' | 'BUY' | 'EXPIRE' | 'ASSIGN' | 'EXERCISE'` — `'EXPIRE'` was added by us-5 (expire-worthless), `'ASSIGN'` by us-6 (broker-initiated stock delivery), and `'EXERCISE'` by us-10 (broker-initiated shares delivered out via call-away). All are type-only changes; the `legs.action` column has no CHECK constraint.

**`LegRole` enum — terminal events are explicit.** us-11's green phase split previously-overloaded role values into distinct terminal-event values so the renderer can render the right row labels in `LegHistoryTable` without inferring intent from `legRole + action`. `CC_CLOSE` is now reserved for **buy-to-close** covered calls (the path served by `positions:close-cc-early`). `CALLED_AWAY` is the role written by `positions:record-call-away` (was previously emitted as `CC_CLOSE` before us-11). `CC_EXPIRED` is the role written by `positions:expire-cc` (was previously emitted as a generic `EXPIRE` before us-11). `EXPIRE` remains the role for CSP worthless-expiration via `positions:expire-csp`. The `legs.leg_role` column has no CHECK constraint — these are TypeScript/Zod enum extensions only.

**`rollChainId` on legs (us-15).** Every leg in the `LegRecord` shape now carries a `rollChainId: string | null` field. The roll services (`roll-csp-position.ts` and `roll-cc-position.ts`) write a shared UUID onto both halves of a roll pair (ROLL_FROM + ROLL_TO); every other write-path sets `rollChainId: null` explicitly. The `roll_chain_id` column was already present on `legs` (migration 001) — us-15 only exposed it through `positions:get` so the renderer's `buildRollTimeline` can group the two halves of a roll into a single visual section in `LegHistoryTable`. The `activeLeg` returned by `positions:get` still surfaces `rollChainId: null` even when the underlying row has a real UUID (a deliberate scoping decision — `activeLeg` is consumed only by the position header, not the timeline).

<!-- /generated -->

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-13,us-14,us-15,us-32,us-33,us-35,us-37,us-39,us-44,us-51,us-57-58,us-59 -->

## Handler reference

Handlers are grouped by namespace. Each subsection documents the request payload, success response, error codes, source path, and the feature page that introduced it.

### `positions:list`

- **Purpose:** hydrate the positions list page with every position plus its active-leg summary (strike, expiration, DTE) and latest cost-basis snapshot (premium collected, effective cost basis). Sorted by DTE ascending with `null` DTE (closed/expired positions) placed last.
- **Request:** none (no payload).
- **Response (success):**
  ```typescript
  {
    ok: true,
    positions: Array<{
      id: string                              // UUID
      ticker: string
      phase: WheelPhase
      status: WheelStatus                     // 'ACTIVE' | 'CLOSED'
      strike: string | null                   // 4 dp TEXT; null when no active option
      expiration: string | null               // ISO date; null when no active option
      dte: number | null                      // computed: (expiration − today).days; null when expiration is null
      premiumCollected: string                // 4 dp TEXT (= totalPremiumCollected from latest snapshot)
      effectiveCostBasis: string              // 4 dp TEXT (= basisPerShare from latest snapshot)
      instrumentType: 'PUT' | 'CALL' | null   // us-33: active leg's instrument_type; null when no active option
      contracts: number | null                // us-33: active leg's contracts; null when no active option
      entryPremiumPerContract: string | null  // us-33: active leg's premium_per_contract (4 dp TEXT); null when no active option
      profitTargetPercent: number | null      // us-33: positions.profit_target_percent override; null → resolved against the saved global default (us-57-58), DEFAULT_PROFIT_TARGET_PERCENT (50) only as final fallback
    }>
  }
  ```
- **Error codes:**

  | field      | code             | message                        |
  | ---------- | ---------------- | ------------------------------ |
  | `__root__` | `internal_error` | `An unexpected error occurred` |

- **Active-leg resolution:** uses the shared `activeLegSubquery()` from `src/main/services/active-leg-sql.ts` so the list and detail views agree — phase-aware (`CSP_OPEN → CSP_OPEN|ROLL_TO`, `CC_OPEN → CC_OPEN|ROLL_TO`) with `ORDER BY fill_date DESC, created_at DESC LIMIT 1` tie-breaking. Positions with no active option (e.g. `HOLDING_SHARES`, `WHEEL_COMPLETE`) return `strike`, `expiration`, and `dte` as `null`; the renderer renders `null` DTE as "Expired".
- **us-33 extension fields:** `instrumentType`, `contracts`, `entryPremiumPerContract` are sourced by extending the active-leg subquery's SELECT to include `l.instrument_type, l.contracts, l.premium_per_contract`. `profitTargetPercent` is read from the new `positions.profit_target_percent` column (added by migration `005_add_profit_target_percent.sql`). All four fields are `null` when no active option leg exists — i.e. on `HOLDING_SHARES`, `WHEEL_COMPLETE`, and any closed phase. `instrumentType` is the authoritative signal for "this row has an open option leg"; the renderer must not couple this purely on `phase`. `profitTargetPercent` is the per-position override only — when `null`, resolution flows through `resolveProfitTarget(override, defaultPercent)` (us-57-58: `src/main/core/alerts.ts`), which falls back to a saved global default before the hardcoded `DEFAULT_PROFIT_TARGET_PERCENT = 50` from `src/main/core/profit-target.ts`; the renderer supplies `defaultPercent` via `useAlertDefaults()` and the alert-evaluation scheduler supplies it via `getAlertDefaults(db)` (`src/main/services/alert-defaults.ts`) so the badge, the alert engine, and both new forms agree. Callers that omit the second argument still get the constant unchanged. `0` is preserved as a real override.
- **Sort order:** DTE ascending, with `null` placed last so the trader sees positions closest to decision points first.
- **Source:** `src/main/services/list-positions.ts`, `src/main/services/active-leg-sql.ts`
- **Driven by:** [us-2 — Position list](../features/us-2-position-list.md), [us-33 — Option Mid + Unrealized P&L](../features/us-33-option-mid-pnl.md)
- **Note:** us-2 was authored against a FastAPI backend (`GET /api/positions` returning a bare JSON array with snake_case fields `premium_collected` / `effective_cost_basis`). The codebase has since migrated to Electron IPC and the surviving service is `src/main/services/list-positions.ts`. The IPC channel name `positions:list` is **derived** by mirroring the existing `positions:get` namespace convention — us-2's plan referenced it indirectly in the us-4 ADR ("the existing `positions:list` returns summary data only") but did not author the channel itself. Treat the channel name as the most likely identifier rather than authoritative until confirmed against `src/main/ipc/positions.ts`.

### `positions:get`

- **Purpose:** hydrate the position detail page with full position record, current active leg, latest cost-basis snapshot, **the full leg history**, and **the full cost-basis-snapshot history** used by `LegHistoryTable` to derive a per-row running basis.
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
      instrumentType: string    // 'PUT' | 'CALL' | 'STOCK'
      strike: string            // 4 dp TEXT
      expiration: string        // ISO date
      contracts: number
      premiumPerContract: string // 4 dp TEXT
      fillDate: string          // ISO date
    } | null,
    costBasisSnapshot: {        // latest snapshot only
      id: string
      basisPerShare: string           // 4 dp TEXT
      totalPremiumCollected: string   // 4 dp TEXT
      finalPnl: string | null         // 4 dp TEXT, set on close
    } | null,
    legs: Array<LegRecord & {   // full leg history, fill_date ASC tie-broken by created_at ASC
      rollChainId: string | null  // us-15: shared UUID linking ROLL_FROM + ROLL_TO; null for every other leg
    }>,
    allSnapshots: Array<{       // full snapshot history, snapshot_at ASC (us-11)
      id: string
      positionId: string
      basisPerShare: string
      totalPremiumCollected: string
      finalPnl: string | null
      snapshotAt: string
      createdAt: string
    }>
  }
  ```
- **Error codes:**

  | field      | code             | message                        |
  | ---------- | ---------------- | ------------------------------ |
  | `__root__` | `not_found`      | `Position not found`           |
  | `__root__` | `internal_error` | `An unexpected error occurred` |

- **Active-leg resolution:** the underlying query is phase-aware (`CSP_OPEN → CSP_OPEN|ROLL_TO`, `CC_OPEN → CC_OPEN|ROLL_TO`) and ties break with `ORDER BY fill_date DESC, created_at DESC LIMIT 1`. The same SQL fragment is shared via `activeLegSubquery()` in `src/main/services/active-leg-sql.ts` so the positions list and detail views agree. After us-6, `activeLeg` returns `null` for `HOLDING_SHARES` positions — the ASSIGN leg is an event marker, not an ongoing option position.
- **`allSnapshots` use (us-11):** the renderer's `deriveRunningBasis()` pure helper iterates `legs` in `fillDate ASC` order with a carry-forward pointer scan over `allSnapshots` (sorted `snapshotAt ASC`) to attach a per-row `runningCostBasis` to each leg for the `LegHistoryTable` Running Basis column. `CC_CLOSE` legs have no snapshot of their own and inherit the prior CC_OPEN basis via the carry-forward. The handler itself is unchanged — the new field is added by `get-position.ts` running a second `SELECT * FROM cost_basis_snapshots WHERE position_id = ? ORDER BY snapshot_at ASC` query and including it in the result.
- **`rollChainId` on legs (us-15):** every entry in `legs[]` now carries a `rollChainId: string | null` field. `GET_LEGS_QUERY` was extended to `SELECT l.roll_chain_id`, `LegRow` gained `roll_chain_id: string | null`, and `mapLegRow` surfaces it. The renderer's `buildRollTimeline` (`src/renderer/src/lib/rollGroups.ts`) groups legs by `rollChainId` to render the visually-linked ROLL_FROM/ROLL_TO pair in `LegHistoryTable`. The `activeLeg` payload deliberately still surfaces `rollChainId: null` even when the underlying row is a ROLL_TO with a real UUID — `activeLeg` is only consumed by the position header, not the timeline, so the join was not extended. If a future feature needs `activeLeg.rollChainId`, the `GET_QUERY` JOIN must add `l.roll_chain_id`.
- **Planned (us-13, not yet implemented):** the response is expected to gain a `rollCount: number` field — the count of `legs` rows for the position with `leg_role = 'ROLL_TO'` — for the "Roll #N" badge on `RollCspSheet` and the 3+ informational warning. Treat this field as **planned**; us-13's plan directory has no `tasks.md` or `refactor-phase-results.md` yet, so the field is not live in the IPC contract.
- **Source:** `src/main/ipc/positions.ts`, `src/main/services/get-position.ts`, `src/main/services/active-leg-sql.ts`
- **Driven by:** [us-4 — Close a CSP early](../features/us-4-close-csp.md), [us-11 — Wheel leg chain display](../features/us-11-wheel-leg-chain-display.md), [us-15 — Roll pair timeline](../features/us-15-roll-pair-timeline.md)

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
      instrumentType: 'PUT'
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

  | field                   | code                          | message                                      |
  | ----------------------- | ----------------------------- | -------------------------------------------- |
  | `__phase__`             | `invalid_phase`               | `Position is not in CSP_OPEN phase`          |
  | `closePricePerContract` | `must_be_positive`            | `Close price must be positive`               |
  | `fillDate`              | `close_date_before_open`      | `Close date cannot be before the open date`  |
  | `fillDate`              | `close_date_after_expiration` | `Close date cannot be after expiration date` |
  | `__root__`              | `internal_error`              | `An unexpected error occurred`               |

- **Note:** breakeven (`netPnl == 0`) is classified as `CSP_CLOSED_LOSS`. Fill date equal to expiration is accepted. `fillDate` defaults to `new Date().toISOString().slice(0, 10)` when omitted.
- **Source:** `src/main/ipc/positions.ts`, `src/main/services/close-csp-position.ts`
- **Driven by:** [us-4 — Close a CSP early](../features/us-4-close-csp.md)

### `positions:expire-csp`

- **Purpose:** record an option that expired worthless. Validates the position is in `CSP_OPEN` and that today is on or after the option's expiration, writes an `EXPIRE` leg with `action='EXPIRE'`/`fill_price=null`, inserts a final cost-basis snapshot with 100 % of premium captured, and transitions the wheel to `WHEEL_COMPLETE` / `CLOSED`.
- **Request:**
  ```typescript
  // Zod schema: ExpireCspPayloadSchema
  {
    positionId: string                  // UUID — required
    expirationDateOverride?: string     // YYYY-MM-DD — optional, rarely used
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'WHEEL_COMPLETE'
      status: 'CLOSED'
      closedDate: string              // YYYY-MM-DD (= the open leg's expiration)
    },
    leg: {
      id: string
      positionId: string
      legRole: 'EXPIRE'
      action: 'EXPIRE'
      instrumentType: 'PUT'
      strike: string                  // copied from CSP_OPEN leg
      expiration: string              // copied from CSP_OPEN leg
      contracts: number               // copied from CSP_OPEN leg
      premiumPerContract: '0.0000'
      fillPrice: null
      fillDate: string                // = open leg's expiration date
      createdAt: string
      updatedAt: string
    },
    costBasisSnapshot: {
      id: string
      positionId: string
      basisPerShare: string
      totalPremiumCollected: string
      finalPnl: string                // equals totalPremiumCollected (100 % captured)
      snapshotAt: string
      createdAt: string
    }
  }
  ```
- **Error codes:**

  | field        | code             | message                                               |
  | ------------ | ---------------- | ----------------------------------------------------- |
  | `__root__`   | `not_found`      | `Position not found`                                  |
  | `__phase__`  | `invalid_phase`  | `Position is not in CSP_OPEN phase`                   |
  | `expiration` | `too_early`      | `Cannot record expiration before the expiration date` |
  | `__root__`   | `internal_error` | `An unexpected error occurred`                        |

- **Notes:** `referenceDate === expirationDate` (same-day) passes validation — standard equity options expire Saturday but stop trading Friday, and traders enter Friday as the expiration date. The expire leg's `fill_date` is set to the open leg's `expiration` (not "today"). `pnlPercentage` is the literal constant `"100.0000"` rather than a derived value.
- **Source:** `src/main/ipc/positions.ts`, `src/main/services/expire-csp-position.ts`
- **Driven by:** [us-5 — Record CSP expiration](../features/us-5-record-csp-expiration.md)

### `positions:assign-csp`

- **Purpose:** record a broker-initiated assignment on a `CSP_OPEN` position. Transitions the wheel to `HOLDING_SHARES` (still `ACTIVE`), writes an `ASSIGN`/`STOCK` event-marker leg, inserts a fresh cost-basis snapshot with `final_pnl=NULL` and basis-per-share = `strike − Σ(premium)` across all CSP / roll legs, and returns a per-leg `premiumWaterfall` so the renderer can render each deduction line.
- **Request:**
  ```typescript
  // Zod schema: AssignCspPayloadSchema
  {
    positionId: string // UUID — required
    assignmentDate: string // YYYY-MM-DD — required
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'HOLDING_SHARES'
      status: 'ACTIVE'           // unchanged — assignment is a transition, not a close
    },
    leg: {
      id: string
      positionId: string
      legRole: 'ASSIGN'
      action: 'ASSIGN'
      instrumentType: 'STOCK'
      strike: string             // copied from CSP_OPEN leg (assignment price)
      expiration: string         // copied from CSP_OPEN leg (for reference)
      contracts: number          // copied from CSP_OPEN leg
      premiumPerContract: '0.0000'
      fillPrice: null
      fillDate: string           // = the assignmentDate from payload
      createdAt: string
      updatedAt: string
    },
    costBasisSnapshot: {
      id: string
      positionId: string
      basisPerShare: string
      totalPremiumCollected: string
      finalPnl: null             // position still open
      snapshotAt: string
      createdAt: string
    },
    premiumWaterfall: Array<{
      label: string              // 'CSP premium' for CSP_OPEN, 'Roll credit' for ROLL_TO
      amount: string             // premiumPerContract for that leg (per-share, 4 dp)
    }>
  }
  ```
- **Error codes:**

  | field            | code               | message                                                  |
  | ---------------- | ------------------ | -------------------------------------------------------- |
  | `__root__`       | `not_found`        | `Position not found`                                     |
  | `__root__`       | `no_active_leg`    | `Position has no active leg`                             |
  | `__phase__`      | `invalid_phase`    | `Assignment can only be recorded on a CSP_OPEN position` |
  | `assignmentDate` | `date_before_open` | `Assignment date cannot be before the CSP open date`     |
  | `__root__`       | `internal_error`   | `An unexpected error occurred`                           |

- **Notes:** future `assignmentDate` values are **accepted** by the handler — the future-date warning ("This date is in the future — are you sure?") is client-side only (some brokers post assignment details over the weekend with a forward-dated business day). The boundary case `assignmentDate === openFillDate` is valid. The `premiumWaterfall` is computed by `calculateAssignmentBasis()` in the pure cost-basis engine; the service passes every `CSP_OPEN` and `ROLL_TO` leg from leg history.
- **Source:** `src/main/ipc/positions.ts`, `src/main/services/assign-csp-position.ts`
- **Driven by:** [us-6 — Record CSP assignment](../features/us-6-record-csp-assignment.md)

### `positions:open-cc`

- **Purpose:** sell a covered call against shares held after assignment. Validates `phase === 'HOLDING_SHARES'`, `contracts ≤ shares held` (sourced from the ASSIGN leg's contracts), and `fillDate` bounds (`>= assignmentDate`, `<= today`). Writes a `CC_OPEN` / `SELL` / `CALL` leg, inserts a cost-basis snapshot where `basisPerShare = prev − ccPremiumPerContract` and `totalPremiumCollected += ccPremium × contracts × 100`, and transitions the wheel to `CC_OPEN`.
- **Request:**
  ```typescript
  // Zod schema: OpenCcPayloadSchema
  {
    positionId: string                 // UUID
    strike: number                     // positive
    expiration: string                 // ISO date
    contracts: number                  // positive integer
    premiumPerContract: number         // positive
    fillDate?: string                  // ISO date; defaults to today
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'CC_OPEN'
      status: 'ACTIVE'
      closedDate: null
    },
    leg: {
      id: string
      positionId: string
      legRole: 'CC_OPEN'
      action: 'SELL'
      instrumentType: 'CALL'
      strike: string              // 4 dp TEXT
      expiration: string          // ISO date
      contracts: number
      premiumPerContract: string  // 4 dp TEXT
      fillPrice: null
      fillDate: string            // ISO date
      createdAt: string
      updatedAt: string
    },
    costBasisSnapshot: {
      id: string
      positionId: string
      basisPerShare: string             // = prevBasisPerShare − ccPremiumPerContract
      totalPremiumCollected: string     // = prev + (ccPremium × contracts × 100)
      finalPnl: null
      snapshotAt: string
      createdAt: string
    }
  }
  ```
- **Error codes:**

  | field                | code                | message                                                                                        |
  | -------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
  | `__phase__`          | `invalid_phase`     | `Position is not in HOLDING_SHARES phase` or `A covered call is already open on this position` |
  | `contracts`          | `exceeds_shares`    | `Contracts cannot exceed shares held ({n})`                                                    |
  | `fillDate`           | `before_assignment` | `Fill date cannot be before the assignment date`                                               |
  | `fillDate`           | `cannot_be_future`  | `Fill date cannot be in the future`                                                            |
  | `strike`             | `must_be_positive`  | `Strike must be positive`                                                                      |
  | `premiumPerContract` | `must_be_positive`  | `Premium per contract must be positive`                                                        |
  | `__root__`           | `internal_error`    | `An unexpected error occurred`                                                                 |

- **Notes:** the ASSIGN leg's `fill_date` is the source of truth for "assignment date" used in the `before_assignment` check (not the position record). The ASSIGN leg's `contracts` is the source of truth for shares held. Partial coverage (`ccContracts < assignLeg.contracts`) is **allowed** with a UI notice — not blocked. The strike-vs-basis guardrail is client-side only and non-blocking. `fillDate` defaults to today when omitted.
- **Source:** `src/main/ipc/positions.ts`, `src/main/services/open-covered-call-position.ts`
- **Driven by:** [us-7 — Open a covered call](../features/us-7-open-covered-call.md)

### `positions:close-cc-early`

- **Purpose:** record a buy-to-close transaction for an open covered call. Validates `phase === 'CC_OPEN'`, positive close price, and fill-date bounds (`>=` CC open fill date, `<=` CC expiration). Writes a single `CC_CLOSE` / `BUY` / `CALL` leg (copying strike / expiration / contracts from the active `CC_OPEN` leg, `premium_per_contract` and `fill_price` both set to the close price), transitions the position back to `HOLDING_SHARES`, and returns the CC leg P&L. The wheel stays `ACTIVE` with `closedDate = null`.
- **Request:**
  ```typescript
  // Zod schema: CloseCcPayloadSchema
  {
    positionId: string             // UUID — required
    closePricePerContract: number  // positive — required
    fillDate?: string              // YYYY-MM-DD — defaults to today
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'HOLDING_SHARES'
      status: 'ACTIVE'
      closedDate: null
    },
    leg: {                          // the new CC_CLOSE leg
      id: string
      positionId: string
      legRole: 'CC_CLOSE'
      action: 'BUY'
      instrumentType: 'CALL'
      strike: string                // copied from CC_OPEN leg, 4 dp TEXT
      expiration: string            // copied from CC_OPEN leg
      contracts: number             // copied from CC_OPEN leg (must match — no partial close)
      premiumPerContract: string    // = closePricePerContract, 4 dp TEXT
      fillPrice: string             // = premiumPerContract
      fillDate: string              // payload.fillDate or today
      createdAt: string
      updatedAt: string
    },
    ccLegPnl: string                // Decimal string, 4 dp; positive = profit, negative = loss
  }
  ```
- **Error codes:**

  | field                   | code                          | message                                                                        |
  | ----------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
  | `__phase__`             | `invalid_phase`               | `No open covered call on this position`                                        |
  | `closePricePerContract` | `must_be_positive`            | `Close price must be greater than zero`                                        |
  | `fillDate`              | `close_date_before_open`      | `Fill date cannot be before the CC open date`                                  |
  | `fillDate`              | `close_date_after_expiration` | `Fill date cannot be after the CC expiration date — use Record Expiry instead` |
  | `__root__`              | `not_found`                   | `Position not found`                                                           |
  | `__root__`              | `internal_error`              | `An unexpected error occurred`                                                 |

- **Notes:** **Deliberately does NOT insert a new `cost_basis_snapshots` row** — the CC_OPEN snapshot (written when the CC was opened) already reflects the CC premium reduction, and the wheel is still open with no final P&L. The `ccLegPnl` is computed as `(openPremium − closePrice) × contracts × 100` to 4 dp via `decimal.js` `ROUND_HALF_UP` and returned in the envelope (never persisted). Contracts must match the open CC; partial close is not supported. `fillDate` defaults to today when omitted. The active `CC_OPEN` leg is the source of truth for strike, expiration, contracts, and `openPremium`. Phase guard, positive-price guard, and date guards are evaluated by the pure `closeCoveredCall()` lifecycle function before the leg insert.
- **`CC_CLOSE` role scoping (us-11):** the `legRole: 'CC_CLOSE'` value written by this handler is **buy-to-close-only**. The two other CC-terminal paths use distinct role values — `positions:record-call-away` writes `'CALLED_AWAY'` (was previously `'CC_CLOSE'`) and `positions:expire-cc` writes `'CC_EXPIRED'` (was previously a generic `'EXPIRE'`). The renderer's `LegHistoryTable` switches premium-cell and annotation rendering on `legRole`, so the three paths must not share a role value.
- **Source:** `src/main/ipc/positions.ts`, `src/main/services/close-covered-call-position.ts`
- **Driven by:** [us-8 — Close a covered call early](../features/us-8-close-cc-early.md)

### `positions:expire-cc`

- **Purpose:** record a covered call that expired worthless. Validates `phase === 'CC_OPEN'` and that today (or `expirationDateOverride`) is on or after the CC's expiration, writes a single `CC_EXPIRED` / `EXPIRE` / `CALL` leg (`premium_per_contract = '0.0000'`, `fill_price = NULL`, `fill_date = recordedDate`), transitions the position back to `HOLDING_SHARES`, and returns the unchanged cost-basis snapshot plus `sharesHeld`. The wheel stays `ACTIVE` with `closedDate = null` — the trader keeps the shares and can sell another CC.
- **Request:**
  ```typescript
  // Zod schema: ExpireCcPayloadSchema
  {
    positionId: string                  // UUID — required
    expirationDateOverride?: string     // YYYY-MM-DD — optional; doubles as referenceDate AND recordedDate
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'HOLDING_SHARES'
      status: 'ACTIVE'
      closedDate: null
    },
    leg: {                                // the new CC_EXPIRED leg
      id: string
      positionId: string
      legRole: 'CC_EXPIRED'               // us-11: was 'EXPIRE' prior to the green phase
      action: 'EXPIRE'
      instrumentType: 'CALL'
      strike: string                      // copied from CC_OPEN leg
      expiration: string                  // copied from CC_OPEN leg
      contracts: number                   // copied from CC_OPEN leg
      premiumPerContract: '0.0000'
      fillPrice: null
      fillDate: string                    // = expirationDateOverride ?? CC_OPEN leg's expiration
      createdAt: string
      updatedAt: string
    },
    costBasisSnapshot: {                  // unchanged — re-returned as-is from the snapshot created at CC open
      id: string
      positionId: string
      basisPerShare: string
      totalPremiumCollected: string
      finalPnl: string | null
      snapshotAt: string
      createdAt: string
    },
    sharesHeld: number                    // = ASSIGN leg.contracts × 100
  }
  ```
- **Error codes:**

  | field        | code             | message                                                            |
  | ------------ | ---------------- | ------------------------------------------------------------------ |
  | `__root__`   | `not_found`      | `Position not found`                                               |
  | `__phase__`  | `invalid_phase`  | `No open covered call on this position`                            |
  | `__root__`   | `no_active_leg`  | `Position has no active leg`                                       |
  | `expiration` | `too_early`      | `Cannot record expiration before the expiration date (YYYY-MM-DD)` |
  | `__root__`   | `internal_error` | `An unexpected error occurred`                                     |

- **Notes:** **Deliberately does NOT insert a new `cost_basis_snapshots` row** — the CC premium was already captured when the CC was opened in us-7, and CC expiration is not a financial event. The existing snapshot is re-returned on the envelope for renderer convenience. `referenceDate === expirationDate` (same-day) is **allowed**; only `referenceDate < expirationDate` rejects with `too_early`. The `too_early` message interpolates the literal `expirationDate` (e.g. `"Cannot record expiration before the expiration date (2026-02-21)"`). The `expirationDateOverride` field plays double duty: when supplied it acts as both the `referenceDate` for the date guard AND the `recordedDate` used for the leg's `fill_date`; when omitted, `referenceDate` defaults to today and `recordedDate` defaults to the CC_OPEN leg's expiration. `sharesHeld` is computed server-side from the ASSIGN leg's `contracts × 100` so the renderer does not need to re-query. The wrong-phase rejection message is intentionally distinct from `positions:expire-csp` ("No open covered call on this position" vs "Position is not in CSP_OPEN phase"). us-11's green phase changed the persisted `legRole` from a generic `'EXPIRE'` to the distinct `'CC_EXPIRED'` value so the `LegHistoryTable` can render an "expired worthless" row label without inferring intent from `instrumentType`. Apart from the role string itself, the rest of the leg's columns (action, instrument_type, strike, expiration, contracts, premium, fill_date) are unchanged.
- **Source:** `src/main/ipc/positions.ts`, `src/main/services/expire-cc-position.ts`
- **Driven by:** [us-9 — Record CC expiring worthless](../features/us-9-record-cc-expiration.md), [us-11 — Wheel leg chain display](../features/us-11-wheel-leg-chain-display.md)

### `positions:record-call-away`

- **Purpose:** record that the shares were called away when the covered call was exercised at expiration — the terminal event that completes the wheel cycle. Validates `phase === 'CC_OPEN'`, `contracts <= 1` (multi-contract is out of scope for Phase 1), and `fillDate >= ccOpenFillDate`. Writes a single `CALLED_AWAY` / `EXERCISE` / `CALL` leg (`premium_per_contract = '0.0000'`, `fill_price = CC strike`, `fill_date = CC expiration`), updates the position to `WHEEL_COMPLETE` / `CLOSED` with `closedDate = fillDate`, inserts a final cost-basis snapshot carrying the previous `basisPerShare` / `totalPremiumCollected` plus the newly computed `final_pnl`, and returns the final cycle P&L, cycle days, annualized return, and effective basis used in the math.
- **Request:**
  ```typescript
  // Zod schema: RecordCallAwayPayloadSchema
  {
    positionId: string // UUID — only field; fillDate and fillPrice are derived from the CC_OPEN leg
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'WHEEL_COMPLETE'
      status: 'CLOSED'
      closedDate: string             // ISO date — = CC expiration (= leg.fillDate)
    },
    leg: {                           // the new CALLED_AWAY leg
      id: string
      positionId: string
      legRole: 'CALLED_AWAY'         // us-11: was 'CC_CLOSE' prior to the green phase
      action: 'EXERCISE'
      instrumentType: 'CALL'
      strike: string                 // copied from CC_OPEN leg, 4 dp TEXT
      expiration: string             // copied from CC_OPEN leg
      contracts: number              // copied from CC_OPEN leg (must be 1)
      premiumPerContract: '0.0000'   // exercise: no premium collected
      fillPrice: string              // = CC_OPEN leg.strike (the CC strike), 4 dp TEXT
      fillDate: string               // = CC_OPEN leg.expiration
      createdAt: string
      updatedAt: string
    },
    costBasisSnapshot: {             // new final snapshot row with finalPnl set
      id: string
      positionId: string
      basisPerShare: string          // carried forward from the most recent CC_OPEN snapshot
      totalPremiumCollected: string  // carried forward from the most recent CC_OPEN snapshot
      finalPnl: string               // 4 dp TEXT, signed; e.g. "780.0000" or "-250.0000"
      snapshotAt: string
      createdAt: string
    },
    finalPnl: string                 // = (ccStrike − basisPerShare) × sharesHeld, 4 dp
    cycleDays: number                // calendar days, position.openedDate → fillDate
    annualizedReturn: string         // 4 dp; "0.0000" when cycleDays <= 0
    basisPerShare: string            // effective cost basis used in the calculation
  }
  ```
- **Error codes:**

  | field       | code                         | message                                         |
  | ----------- | ---------------------------- | ----------------------------------------------- |
  | `__phase__` | `invalid_phase`              | `No open covered call on this position`         |
  | `contracts` | `multi_contract_unsupported` | `Multi-contract call-away is not yet supported` |
  | `fillDate`  | `close_date_before_open`     | `Fill date cannot be before the CC open date`   |
  | `__root__`  | `not_found`                  | `Position not found`                            |
  | `__root__`  | `no_cc_open_leg`             | `Position has no open covered call leg`         |
  | `__root__`  | `internal_error`             | `An unexpected error occurred`                  |

- **Notes:** the payload deliberately omits `fillDate` and `fillPrice` — both are **derived** by the service from the active `CC_OPEN` leg (fillDate = CC expiration, fillPrice = CC strike) on the principle that "the trader did not buy back the contract, the contract was exercised against them" so there is nothing to enter. The renderer renders the fill-date field read-only with hint copy "Derived from your CC — the day shares are delivered to the buyer". `basisPerShare` is the **effective** cost basis from the latest snapshot and already reflects every CSP and CC premium reduction; the engine never re-adds `totalPremiumCollected`. `finalPnl = round4((ccStrike − basisPerShare) × sharesHeld)` via `decimal.js` `ROUND_HALF_UP`; `annualizedReturn = round4((finalPnl / capitalDeployed) × (365 / cycleDays) × 100)` with a guard returning `"0.0000"` when `cycleDays <= 0`. `WHEEL_COMPLETE` is a terminal phase — no further transitions are valid from it. The new leg's `legRole` is `'CALLED_AWAY'` (us-11) rather than `'CC_CLOSE'`; `'CC_CLOSE'` remains reserved for buy-to-close via `positions:close-cc-early`.
- **Registration:** uses `registerParsedPositionHandler(db, 'positions:record-call-away', 'positions_record_call_away_unhandled_error', RecordCallAwayPayloadSchema, recordCallAwayPosition)` — same shared helper as the other position mutation handlers.
- **Source:** `src/main/ipc/positions.ts`, `src/main/services/record-call-away-position.ts`, `src/main/core/lifecycle.ts` (`recordCallAway()`), `src/main/core/costbasis.ts` (`calculateCallAway()`)
- **Driven by:** [us-10 — Record shares called away](../features/us-10-record-shares-called-away.md)

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

  | field                    | code                    | message                                               |
  | ------------------------ | ----------------------- | ----------------------------------------------------- |
  | `__phase__`              | `invalid_phase`         | `Position is not in CSP_OPEN phase`                   |
  | `newExpiration`          | `must_be_after_current` | `New expiration must be after the current expiration` |
  | `costToClosePerContract` | `must_be_positive`      | `Cost to close must be greater than zero`             |
  | `newPremiumPerContract`  | `must_be_positive`      | `New premium must be greater than zero`               |
  | `__root__`               | `not_found`             | `Position not found`                                  |
  | `__root__`               | `no_active_leg`         | `Position has no active leg`                          |

- **Registration:** uses `registerParsedPositionHandler(db, 'positions:roll-csp', 'positions_roll_csp_unhandled_error', RollCspPayloadSchema, rollCspPosition)` — no inline `ipcMain.handle` boilerplate.
- **Planned (us-13, not yet implemented):** us-13 widens the validation behaviour (the request payload and success response are unchanged) to allow same-expiration strike-only rolls — i.e. "Roll Down" / "Roll Up" at the current expiration. The unconditional rule `newExpiration > currentExpiration` is planned to be replaced by two rules: reject only when **both** strike and expiration are unchanged (new code `no_change` on `__root__`, message `Roll must change the expiration, strike, or both`) and reject when `newExpiration < currentExpiration` (new code `must_not_be_earlier` on `newExpiration`, message `New expiration must be after the current expiration`). The existing `must_be_after_current` code on `newExpiration` is planned to be **superseded** by that two-code split. Treat these as **planned**; us-13's plan directory has no `tasks.md` or `refactor-phase-results.md` yet, so the current handler still enforces the us-12 rule. (us-14's `positions:roll-cc` already ships the equivalent two-code split — `must_be_on_or_after_current` + `no_change` — so the planned us-13 model is concretely visible in the codebase under a sibling handler.)
- **Source:** `src/main/ipc/positions.ts`, `src/main/services/roll-csp-position.ts`
- **Driven by:** [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md), planned: [us-13 — Roll a CSP down and out](../features/us-13-roll-csp-down-and-out.md)

### `positions:roll-cc`

- **Purpose:** atomically record a CC roll as a linked `ROLL_FROM` (buy-to-close CALL) / `ROLL_TO` (sell-to-open CALL) leg pair sharing a `roll_chain_id`, recalculate cost basis via the shared `calculateRollBasis()` engine, and keep the position in `CC_OPEN`. Mirror of `positions:roll-csp` for the covered-call leg of the wheel — see us-14 for the architectural-mirror rationale.
- **Request:**
  ```typescript
  // Zod schema: RollCcPayloadSchema (assigned from the shared RollPayloadBaseSchema)
  {
    positionId: string                 // UUID — position in CC_OPEN phase
    costToClosePerContract: number     // positive — buy-to-close price
    newPremiumPerContract: number      // positive — sell-to-open price
    newExpiration: string              // YYYY-MM-DD (strict regex) — must be >= current CC expiration
    newStrike?: number                 // positive; defaults server-side to current CC strike
    fillDate?: string                  // YYYY-MM-DD; defaults to today
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'CC_OPEN'
      status: 'ACTIVE'
    },
    rollFromLeg: LegRecord,   // ROLL_FROM BUY CALL — closes old CC
    rollToLeg: LegRecord,     // ROLL_TO SELL CALL — opens new CC
    rollChainId: string,      // shared UUID written onto both legs
    costBasisSnapshot: CostBasisSnapshotRecord
  }
  ```
- **Error codes:**

  | field                    | code                          | message                                                                    |
  | ------------------------ | ----------------------------- | -------------------------------------------------------------------------- |
  | `__phase__`              | `invalid_phase`               | `No open covered call on this position`                                    |
  | `newExpiration`          | `must_be_on_or_after_current` | `New expiration must be on or after the current expiration (MMM DD, YYYY)` |
  | `__roll__`               | `no_change`                   | `Roll must change the expiration, strike, or both`                         |
  | `costToClosePerContract` | `must_be_positive`            | `Cost to close must be greater than zero`                                  |
  | `newPremiumPerContract`  | `must_be_positive`            | `New premium must be greater than zero`                                    |
  | `__root__`               | `not_found`                   | `Position not found`                                                       |
  | `__root__`               | `no_active_leg`               | `Position has no active leg`                                               |
  | `__root__`               | `internal_error`              | `An unexpected error occurred`                                             |

- **Validation differences from `positions:roll-csp`:** (1) expiration check is `newExpiration >= currentExpiration` (inclusive) rather than strictly `>`, so a same-expiration strike change ("Roll Up" / "Roll Down") is accepted; (2) the lifecycle engine explicitly rejects the no-op case where both `newStrike == currentStrike` AND `newExpiration == currentExpiration` with code `no_change` on the sentinel field `__roll__` (a new sentinel, distinct from `__phase__` and `__root__`); (3) the wrong-phase rejection message is `'No open covered call on this position'`, matching `positions:close-cc-early` / `positions:expire-cc` rather than the CSP-flavoured `'Position is not in CSP_OPEN phase'`. The renderer additionally renders an amber, **non-blocking** "new strike below cost basis" warning purely client-side — there is no backend error code for that case.
- **Refactor consolidation (us-14):** `RollCspPayloadSchema` and `RollCcPayloadSchema` are field-for-field identical and are assigned from a single shared `RollPayloadBaseSchema` in `src/main/schemas.ts`; the date regex and message are extracted to `IsoDateRegex` / `IsoDateMessage` constants. `RollCspResult` and `RollCcResult` both extend a shared `RollResultBase` interface — the only differing field is the `position.phase` literal (`'CSP_OPEN'` vs `'CC_OPEN'`). The cost-basis math is identical for both rolls: `calculateRollBasis()` in `src/main/core/costbasis.ts` is reused unchanged — the instrument type (CALL vs PUT) does not affect the formula `net = newPremium − costToClose; basisPerShare = prevBasisPerShare − net`.
- **Registration:** uses `registerParsedPositionHandler(db, 'positions:roll-cc', 'positions_roll_cc_unhandled_error', RollCcPayloadSchema, rollCcPosition)` — same shared helper as `positions:roll-csp`.
- **Source:** `src/main/ipc/positions.ts`, `src/main/services/roll-cc-position.ts`, `src/main/core/lifecycle.ts` (`rollCc()`), `src/main/core/costbasis.ts` (`calculateRollBasis()`)
- **Driven by:** [us-14 — Roll a covered call](../features/us-14-roll-cc.md)

### `positions:save-alert-overrides`

- **Purpose:** save (or clear) the per-position alert-threshold overrides — `profitTargetPercent` and `managementWindowDte` — edited from the position-detail page's `PositionAlertOverridesForm`. Passing `null` for both fields clears them, reverting the position to inheriting the global defaults; passing numbers sets both.
- **Request:**
  ```typescript
  // Zod schema: SaveAlertOverridesPayloadSchema
  {
    positionId: string // min length 1
    profitTargetPercent: number | null // int, 1-99 when non-null
    managementWindowDte: number | null // int, 6-45 DTE when non-null
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    position: {
      id: string
      profitTargetPercent: number | null
      managementWindowDteOverride: number | null
    }
  }
  ```
- **Error codes:**

  | field                 | code             | message                                          |
  | --------------------- | ---------------- | ------------------------------------------------ |
  | `profitTargetPercent` | `too_small`      | `Profit target must be between 1 and 99`         |
  | `profitTargetPercent` | `too_big`        | `Profit target must be between 1 and 99`         |
  | `managementWindowDte` | `too_small`      | `Management window must be between 6 and 45 DTE` |
  | `managementWindowDte` | `too_big`        | `Management window must be between 6 and 45 DTE` |
  | `__root__`            | `not_found`      | `Position not found`                             |
  | `__root__`            | `internal_error` | `An unexpected error occurred`                   |

- **Notes:** both fields are validated (when non-null) before the `UPDATE positions` write — an invalid request writes nothing. `management_window_dte_override` is a new nullable column on `positions` added by migration `010_add_management_window_dte_override.sql`; `profit_target_percent` is the pre-existing us-33 column (migration `005`), now with its first real write path. Bounds mirror `settings:save-alert-defaults` exactly (same 1-99 / 6-45 ranges and messages) so a position's custom thresholds and the global defaults share one validation story.
- **Source:** `src/main/ipc/positions.ts` (`registerPositionsHandlers`), `src/main/services/save-position-alert-overrides.ts` (`savePositionAlertOverrides`)
- **Driven by:** [us-57-58 — Configurable alert thresholds](../features/us-57-58-configurable-alert-thresholds.md)

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

  | field      | code             | message                  |
  | ---------- | ---------------- | ------------------------ |
  | `__root__` | `auth_failed`    | provider auth rejected   |
  | `__root__` | `network_error`  | upstream network failure |
  | `__root__` | `rate_limited`   | provider rate limit hit  |
  | `__root__` | `internal_error` | uncaught error           |
  | (zod path) | (zod code)       | zod issue message        |

- **Note:** the renderer adapter throws `apiError(502, { detail: result.errors })` on `ok: false` so TanStack Query sets `isError`. `change` / `changePercent` are intentionally NOT included in `IpcStockQuote` — the renderer derives them from `(price, prevClose)`.
- **us-39 routing change:** as of us-39, this channel routes to `MassiveMarketDataProvider` (not Alpaca). The handler file is unchanged (`src/main/ipc/market-data.ts`) but the provider instance is now `MassiveMarketDataProvider` from `src/main/integrations/massive-market-data.ts`. Auth failures from a missing or empty Massive API key surface as `auth_failed`.
- **Source:** `src/main/ipc/market-data.ts`, `src/main/schemas.ts`
- **Driven by:** [us-32 — Live Position Prices](../features/us-32-live-position-prices.md), [us-39 — Massive Market Data Provider](../features/us-39-massive-market-data-provider.md)

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

  | field      | code                    | message                             |
  | ---------- | ----------------------- | ----------------------------------- |
  | `__root__` | `auth_failed`           | provider auth rejected              |
  | `__root__` | `network_error`         | upstream network failure            |
  | `__root__` | `rate_limited`          | provider rate limit hit             |
  | `__root__` | `streaming_unsupported` | provider does not support streaming |
  | `__root__` | `internal_error`        | uncaught error                      |
  | (zod path) | (zod code)              | zod issue message                   |

- **Lifecycle:** module-scoped `connected` flag inside `registerMarketDataHandlers` ensures `provider.connect()` runs at most once per app session; `app.on('before-quit', () => provider.disconnect())` closes the socket on shutdown. Empty array tears down without reconnecting.
- **Source:** `src/main/ipc/market-data.ts`
- **Driven by:** [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)

### `market-data:market-status`

- **Deprecated by us-39.** The canonical market-status channel is now `broker:market-status` (see the `broker:*` namespace section below). The `market-data:market-status` channel name may remain registered for backward compatibility, but all new code should call `broker:market-status` instead.
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

  | field      | code             | message                  |
  | ---------- | ---------------- | ------------------------ |
  | `__root__` | `auth_failed`    | provider auth rejected   |
  | `__root__` | `network_error`  | upstream network failure |
  | `__root__` | `rate_limited`   | provider rate limit hit  |
  | `__root__` | `internal_error` | uncaught error           |

- **Source:** `src/main/ipc/market-data.ts` (legacy); see `src/main/ipc/broker.ts` for the authoritative `broker:market-status` handler.
- **Driven by:** [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)

### `market-data:option-snapshots` (superseded)

- **Superseded by us-39.** This channel (plural bulk OCC symbol lookup) was introduced by us-33 and is replaced by two purpose-fit channels: `market-data:option-snapshot` (singular, single-contract lookup) and `market-data:option-chain` (filtered + paginated chain). Callers that used the old bulk endpoint must migrate to one of those two channels.
- **Purpose (historical):** REST-style snapshot of the full option chain shape (bid/ask/mid, last trade, open interest, volume, Greeks) for a list of OCC option symbols. Polled every 60 s via `useOptionSnapshots(legs, { session })` to drive the `Opt Mid` / `P&L` list columns and the position-detail Open Leg stats. Symbols built renderer-side via `buildOccSymbol()` in `src/main/core/option-symbol.ts`.
- **Breaking change (us-39):** `greeks` is now **optional** on `IpcOptionSnapshot`. When the Massive provider does not include Greeks (e.g. deep ITM, missing data), `greeks` is `undefined` rather than zero-filled — renderer code reading `snapshot.greeks.delta` must be updated to `snapshot.greeks?.delta` to avoid runtime errors.
- **Source (historical):** `src/main/ipc/market-data.ts`, `src/main/services/market-data.ts`, `src/main/schemas.ts`
- **Driven by:** [us-33 — Option Mid + Unrealized P&L](../features/us-33-option-mid-pnl.md)

### `market-data:option-snapshot`

- **Purpose:** single-contract lookup returning the full snapshot (bid/ask/mid, last trade, open interest, volume, optional Greeks) for one OCC option symbol. Replaces the bulk `market-data:option-snapshots` channel for single-leg pricing. Routes to `MassiveMarketDataProvider`.
- **Request:**
  ```typescript
  // Zod validated
  {
    underlying: string // e.g. 'AAPL'
    contract: string // OCC format, regex-validated, e.g. 'AAPL260516P00180000'
  }
  ```
- **Response (success):**

  ```typescript
  {
    ok: true,
    snapshot: IpcOptionSnapshot | null   // null when the provider has no data for the contract
  }

  type IpcOptionSnapshot = {
    bid: string                // 4 dp TEXT
    ask: string                // 4 dp TEXT
    mid: string                // 4 dp TEXT; (bid + ask) / 2
    lastTrade: string          // 4 dp TEXT
    openInterest: number | null
    volume: number | null
    greeks?: {                 // optional — absent when Massive does not return Greeks
      delta: string            // 4 dp TEXT
      gamma: string            // 4 dp TEXT
      theta: string            // 4 dp TEXT
      vega: string             // 4 dp TEXT
      iv: string               // 4 dp TEXT
    }
    timestamp: string          // ISO-8601
  }
  ```

- **Error codes:**

  | field      | code             | message                                              |
  | ---------- | ---------------- | ---------------------------------------------------- |
  | `__root__` | `auth_failed`    | provider auth rejected (missing/invalid Massive key) |
  | `__root__` | `network_error`  | upstream network failure                             |
  | `__root__` | `rate_limited`   | provider rate limit hit                              |
  | `__root__` | `internal_error` | uncaught error                                       |
  | (zod path) | (zod code)       | zod issue message                                    |

- **Notes:** `null` snapshot is a normal non-error response — the renderer renders `—` for absent symbols. `greeks` is optional: when Massive omits Greeks for a contract (e.g. deep ITM, expiry edge cases), the field is absent rather than zero-filled. Renderer code must use `snapshot.greeks?.delta` rather than `snapshot.greeks.delta`.
- **Source:** `src/main/ipc/market-data.ts`
- **Driven by:** [us-39 — Massive Market Data Provider](../features/us-39-massive-market-data-provider.md), [us-33 — Option Mid + Unrealized P&L](../features/us-33-option-mid-pnl.md)

### `market-data:option-chain`

- **Purpose:** filtered and paginated option chain lookup — returns all option snapshots for an underlying that match the supplied filter criteria. Intended for the option screener and chain explorer UI. Routes to `MassiveMarketDataProvider`.
- **Request:**
  ```typescript
  // Zod validated
  {
    underlying: string          // ticker, e.g. 'AAPL'
    expirationFrom?: string     // ISO date filter (inclusive lower bound)
    expirationTo?: string       // ISO date filter (inclusive upper bound)
    type?: 'call' | 'put'       // filter by option type
    strikeFrom?: number         // filter by strike (inclusive lower bound)
    strikeTo?: number           // filter by strike (inclusive upper bound)
    limit?: number              // max results per page
    cursor?: string             // pagination cursor from a prior response
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    snapshots: IpcOptionSnapshot[]   // array of matching snapshots; IpcOptionSnapshot shape same as market-data:option-snapshot
    nextCursor: string | null        // null in the current implementation (real pagination deferred)
  }
  ```
- **Error codes:**

  | field      | code             | message                  |
  | ---------- | ---------------- | ------------------------ |
  | `__root__` | `auth_failed`    | provider auth rejected   |
  | `__root__` | `network_error`  | upstream network failure |
  | `__root__` | `rate_limited`   | provider rate limit hit  |
  | `__root__` | `internal_error` | uncaught error           |
  | (zod path) | (zod code)       | zod issue message        |

- **Notes:** `nextCursor` is always `null` in the current implementation — real cursor-based pagination is deferred to a follow-up story when the option screener (Epic 3) requires it. All filter fields are optional; omitting all filters returns the full chain for the underlying.
- **Source:** `src/main/ipc/market-data.ts`
- **Driven by:** [us-39 — Massive Market Data Provider](../features/us-39-massive-market-data-provider.md)

### `broker:account`

- **Purpose:** fetch the current broker account details (buying power, portfolio value, cash balance, account number). Routes to `AlpacaBrokerProvider` via `src/main/ipc/broker.ts`. Part of the us-39 broker/market-data namespace split.
- **Request:** none.
- **Response (success):**
  ```typescript
  {
    ok: true,
    accountInfo: {
      // AlpacaBrokerProvider shape; exact fields mirror Alpaca GET /v2/account
      accountNumber: string
      buyingPower: string      // 4 dp TEXT
      portfolioValue: string   // 4 dp TEXT
      cash: string             // 4 dp TEXT
    }
  }
  ```
- **Error codes:**

  | field      | code             | message                                |
  | ---------- | ---------------- | -------------------------------------- |
  | `__root__` | `auth_failed`    | Alpaca credentials missing or rejected |
  | `__root__` | `network_error`  | upstream network failure               |
  | `__root__` | `internal_error` | uncaught error                         |

- **Source:** `src/main/ipc/broker.ts`, `src/main/integrations/alpaca-broker.ts`
- **Driven by:** [us-39 — Massive Market Data Provider](../features/us-39-massive-market-data-provider.md)

### `broker:market-status`

- **Purpose:** return current session (`regular`/`pre`/`post`/`closed`) plus `nextOpen`/`nextClose` timestamps from Alpaca's clock endpoint. This is the us-39 replacement for `market-data:market-status`. Polled by `useMarketStatus()` every 60 s to drive the `MarketStatusPill`. Routes to `AlpacaBrokerProvider` via `src/main/ipc/broker.ts`.
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

  | field      | code             | message                                |
  | ---------- | ---------------- | -------------------------------------- |
  | `__root__` | `auth_failed`    | Alpaca credentials missing or rejected |
  | `__root__` | `network_error`  | upstream network failure               |
  | `__root__` | `rate_limited`   | Alpaca rate limit hit                  |
  | `__root__` | `internal_error` | uncaught error                         |

- **Notes:** Alpaca's `getClock()` is the authoritative source for session state. Massive's market-status endpoint was not adopted (it is per-asset-class and does not map cleanly to the single `MarketStatus` shape).
- **Source:** `src/main/ipc/broker.ts`, `src/main/integrations/alpaca-broker.ts`
- **Driven by:** [us-39 — Massive Market Data Provider](../features/us-39-massive-market-data-provider.md), [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)

### `broker:activities`

- **Purpose:** fetch recent broker account activities (fills, dividends, transfers) from Alpaca. Routes to `AlpacaBrokerProvider` via `src/main/ipc/broker.ts`. Part of the us-39 broker/market-data namespace split.
- **Request:**
  ```typescript
  // filter object; all fields optional
  {
    activityType?: string    // Alpaca activity type filter (e.g. 'FILL')
    after?: string           // ISO-8601 cursor
    until?: string           // ISO-8601 cursor
    pageSize?: number
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    activities: Array<{
      // shape mirrors Alpaca GET /v2/account/activities response items
      id: string
      activityType: string
      date: string           // ISO date
      [additionalFields: string]: unknown
    }>
  }
  ```
- **Error codes:**

  | field      | code             | message                                |
  | ---------- | ---------------- | -------------------------------------- |
  | `__root__` | `auth_failed`    | Alpaca credentials missing or rejected |
  | `__root__` | `network_error`  | upstream network failure               |
  | `__root__` | `internal_error` | uncaught error                         |

- **Source:** `src/main/ipc/broker.ts`, `src/main/integrations/alpaca-broker.ts`
- **Driven by:** [us-39 — Massive Market Data Provider](../features/us-39-massive-market-data-provider.md)

### `assignments:list-pending`

- **Purpose:** hydrate the `AssignmentNotificationBanner` stack on the positions list with every `pending_assignments` row in `status='pending'`, joined to the parent position + leg for the display fields (ticker, strike, expiration, contract type, qty). Polled by `usePendingAssignments` via TanStack Query with a 30s `refetchInterval`.
- **Request:** none (no payload).
- **Response (success):**
  ```typescript
  {
    ok: true,
    assignments: Array<{
      id: number                          // pending_assignments.id (AUTOINCREMENT integer)
      ticker: string                      // parsed from the OPASN OCC symbol
      strike: string                      // 2 dp TEXT
      expiration: string                  // ISO date
      contractType: 'put' | 'call'        // OPASN symbol parse — always 'put' in current flow
      qty: number                         // contracts assigned
      transactionTime: string             // ISO-8601 (from Alpaca activity)
      positionId: string                  // UUID — corrected from the plan's `number` per Area E1
    }>
  }
  ```
- **Error codes:**

  | field      | code             | message                        |
  | ---------- | ---------------- | ------------------------------ |
  | `__root__` | `internal_error` | `An unexpected error occurred` |

- **Notes:** the `id` is an `INTEGER PRIMARY KEY AUTOINCREMENT` from `pending_assignments` — the only IPC channel in the app that surfaces a non-UUID integer identifier on the renderer. The renderer's banner threads this id back through `assignments:confirm` / `assignments:dismiss`. A "pending" row IS the notification — there is no separate notifications table; persistence across app restarts falls out of the table itself.
- **Source:** `src/main/ipc/assignments.ts`, `src/main/services/pending-assignments.ts`
- **Driven by:** [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md)

### `assignments:confirm`

- **Purpose:** record trader confirmation of a detected assignment. Validates the pending row exists and is in `status='pending'`, then atomically (via outer `db.transaction()` composing with `assignCspPosition`'s inner transaction) calls `assignCspPosition` to transition the position from `CSP_OPEN → HOLDING_SHARES` and updates the pending row to `status='confirmed'` with `confirmed_at = now()`. On success the renderer invalidates `['positions', 'list']`, `['positions', positionId]`, and `['assignments', 'pending']` query keys.
- **Request:**
  ```typescript
  // Zod schema: ConfirmAssignmentPayloadSchema
  {
    pendingAssignmentId: number // positive integer — required
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    position: {
      id: string
      phase: 'HOLDING_SHARES'
      assignedAt: string // ISO date — = the assignment date passed to assignCspPosition
    }
  }
  ```
- **Response (failure — documented envelope deviation):**
  ```typescript
  {
    ok: false,
    code: 'NOT_FOUND' | 'NOT_PENDING' | 'TRANSITION_REJECTED',
    errors: [{ field: '__root__', code, message }]
  }
  ```
- **Error codes:**

  | field      | code                  | message                                                         |
  | ---------- | --------------------- | --------------------------------------------------------------- |
  | `__root__` | `NOT_FOUND`           | `Pending assignment not found`                                  |
  | `__root__` | `NOT_PENDING`         | `Pending assignment is no longer pending`                       |
  | `__root__` | `TRANSITION_REJECTED` | (rejection message from the lifecycle engine bubbled up)        |
  | `__root__` | `internal_error`      | `An unexpected error occurred` (uncaught — via `handleIpcCall`) |

- **Notes:** this handler is **not** registered via `registerParsedPositionHandler` — it does its own Zod parse + try/catch because the failure envelope carries the top-level `code` field (see Overview's deviation note). The error codes `NOT_FOUND` / `NOT_PENDING` / `TRANSITION_REJECTED` are UPPER_SNAKE_CASE rather than the catalogue's lowercase convention because they originate from `PendingAssignmentError.code` rather than the field-error builders. `TRANSITION_REJECTED` covers e.g. a position that was independently transitioned out of `CSP_OPEN` between the OPASN poll and the trader's confirmation — the lifecycle engine's standard phase-guard rejection is mapped to this code.
- **Source:** `src/main/ipc/assignments.ts`, `src/main/services/pending-assignments.ts` (`confirmPending`), `src/main/services/assign-csp-position.ts`
- **Driven by:** [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md)

### `assignments:dismiss`

- **Purpose:** dismiss a detected assignment without transitioning the position (e.g. trader is confident it's a false positive, or has already recorded the assignment manually). Validates the pending row exists and is in `status='pending'`, then updates the row to `status='dismissed'` with `dismissed_at = now()`. Dismissed rows are excluded from the next poll's OPASN match results because `INSERT OR IGNORE` on the compound `UNIQUE(activity_id, position_id)` silently drops the duplicate.
- **Request:**
  ```typescript
  // Zod schema: DismissAssignmentPayloadSchema
  {
    pendingAssignmentId: number // positive integer — required
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    dismissedAt: string // ISO-8601 — computed in the handler, not read back from the DB row
  }
  ```
- **Response (failure — documented envelope deviation):**
  ```typescript
  {
    ok: false,
    code: 'NOT_FOUND' | 'NOT_PENDING',
    errors: [{ field: '__root__', code, message }]
  }
  ```
- **Error codes:**

  | field      | code             | message                                                         |
  | ---------- | ---------------- | --------------------------------------------------------------- |
  | `__root__` | `NOT_FOUND`      | `Pending assignment not found`                                  |
  | `__root__` | `NOT_PENDING`    | `Pending assignment is no longer pending`                       |
  | `__root__` | `internal_error` | `An unexpected error occurred` (uncaught — via `handleIpcCall`) |

- **Notes:** post-Area-B1 code review, `dismissPending` rejects confirmed rows with `NOT_PENDING` rather than silently no-op'ing — only already-dismissed rows are idempotent. Same envelope-deviation pattern as `assignments:confirm` (see Overview).
- **Source:** `src/main/ipc/assignments.ts`, `src/main/services/pending-assignments.ts` (`dismissPending`)
- **Driven by:** [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md)

### `assignments:run-detection-now`

- **Purpose:** manually trigger an out-of-band run of the `detect-assignments` poll job — the same job the scheduler runs on its cadence. Useful for a "Refresh now" affordance in Settings or for ad-hoc debugging. Calls `scheduler.runNow(DETECT_ASSIGNMENTS_JOB_NAME)` and waits for the handler to settle.
- **Request:** none (no payload).
- **Response (success):**
  ```typescript
  {
    ok: true
    // Tech debt (Area E2): the contract aspires to return { detected, skipped, durationMs } but
    // scheduler.runNow does not currently surface the handler's return value. The handler returns
    // an empty object; the preload's d.ts type is documented but not satisfied at runtime.
  }
  ```
- **Error codes:**

  | field      | code             | message                        |
  | ---------- | ---------------- | ------------------------------ |
  | `__root__` | `internal_error` | `An unexpected error occurred` |

- **Notes:** the standard `{ ok, errors }` envelope (no `code` deviation). Implementation tech debt: `scheduler.runNow` returns `Promise<void>` rather than the detection summary, so the IPC response currently has no `detected` / `skipped` / `durationMs` fields despite the preload's d.ts advertising them. Code-review Area E2 recommends piping handler return values through `PollingScheduler.runNow`; until that lands, treat the response as `{ ok: true }` only.
- **Source:** `src/main/ipc/assignments.ts`, `src/main/services/scheduler-instance.ts`, `src/main/services/detect-assignments.ts`
- **Driven by:** [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md)

### `alerts:list`

- **Purpose:** hydrate the dashboard's "Management Queue" (rendered above the positions grid) with every open alert enriched for display. Returns a prioritised, sorted list of `ManagementQueueItem` view-models — each carrying the alert's `ticker`, current position `phase`, urgency tier, trigger `summary`, and `quickAction` — so the renderer can render an at-a-glance triage list with a "Review position" action. Polled by `useManagementQueue` via TanStack Query with a 30s `refetchInterval` (matching the US-50 backend re-evaluation cadence).
- **Request:** none (no payload — invoked as `window.api.alerts.list()` → `ipcRenderer.invoke('alerts:list')`).
- **Response (success):**

  ```typescript
  {
    ok: true,
    items: ManagementQueueItem[]   // [] when no open alerts
  }

  interface ManagementQueueItem {
    alertId: string                // stable React key; one row per open alert
    positionId: string             // UUID — target of the "Review position" action
    ticker: string                 // joined from positions
    phase: WheelPhase              // joined from positions; drives the PhaseBadge
    urgency: 'high' | 'medium' | 'low'
    summary: string                // generated + stored by the US-50 engine; displayed verbatim
    quickAction: string
    triggeredAt: string            // ISO timestamp
  }
  ```

- **Error codes:**

  | field      | code             | message                        |
  | ---------- | ---------------- | ------------------------------ |
  | `__root__` | `internal_error` | `An unexpected error occurred` |

- **Sort order:** urgency rank `high → medium → low`, then `triggered_at ASC` within a tier (the alert that has needed attention longest surfaces first — start-of-day triage ordering). Sorting is done in SQL via `ORDER BY CASE urgency … END, triggered_at ASC`, leveraging the `idx_alerts_status_urgency` index for the `status='open'` filter.
- **Notes:** standard `{ ok, errors }` envelope (no `code` deviation). Read-only with no request payload, so no Zod schema is registered. The service `listManagementQueue(db)` (`src/main/services/alerts.ts`) INNER-JOINs open `alerts` to `positions` to attach `ticker` and `phase`, then maps snake→camel into the `ManagementQueueItem` view-model — deliberately excluding `AlertRecord` audit fields (`lastEvaluatedAt`, `resolvedAt`, `createdAt`, `updatedAt`, `status`) the queue does not use. The inner JOIN drops any alert whose position is missing (should not happen given the FK). The renderer adapter (`src/renderer/src/api/alerts.ts`) returns `[]` on a non-ok envelope so the queue degrades to its empty state rather than showing an error banner. US-51 adds no migration — the `alerts` table and evaluation engine shipped in US-50 (`migrations/009_create_alerts.sql`). Mirrors `assignments:list-pending` (no payload, polled read path) structurally.
- **Registration:** `registerAlertsHandlers({ db })` in `src/main/ipc/alerts.ts`, wired into `src/main/index.ts`; handler body is `handleIpcCall('alerts_list_error', () => ({ items: listManagementQueue(db) }))`. Exposed to the renderer as `window.api.alerts.list` (`src/preload/index.ts`, typed in `src/preload/index.d.ts`).
- **Source:** `src/main/ipc/alerts.ts`, `src/main/services/alerts.ts` (`listManagementQueue`)
- **Driven by:** [us-51 — Management Queue Dashboard](../features/us-51-management-queue-dashboard.md)

### `alerts:dismiss`

- **Purpose:** dismiss an open management-queue alert — transitions it to
  `status = 'dismissed'` with a `dismissed_at` timestamp, removing it from
  the open queue while retaining the row as an audit record. Makes
  `upsertOpenAlert` dismissal-aware so a still-true condition doesn't
  silently reopen it on the next evaluation tick; the row is retired to
  `resolved` once the evaluation job observes the condition as genuinely
  cleared. Backs the "Confirm dismiss" action in the renderer's
  `DismissConfirmPanel`.
- **Request:**

  ```typescript
  z.object({
    alertId: z.string().min(1)
  })
  ```

- **Response (success):**

  ```typescript
  {
    ok: true,
    alert: {
      id: string
      positionId: string
      ruleCode: string
      urgency: 'high' | 'medium' | 'low'
      summary: string
      quickAction: string
      status: 'dismissed'
      triggeredAt: string
      lastEvaluatedAt: string
      resolvedAt: string | null
      dismissedAt: string
      createdAt: string
      updatedAt: string
    }
  }
  ```

- **Error codes:**

  | field      | code             | message                             |
  | ---------- | ---------------- | ------------------------------------ |
  | `__root__` | `NOT_FOUND`      | `Alert {alertId} not found`         |
  | `__root__` | `NOT_OPEN`       | `Only open alerts can be dismissed` |
  | `__root__` | `internal_error` | `An unexpected error occurred`      |

- **Notes:** deviates from the canonical `{ ok, errors }` envelope the same
  way `assignments:confirm` / `assignments:dismiss` do — it adds a top-level
  `code` field (`NOT_FOUND` / `NOT_OPEN`) sourced from a dedicated
  `AlertError.code`, since `handleIpcCall` cannot express a top-level
  discriminator alongside the field-error array alone. `NOT_OPEN` covers
  dismissing an alert that is currently `resolved` **or** already
  `dismissed` — the AC does not distinguish between those two prior states
  in its rejection message. Added no new table — extends the existing
  `alerts` table via migration `011_add_alerts_dismissal.sql` (see
  [schema/tables](../schema/tables.md)).
- **Registration:** `registerAlertsHandlers({ db })` in
  `src/main/ipc/alerts.ts`; handler body Zod-parses `{ alertId }`, calls
  `dismissAlert(db, alertId, new Date().toISOString())`, and returns
  `{ alert }` via `handleIpcCall`. Exposed to the renderer as
  `window.api.alerts.dismiss` (`src/preload/index.ts`).
- **Source:** `src/main/ipc/alerts.ts`, `src/main/ipc/utils.ts` (`AlertError` envelope mapping), `src/main/services/alerts.ts` (`dismissAlert`, `AlertError`)
- **Driven by:** [us-59 — Dismiss an Alert](../features/us-59-dismiss-alert.md)

### `ivr:collect-now`

- **Purpose:** manually trigger an out-of-band run of the `ivr-collect` collection job — the same job the scheduler runs after market close (`afterClose` cadence, `offsetMinutes: 60`). Backs the "Refresh IVR now" secondary action in the Settings Market Data section. Calls `scheduler.runNow('ivr-collect')` and returns the collector's batch summary so the renderer can show success/error counts. Target selection (all active-position underlyings) stays in the main-process collector — the channel accepts **no** renderer-supplied tickers or timing.
- **Request:** none (no payload).
- **Response (success):**
  ```typescript
  {
    ok: true,
    batch: {
      successCount: number                              // rows successfully inserted (after same-day overwrite)
      errorCount: number                                // tickers that failed (parse/network/rate-limit/invalid-input)
      skippedCount: number                              // tickers intentionally not persisted (incl. not_available)
      skippedReason: 'market_closed' | null             // 'market_closed' when the whole batch exits early on a non-trading day
    }
  }
  ```
- **Error codes:**

  | field      | code             | message                        |
  | ---------- | ---------------- | ------------------------------ |
  | `__root__` | `internal_error` | `An unexpected error occurred` |

- **Notes:** unlike `assignments:run-detection-now` (whose `scheduler.runNow` discards the handler return value), this channel **does** return the collector summary because US-44 requires the renderer to see success and error counts. The handler validates the scheduler result with `CollectIvrNowBatchSchema` (`{ successCount, errorCount, skippedCount, skippedReason }` — all counts `int().min(0)`, `skippedReason: z.enum(['market_closed']).nullable()`) before returning, so a swallowed job-handler error — where the scheduler resolves `undefined` — surfaces as a proper `{ ok: false }` envelope via `handleIpcCall` rather than a fake `{ ok: true }`. There is no request schema since the channel takes no payload. The renderer adapter (`src/renderer/src/api/ivr.ts`) normalizes the envelope to a flat `CollectIvrNowResult` (`{ successCount, errorCount, skippedCount, skippedReason }`) and throws the existing `ApiError` shape on `{ ok: false }`. `runNow('ivr-collect')` resets the cadence clock to now after the out-of-band run. The non-trading-day guard lives inside `collectIVRSnapshots` (`BrokerProvider.getMarketStatus()` → `session: 'closed'`), so both the scheduled and manual paths are safe on weekends/holidays.
- **Source:** `src/main/ipc/ivr.ts`, `src/main/schemas.ts` (`CollectIvrNowBatchSchema`), `src/main/services/ivr-collector.ts` (`collectIVRSnapshots`)
- **Driven by:** [us-44 — IVR snapshot store and scheduler](../features/us-44-ivr-snapshot-store-and-scheduler.md)
<!-- /generated -->

<!-- generated:from us-35 -->

## Dev-only scheduler handlers (us-35)

Registered by `src/main/ipc/test-scheduler.ts` and wired into the main process **only when `NODE_ENV === 'test'`** so they never appear on the production IPC surface. Backed by the same `scheduler` singleton from `src/main/services/scheduler-instance.ts` that registers the production `detect-assignments` job — there is no separate state. Used by `e2e/polling-scheduler.spec.ts` and `e2e/assignment-detection.spec.ts` to introspect and drive the scheduler from outside the process.

These channels do **not** follow the `{ ok, errors }` envelope — they return ad-hoc shapes shaped to their test consumers' needs. They are not part of the public IPC contract.

### `_test:scheduler-registry`

- **Purpose:** introspect the scheduler's current job registry (names, cadences, invocation counters per state).
- **Request:** none.
- **Response:**
  ```typescript
  JobRegistryEntry[]
  // type JobRegistryEntry = { name: string; cadence: CadencePolicy; invocations: number }
  ```
- **Source:** `src/main/ipc/test-scheduler.ts`, `src/main/services/polling-scheduler.ts` (`getRegistry()`).

### `_test:scheduler-run-now`

- **Purpose:** trigger an out-of-band run of a registered job by name. Mirror of the production `scheduler.runNow` API exposed for tests.
- **Request:** `jobName: string` (positional, not wrapped in an object).
- **Response:** `Promise<void>` — resolves when the handler settles.
- **Source:** `src/main/ipc/test-scheduler.ts`.

### `_test:scheduler-register`

- **Purpose:** register a synthetic test job at runtime (e.g. an interval job that throws to exercise the scheduler's error-swallow behaviour). Also seedable at process start via the `WHEELBASE_TEST_JOBS` env var consumed by `seedTestJobsFromEnv(scheduler)`.
- **Request:**
  ```typescript
  type TestJobFixture = {
    name: string
    cadence: CadencePolicy
    throws?: boolean // if true, the handler throws on every tick
  }
  ```
- **Response:**
  ```typescript
  { ok: true } | { ok: false; errorCode: SchedulerError['code'] | 'unknown' }
  // SchedulerError codes: 'already_registered' | 'job_not_found' | 'not_started'
  ```
- **Source:** `src/main/ipc/test-scheduler.ts`.

### `_test:scheduler-simulate-wake`

- **Purpose:** simulate a system-wake event for the scheduler. **No-op in the current implementation** — the setTimeout-chain scheduler cannot accumulate missed ticks (each tick only schedules the next tick), so wake simulation has no internal state to nudge. The handler exists so the e2e suite can prove the property by observing that no extra invocations occur after the call.
- **Request:** none.
- **Response:** `{ ok: true }`.
- **Source:** `src/main/ipc/test-scheduler.ts`.
<!-- /generated -->

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-13,us-14,us-15,us-32,us-33,us-35,us-37,us-39 -->

## Push events

Push events are one-way `main → renderer` messages sent via `webContents.send`. They carry no response envelope; the renderer subscribes through `window.api.on*` (which returns an unsubscribe function wrapping `ipcRenderer.removeListener`).

### `market-data:stock-quote`

- **Channel:** `market-data:stock-quote`
- **Direction:** main → renderer
- **Payload:**
  ```typescript
  type IpcStockQuoteEvent = {
    ticker: string
    quote: IpcStockQuote // prevClose is always null on a tick
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
    code: string // mirrors provider StreamError.code
    message: string
    reconnectable: boolean
  }
  ```
- **Trigger:** emitted when the provider's stream Observable errors (WebSocket failure, auth loss, etc.). For US-32 the `feed` is always `'stockQuotes'`. The renderer treats receipt of this event as an immediate signal to render the `StaleDataBanner` and override the market-status pill to `DELAYED`, bypassing the 5-minute freshness threshold.
- **Source:** `src/main/ipc/market-data.ts`
- **Driven by:** [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)
<!-- /generated -->

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-13,us-14,us-15,us-32,us-33,us-35,us-37,us-39,us-44,us-51,us-59 -->

## Standard error codes

Cross-handler catalogue of every error `code` value emitted, with the set of handlers that produce it.

| code                          | meaning                                                                                                     | used by                                                                                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invalid_phase`               | wrong position phase for the requested operation                                                            | `positions:close-csp`, `positions:expire-csp`, `positions:assign-csp`, `positions:open-cc`, `positions:close-cc-early`, `positions:expire-cc`, `positions:record-call-away`, `positions:roll-csp`, `positions:roll-cc`   |
| `must_be_positive`            | numeric input was ≤ 0                                                                                       | `positions:close-csp`, `positions:open-cc`, `positions:close-cc-early`, `positions:roll-csp`, `positions:roll-cc`                                                                                                        |
| `must_be_after_current`       | new date is not strictly after the current date being replaced                                              | `positions:roll-csp` (planned to be superseded by `no_change` + `must_not_be_earlier` in us-13)                                                                                                                          |
| `must_be_on_or_after_current` | new expiration earlier than current expiration on a CC roll (inclusive bound — same expiration is accepted) | `positions:roll-cc`                                                                                                                                                                                                      |
| `close_date_before_open`      | close fill date earlier than open leg's fill date                                                           | `positions:close-csp`, `positions:close-cc-early`, `positions:record-call-away`                                                                                                                                          |
| `close_date_after_expiration` | close fill date later than the option's expiration                                                          | `positions:close-csp`, `positions:close-cc-early`                                                                                                                                                                        |
| `too_early`                   | expiration cannot be recorded before the option's expiration date                                           | `positions:expire-csp`, `positions:expire-cc`                                                                                                                                                                            |
| `date_before_open`            | assignment date earlier than the CSP open date                                                              | `positions:assign-csp`                                                                                                                                                                                                   |
| `before_assignment`           | CC fill date earlier than the ASSIGN leg's fill date                                                        | `positions:open-cc`                                                                                                                                                                                                      |
| `cannot_be_future`            | CC fill date later than today                                                                               | `positions:open-cc`                                                                                                                                                                                                      |
| `exceeds_shares`              | CC contracts exceed shares held (= ASSIGN leg's contracts)                                                  | `positions:open-cc`                                                                                                                                                                                                      |
| `multi_contract_unsupported`  | contracts > 1 (Phase 1 limitation)                                                                          | `positions:record-call-away`                                                                                                                                                                                             |
| `not_found`                   | record (position) does not exist                                                                            | `positions:get`, `positions:expire-csp`, `positions:assign-csp`, `positions:close-cc-early`, `positions:expire-cc`, `positions:record-call-away`, `positions:roll-csp`, `positions:roll-cc`                              |
| `no_active_leg`               | position has no resolvable active open leg                                                                  | `positions:assign-csp`, `positions:expire-cc`, `positions:roll-csp`, `positions:roll-cc`                                                                                                                                 |
| `no_cc_open_leg`              | position has no resolvable open covered call leg                                                            | `positions:record-call-away`                                                                                                                                                                                             |
| `no_change`                   | roll attempted with both strike and expiration unchanged                                                    | `positions:roll-cc` (on sentinel field `__roll__`); **planned** for `positions:roll-csp` in us-13 (on `__root__`)                                                                                                        |
| `must_not_be_earlier`         | new expiration earlier than current expiration (**planned** — us-13)                                        | `positions:roll-csp`                                                                                                                                                                                                     |
| `auth_failed`                 | upstream market-data or broker provider rejected credentials                                                | `market-data:stock-quotes`, `market-data:set-stock-quote-tickers`, `market-data:market-status`, `market-data:option-snapshot`, `market-data:option-chain`, `broker:account`, `broker:market-status`, `broker:activities` |
| `network_error`               | upstream provider unreachable                                                                               | `market-data:stock-quotes`, `market-data:set-stock-quote-tickers`, `market-data:market-status`, `market-data:option-snapshot`, `market-data:option-chain`, `broker:account`, `broker:market-status`, `broker:activities` |
| `rate_limited`                | upstream provider returned 429                                                                              | `market-data:stock-quotes`, `market-data:set-stock-quote-tickers`, `market-data:market-status`, `market-data:option-snapshot`, `market-data:option-chain`, `broker:market-status`                                        |
| `streaming_unsupported`       | provider does not implement streaming for the requested feed                                                | `market-data:set-stock-quote-tickers`                                                                                                                                                                                    |
| `missing_credentials`         | requested broker environment has no saved Alpaca credentials                                                | `settings:set-active-broker-environment`, `settings:test-stored-alpaca-connection`                                                                                                                                       |
| `environment_mismatch`        | Alpaca credentials are valid but belong to the wrong environment (e.g. LIVE keys submitted to a paper card) | `settings:test-connection` (Alpaca probe path)                                                                                                                                                                           |
| `NOT_FOUND`                   | pending assignment or alert row does not exist (us-35 / us-59; UPPER_SNAKE_CASE — originates from `PendingAssignmentError` / `AlertError`) | `assignments:confirm`, `assignments:dismiss`, `alerts:dismiss`                                                                                                                                                            |
| `NOT_PENDING`                 | pending assignment row exists but is no longer in `status='pending'` (us-35)                                | `assignments:confirm`, `assignments:dismiss`                                                                                                                                                                             |
| `NOT_OPEN`                    | alert row exists but is not `status='open'` (already `resolved` or already `dismissed`) (us-59; originates from `AlertError`) | `alerts:dismiss`                                                                                                                                                                                                          |
| `TRANSITION_REJECTED`         | lifecycle engine rejected the `CSP_OPEN → HOLDING_SHARES` transition during confirm (us-35)                 | `assignments:confirm`                                                                                                                                                                                                    |
| `internal_error`              | uncaught error in the handler                                                                               | all request/response handlers (including `positions:list`, `alerts:list`, and `alerts:dismiss`)                                                                                                                          |
| `(zod path)`                  | Zod payload validation failure — `field` is the issue's `path.join('.')`, `code` is the Zod issue `code`    | all schema-parsed handlers                                                                                                                                                                                               |

Sentinel `field` values used across handlers:

- `__phase__` — phase-mismatch errors (`positions:close-csp`, `positions:expire-csp`, `positions:assign-csp`, `positions:open-cc`, `positions:close-cc-early`, `positions:expire-cc`, `positions:record-call-away`, `positions:roll-csp`, `positions:roll-cc`).
- `__root__` — errors not attributable to a specific input field (not-found, no-active-leg, no-cc-open-leg, provider errors, internal errors, planned us-13 `no_change`).
- `__roll__` — roll-level no-change error introduced by us-14's `positions:roll-cc` for the case where both `newStrike == currentStrike` and `newExpiration == currentExpiration` (the planned us-13 equivalent on `positions:roll-csp` uses `__root__` instead).

Renderer adapters in `src/renderer/src/api/*.ts` translate IPC camelCase field names back to renderer snake_case form-field names via an `IPC_TO_FORM_FIELD` map shared by `closePosition`, `createPosition`, `rollCsp`, `assignPosition`, `expirePosition`, `openCoveredCall`, `closeCoveredCallEarly`, `expireCc`, and `recordCallAway`. `mapIpcErrors(errors)` (the position-form field-name remapping) stays local to `src/renderer/src/api/positions.ts`; the generic `throwMappedIpcErrors()` it calls was promoted to the shared `src/renderer/src/api/error.ts` during US-59's Layer 4 refactor, since `alerts.ts`'s `dismissAlert` needed the same "throw a mapped `ApiError` from an IPC error envelope" behavior with no field remapping (alert errors are always `__root__`-scoped).

<!-- /generated -->

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-13,us-14,us-15,us-32,us-33,us-35,us-37,us-39,us-44,us-51,us-57-58,us-59 -->

## Driven by

- [us-2 — Position list](../features/us-2-position-list.md)
- [us-4 — Close a CSP early](../features/us-4-close-csp.md)
- [us-5 — Record CSP expiration](../features/us-5-record-csp-expiration.md)
- [us-6 — Record CSP assignment](../features/us-6-record-csp-assignment.md)
- [us-7 — Open a covered call](../features/us-7-open-covered-call.md)
- [us-8 — Close a covered call early](../features/us-8-close-cc-early.md)
- [us-9 — Record CC expiring worthless](../features/us-9-record-cc-expiration.md)
- [us-10 — Record shares called away](../features/us-10-record-shares-called-away.md)
- [us-11 — Wheel leg chain display](../features/us-11-wheel-leg-chain-display.md)
- [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md)
- [us-13 — Roll a CSP down and out](../features/us-13-roll-csp-down-and-out.md) (planned)
- [us-14 — Roll a covered call](../features/us-14-roll-cc.md)
- [us-15 — Roll pair timeline](../features/us-15-roll-pair-timeline.md)
- [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)
- [us-33 — Option Mid + Unrealized P&L](../features/us-33-option-mid-pnl.md)
- [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md)
- [us-37 — Paper/Live Broker Environment Toggle](../features/us-37-paper-live-broker-environment-toggle.md)
- [us-39 — Massive Market Data Provider](../features/us-39-massive-market-data-provider.md)
- [us-44 — IVR snapshot store and scheduler](../features/us-44-ivr-snapshot-store-and-scheduler.md)
- [us-51 — Management Queue Dashboard](../features/us-51-management-queue-dashboard.md)
- [us-57-58 — Configurable alert thresholds](../features/us-57-58-configurable-alert-thresholds.md)
- [us-59 — Dismiss an alert with a record of the dismissal](../features/us-59-dismiss-alert.md)

(us-2 was authored as a FastAPI `GET /api/positions` HTTP endpoint; the surviving Electron equivalent is `src/main/services/list-positions.ts` and the IPC channel name `positions:list` documented above is derived rather than authoritative. us-12-refactor introduced no new IPC handlers; it centralised the active-leg SQL into `src/main/services/active-leg-sql.ts` which is consumed by both `positions:get` and `positions:list`. us-6 introduced the global `optionType` → `instrumentType` rename across all leg-returning handlers and the `instrument_type` DB migration; us-5, us-6, and us-10 added `'EXPIRE'`, `'ASSIGN'`, and `'EXERCISE'` respectively to the `LegAction` enum. us-8 and us-9 both deliberately omit a new `cost_basis_snapshots` insert — us-8 because the existing CC_OPEN snapshot already captures the CC premium and the wheel is still open, us-9 because CC expiration is not a financial event (the premium was captured at CC open in us-7). us-10 introduced the new `positions:record-call-away` channel, the `'CALLED_AWAY'` `legRole` value, and the `WHEEL_COMPLETE` terminal phase. us-11 widened the `positions:get` response with an `allSnapshots` array (used by the renderer's `deriveRunningBasis()` pure helper to attach a running cost basis to every row in `LegHistoryTable`) and split previously-overloaded role values into distinct terminal-event values: `'CALLED_AWAY'` (now written by `positions:record-call-away` instead of `'CC_CLOSE'`) and `'CC_EXPIRED'` (now written by `positions:expire-cc` instead of a generic `'EXPIRE'`). us-13 is **plan-only** — the plan directory has no `tasks.md` or `refactor-phase-results.md` yet; both its planned changes (adding `rollCount` to `positions:get` and relaxing `positions:roll-csp` validation to allow same-expiration strike-only rolls) are documented as planned above. us-14 introduced the new `positions:roll-cc` channel — a mirror of `positions:roll-csp` for the CC leg with two intentional behaviour differences (`>=` expiration instead of `>`, plus an explicit `no_change` lifecycle guard on the sentinel field `__roll__`); the refactor phase consolidated `RollCspPayloadSchema` / `RollCcPayloadSchema` into a shared `RollPayloadBaseSchema` and `RollCspResult` / `RollCcResult` onto a shared `RollResultBase` interface — `calculateRollBasis()` is reused unchanged. us-15 added the `rollChainId: string | null` field to every entry in `positions:get`'s `legs[]` payload (the underlying `legs.roll_chain_id` column already existed from migration 001; us-15 only exposed it through `GET_LEGS_QUERY` + `mapLegRow`) and added the same field to the `LegRecord` TypeScript interface — all non-roll write-paths set `rollChainId: null` explicitly while the two roll services pass the shared UUID. The `activeLeg` payload deliberately still surfaces `rollChainId: null`. us-33 introduced the `market-data:option-snapshots` request/response channel (full provider `OptionSnapshot` shape including `greeks`, 1:1 with the provider — not flattened like `IpcStockQuote`) and extended `positions:list` with four nullable active-leg fields (`instrumentType`, `contracts`, `entryPremiumPerContract`, `profitTargetPercent`) sourced from the existing active-leg subquery plus the new `positions.profit_target_percent` column from migration `005`. us-31 (the market-data provider/foundation story) shipped **no** new IPC handlers — it landed the `MarketDataProvider` interface and `getOptionSnapshots(symbols)` adapter method that this channel consumes; us-34 (Greeks display) ships **no** new IPC handlers either, re-using the existing option-snapshots channel and reading `snapshots[symbol].greeks` directly. us-39 introduced the broker/market-data namespace split: `AlpacaMarketDataProvider` was removed entirely and replaced by `MassiveMarketDataProvider` (all `market-data:*` channels) and `AlpacaBrokerProvider` (all `broker:*` channels); the old plural `market-data:option-snapshots` channel was superseded by `market-data:option-snapshot` (singular) and `market-data:option-chain`; three new `broker:*` channels (`broker:account`, `broker:market-status`, `broker:activities`) now route to `AlpacaBrokerProvider` via `src/main/ipc/broker.ts`; `market-data:stock-quotes` now routes to `MassiveMarketDataProvider`; `greeks` on `IpcOptionSnapshot` became optional (absent rather than zero-filled when the provider omits them). us-39 introduced no DB migrations. us-35 introduced the four `assignments:*` channels (`assignments:list-pending`, `assignments:confirm`, `assignments:dismiss`, `assignments:run-detection-now`) plus four dev-only `_test:scheduler-*` channels (`_test:scheduler-registry`, `_test:scheduler-run-now`, `_test:scheduler-register`, `_test:scheduler-simulate-wake`) registered only when `NODE_ENV === 'test'`. `assignments:confirm` and `assignments:dismiss` are the only handlers in this document that deviate from the canonical `{ ok, errors }` envelope — they add a top-level `code` field (`NOT_FOUND` / `NOT_PENDING` / `TRANSITION_REJECTED`) sourced from `PendingAssignmentError.code` because `handleIpcCall` cannot express a top-level discriminator alongside the field-error array. us-35 also added migration `008_create_pending_assignments.sql` (with a compound `UNIQUE(activity_id, position_id)` index to support multi-CSP collisions on a single OPASN activity) and consumes the `app_settings` key/value table introduced by us-37's migration `006_add_credential_settings.sql` (per-environment watermark keys `assignments_last_poll_at:paper` / `:live`). us-37 introduced the six `settings:*` channels (`settings:get-credential-status`, `settings:save-alpaca-credentials`, `settings:remove-alpaca-credentials`, `settings:set-active-broker-environment`, `settings:test-connection`, `settings:test-stored-alpaca-connection`) and the migration `006_add_credential_settings.sql` that creates the `credential_settings` (encrypted Alpaca key material) and `app_settings` (active-broker-environment + general key/value) tables; broker provider refresh is runtime-scoped to broker handlers only — market-data providers continue uninterrupted across environment switches. us-44 introduced the new dedicated `ivr:*` namespace with a single handler, `ivr:collect-now` (`src/main/ipc/ivr.ts`), a manual scheduler trigger for the `ivr-collect` job that — unlike `assignments:run-detection-now` — returns the collector batch summary (`{ successCount, errorCount, skippedCount, skippedReason }`) validated through `CollectIvrNowBatchSchema` so a swallowed job-handler error becomes an honest `{ ok: false }` rather than a fake success; it also added migration `007_create_ivr_snapshot.sql` (the `ivr_snapshot` table — see [schema/tables](../schema/tables.md)) and the `ivr-collect` scheduler job registration in `src/main/index.ts`. us-51 introduced the new dedicated `alerts:*` namespace with a single handler, `alerts:list` (`src/main/ipc/alerts.ts`, `registerAlertsHandlers({ db })`), a payload-free read path that surfaces US-50's persisted open alerts as the dashboard "Management Queue"; the service `listManagementQueue(db)` (`src/main/services/alerts.ts`) INNER-JOINs open `alerts` to `positions`, sorts in SQL by urgency rank (high→medium→low) then `triggered_at ASC`, and projects into the new `ManagementQueueItem` view-model (`src/main/schemas.ts`) — deliberately a narrower shape than `AlertRecord`. us-51 added **no** migration (it reads US-50's `alerts` table from `migrations/009_create_alerts.sql`) and structurally mirrors `assignments:list-pending`. us-57-58 introduced three new channels — `settings:get-alert-defaults`, `settings:save-alert-defaults`, and `positions:save-alert-overrides` — making the alert engine's two thresholds (profit-target percent, management-window DTE) configurable at both a global (`app_settings`-backed) and per-position (`positions.management_window_dte_override`, migration `010`) level; it added no new migration for the global-defaults half (reuses the existing `app_settings` table) and one migration for the per-position half. us-59 added `alerts:dismiss` to the `alerts:*` namespace — a write channel alongside US-51's read-only `alerts:list` — transitioning an open alert to `dismissed` with a `dismissed_at` timestamp (migration `011_add_alerts_dismissal.sql`) and rejecting a non-open target with the new `NOT_OPEN` code; it follows the same `AlertError`/`handleIpcCall` dispatch pattern and the same top-level-`code` envelope deviation that `assignments:confirm` / `assignments:dismiss` established for us-35. All are tracked here for regeneration completeness.)

<!-- /generated -->

<!-- generated:from us-37,us-57-58 -->

## Settings handlers

US-37 adds a dedicated `settings:*` namespace for credential status, Alpaca credential management, broker-environment switching, and connection probes. All six handlers live in `src/main/ipc/settings.ts`, validate with Zod schemas from `src/main/schemas.ts`, and use `handleIpcCall(...)` so failures stay inside the standard `{ ok: false, errors }` envelope. us-57-58 adds two more handlers to this same namespace/file for the global alert-defaults settings (profit-target percent, management-window DTE).

### `settings:get-credential-status`

- **Purpose:** hydrate the settings page, the app-shell broker badge, and vendor-specific degraded-state UI with shared Massive status plus Alpaca paper/live status.
- **Request:** none.
- **Response (success):**
  ```ts
  {
    ok: true,
    status: {
      massive: 'configured' | 'missing'
      alpacaPaper: 'configured' | 'missing'
      alpacaLive: 'configured' | 'missing'
      activeBrokerEnv: 'paper' | 'live' | 'none'
      massiveLastCheckedAt: string | null
      alpacaPaperAccountNumberMasked: string | null
      alpacaLiveAccountNumberMasked: string | null
    }
  }
  ```
- **Notes:** Massive status is derived from shared app configuration and does not create a `credential_settings` row. `massiveLastCheckedAt` is currently always `null`.

### `settings:save-alpaca-credentials`

- **Purpose:** validate, verify, encrypt, and upsert Alpaca credentials for `paper` or `live`.
- **Request:**
  ```ts
  {
    environment: 'paper' | 'live'
    keyId: string
    secret: string
  }
  ```
- **Response (success):**
  ```ts
  {
    ok: true,
    status: CredentialStatus,
    test: {
      ok: true,
      vendor: 'alpaca',
      environment: 'paper' | 'live',
      accountNumberMasked: string
    }
  }
  ```
- **Behavior:** delegates to `saveVerifiedAlpacaCredentials` (`src/main/services/save-verified-alpaca-credentials.ts`), which trims and validates, tests the connection, and saves only on success. Encrypts with Electron `safeStorage`, refreshes broker state only when the changed environment is active.

### `settings:remove-alpaca-credentials`

- **Purpose:** remove one saved Alpaca environment.
- **Request:**
  ```ts
  {
    environment: 'paper' | 'live'
  }
  ```
- **Response (success):**
  ```ts
  {
    ok: true,
    status: CredentialStatus
  }
  ```
- **Behavior:** deletes a single `credential_settings` row. If the removed environment was active, the effective active broker environment becomes `none` and broker state is refreshed.

### `settings:set-active-broker-environment`

- **Purpose:** switch the current broker environment between saved paper and live credentials.
- **Request:**
  ```ts
  {
    environment: 'paper' | 'live'
  }
  ```
- **Response (success):**
  ```ts
  {
    ok: true,
    status: CredentialStatus
  }
  ```
- **Error codes:**

  | field         | code                  | message                                                                                      |
  | ------------- | --------------------- | -------------------------------------------------------------------------------------------- |
  | `environment` | `missing_credentials` | `Alpaca paper credentials are not configured` / `Alpaca live credentials are not configured` |

- **Behavior:** persists `active_broker_environment`, recreates only the broker provider, and leaves market-data providers untouched.

### `settings:test-connection`

- **Purpose:** run a vendor-specific probe without saving credentials.
- **Request:**
  ```ts
  | { vendor: 'massive' }
  | { vendor: 'alpaca', environment: 'paper' | 'live', keyId: string, secret: string }
  ```
- **Response (success):**
  ```ts
  {
    ok: true,
    test:
      | { ok: true, vendor: 'massive', status: 'connected' }
      | { ok: true, vendor: 'alpaca', environment: 'paper' | 'live', accountNumberMasked: string }
      | { ok: false, errorCode: string, message: string }
  }
  ```
- **Vendor specifics:**
  - Massive probes `GET /v3/reference/tickers/AAPL` with the shared configured key.
  - Alpaca probes `GET /v2/account` against paper or live and does not import activities.
  - Mismatch detection is bidirectional (heuristic by key prefix): live keys (`AK…`) in the paper card → `environment_mismatch` / `Environment mismatch — these are LIVE keys, not paper keys`; paper keys (`PK…`) in the live card → `environment_mismatch` / `Environment mismatch — these are PAPER keys, not live keys`.

### `settings:test-stored-alpaca-connection`

- **Purpose:** re-verify already-saved encrypted Alpaca credentials without exposing secrets back to the renderer.
- **Request:**
  ```ts
  {
    environment: 'paper' | 'live'
  }
  ```
- **Response (success):**
  ```ts
  {
    ok: true,
    test: TestSettingsConnectionResult
  }
  ```
- **Error codes:**

  | field         | code                  | message                                                                                      |
  | ------------- | --------------------- | -------------------------------------------------------------------------------------------- |
  | `environment` | `missing_credentials` | `Alpaca paper credentials are not configured` / `Alpaca live credentials are not configured` |

- **Source:** `src/main/ipc/settings.ts`, `src/main/services/settings.ts`, `src/main/services/settings-connections.ts`, `src/main/services/save-verified-alpaca-credentials.ts`
- **Driven by:** [us-37 — Paper/Live Broker Environment Toggle](../features/us-37-paper-live-broker-environment-toggle.md)

### `settings:get-alert-defaults`

- **Purpose:** read the global alert-defaults settings (profit-target percent, management-window DTE) shown on the Settings page and consumed by the renderer's `useAlertDefaults()` hook so the positions-list `TARGET` badge and any new form agree with the alert engine.
- **Request:** none (no payload).
- **Response (success):**
  ```typescript
  {
    ok: true,
    defaults: {
      profitTargetPercent: number    // 1-99, defaults to 50 when unset
      managementWindowDte: number    // 6-45, defaults to 21 when unset
    }
  }
  ```
- **Error codes:**

  | field      | code             | message                        |
  | ---------- | ---------------- | ------------------------------ |
  | `__root__` | `internal_error` | `An unexpected error occurred` |

- **Notes:** payload-free read; performs no parsing of caller input, so the only possible error is the standard envelope internal error. Backed by `getAlertDefaults(db)`, which reads the two `app_settings` rows (`alert_default_profit_target_percent`, `alert_default_management_window_dte`) via the existing `appSettings.get`/`appSettings.set` helpers (`src/main/services/app-settings.ts`); an absent row falls back to `DEFAULT_PROFIT_TARGET_PERCENT = 50` / `DEFAULT_MANAGEMENT_WINDOW_DTE = 21`. No new migration — reuses the existing `app_settings` table.
- **Source:** `src/main/ipc/settings.ts` (`registerSettingsHandlers`), `src/main/services/alert-defaults.ts` (`getAlertDefaults`)
- **Driven by:** [us-57-58 — Configurable alert thresholds](../features/us-57-58-configurable-alert-thresholds.md)

### `settings:save-alert-defaults`

- **Purpose:** save the two global alert-defaults settings edited from the Settings page's alert-defaults section.
- **Request:**
  ```typescript
  // Zod schema: SaveAlertDefaultsPayloadSchema
  {
    profitTargetPercent: number // int, 1-99
    managementWindowDte: number // int, 6-45 DTE
  }
  ```
- **Response (success):**
  ```typescript
  {
    ok: true,
    defaults: {
      profitTargetPercent: number
      managementWindowDte: number
    }
  }
  ```
- **Error codes:**

  | field                 | code             | message                                          |
  | --------------------- | ---------------- | ------------------------------------------------ |
  | `profitTargetPercent` | `too_small`      | `Profit target must be between 1 and 99`         |
  | `profitTargetPercent` | `too_big`        | `Profit target must be between 1 and 99`         |
  | `managementWindowDte` | `too_small`      | `Management window must be between 6 and 45 DTE` |
  | `managementWindowDte` | `too_big`        | `Management window must be between 6 and 45 DTE` |
  | `__root__`            | `internal_error` | `An unexpected error occurred`                   |

- **Notes:** both fields are validated before either `app_settings` row is written — an invalid request writes nothing. Backed by `saveAlertDefaults(db, input)`, which writes both keys via `appSettings.set`. No new migration — reuses the existing `app_settings` table (per the `alert-default_profit_target_percent` / `alert_default_management_window_dte` key/value pair, mirroring the existing `active_broker_environment` singleton-config pattern).
- **Source:** `src/main/ipc/settings.ts` (`registerSettingsHandlers`), `src/main/services/alert-defaults.ts` (`saveAlertDefaults`)
- **Driven by:** [us-57-58 — Configurable alert thresholds](../features/us-57-58-configurable-alert-thresholds.md)

<!-- /generated -->

<!-- Hand-written sections below this line are preserved across regeneration. -->
