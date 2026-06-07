# Zod Schemas

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-13,us-14,us-15,us-32,us-33,us-35 -->

## Overview

Every IPC payload that crosses the renderer → main boundary is validated by a Zod schema in `src/main/schemas.ts`. The matching `z.infer<typeof ...>` TypeScript type is exported alongside each schema so the handler, the service function, and the renderer adapter all bind to the same shape. The schema lives in main (it is the source of truth); the renderer learns the field names through the adapter's snake_case → camelCase mapping documented in [IPC handlers](./ipc-handlers.md), then re-parses nothing on its own — the main-process handler is the only place validation runs.

Validation discipline is centralised. Every mutating position handler is registered via `registerParsedPositionHandler(db, channel, errLabel, schema, service)` from `src/main/ipc/utils.ts`, which performs `schema.safeParse(raw)` → on failure, returns `{ ok: false, errors: [...zodIssue.path / zodIssue.code / zodIssue.message] }`; on success, calls the service with the parsed payload and wraps the result in `{ ok: true, ...result }`. The helper also catches `ValidationError` thrown by lifecycle engines (mapped to `{ field, code, message }` shape) and any uncaught error (returned as `__root__` / `internal_error`). This means handler files contain no Zod boilerplate — just `registerParsedPositionHandler(db, 'positions:close-csp', 'positions_close_csp_unhandled_error', CloseCspPayloadSchema, closeCspPosition)`.

Three classes of types are catalogued below: **core enums** (the discriminator values used throughout the wheel lifecycle), **payload schemas** (one `z.object({...})` per mutating IPC handler), and **result interfaces** (the record shapes returned in IPC responses). Result interfaces are TypeScript `interface`s rather than Zod schemas — they are produced by services, not parsed from input — but they live in `src/main/schemas.ts` alongside the payload schemas because both halves of the IPC contract belong together. A small set of shared helper schemas — `PositionIdSchema = z.string().uuid()` (extracted during the us-10 refactor pass), `RollPayloadBaseSchema` and `RollResultBase` (extracted during the us-14 refactor pass when the CC roll proved field-for-field identical to the CSP roll), and the `IsoDateRegex` / `IsoDateMessage` constants — are reused across payload schemas rather than re-declared.

<!-- /generated -->

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-13,us-14,us-15,us-32,us-33,us-35 -->

## Core enums

The discriminators that drive the wheel lifecycle. All five live in `src/main/core/types.ts`; the schemas in `src/main/schemas.ts` import them rather than re-declaring.

### `WheelPhase`

The lifecycle state of a wheel. Values used across the extracted plans: `CSP_OPEN`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, `HOLDING_SHARES`, `CC_OPEN`, `WHEEL_COMPLETE`. The lifecycle engine (`src/main/core/lifecycle.ts`) is the sole authority on legal transitions; every handler that accepts a position ID validates `currentPhase` against the expected value and rejects mismatches with `field: '__phase__' / code: 'invalid_phase'`. `WHEEL_COMPLETE` is terminal — it is reached by CSP expiry (us-5) and by call-away (us-10), and no further transitions are valid from it.

### `WheelStatus`

`'ACTIVE' | 'PAUSED' | 'CLOSED'`. Tracks whether the position is being actively managed. `CLOSED` is set when the wheel finishes (`WHEEL_COMPLETE` after CSP expiry or call-away, or `CSP_CLOSED_PROFIT|LOSS` after an early CSP close). Assignment, CC open, CC close-early, and CC expire all keep `status: 'ACTIVE'` because the wheel is still in flight.

### `LegRole`

The role each leg plays in the wheel history. Current values: `CSP_OPEN`, `CSP_CLOSE`, `ROLL_FROM`, `ROLL_TO`, `CC_OPEN`, `CC_CLOSE`, `CC_EXPIRED`, `CALLED_AWAY`, `EXPIRE`, `ASSIGN`. us-11 added `CC_EXPIRED` and `CALLED_AWAY` so terminal CC events render with their own row labels and annotations in the leg-history table — `expire-cc-position.ts` now persists `CC_EXPIRED` (was generic `EXPIRE`) and `record-call-away-position.ts` now persists `CALLED_AWAY` (was generic `CC_CLOSE`). Active-leg resolution is phase-aware (`CSP_OPEN → CSP_OPEN|ROLL_TO`, `CC_OPEN → CC_OPEN|ROLL_TO`) so the most recent roll's `ROLL_TO` leg becomes the effective open leg. us-13 (planned) widens the position-list active-leg subquery to include `ROLL_TO` as well — see `list-positions.ts` note in the [IPC handlers](./ipc-handlers.md) page.

### `LegAction`

```typescript
export const LEG_ACTION_VALUES = ['SELL', 'BUY', 'EXPIRE', 'ASSIGN', 'EXERCISE'] as const
export const LegAction = z.enum(LEG_ACTION_VALUES)
export type LegAction = z.infer<typeof LegAction>
```

History: started as `z.enum(['SELL', 'BUY'])`. us-5 added `'EXPIRE'` for worthless-expiration legs (where there is no buy or sell — the option just disappears). us-6 added `'ASSIGN'` for broker-initiated stock delivery. us-10 added `'EXERCISE'` for the CC_CLOSE leg created when shares are called away — distinct from a market `BUY` because the trader did not buy back the contract, the contract was exercised against them. The us-10 refactor pass also extracted the underlying tuple into the `LEG_ACTION_VALUES` constant so the enabled action set is explicit. All extensions are type-only changes; the `legs.action` column has no CHECK constraint so no migration was ever required.

### `InstrumentType`

```typescript
export const InstrumentType = z.enum(['PUT', 'CALL', 'STOCK'])
export type InstrumentType = z.infer<typeof InstrumentType>
```

**Rename history.** Originally `OptionType = z.enum(['PUT', 'CALL'])`. us-6 renamed the enum to `InstrumentType` and added `'STOCK'` so the same `legs` table could carry the stock-holding event marker emitted on assignment. The DB column was renamed `option_type → instrument_type` via `migrations/003_rename_option_type_to_instrument_type.sql`, and the CHECK constraint was expanded to `instrument_type IN ('PUT', 'CALL', 'STOCK')`. Every IPC handler that returns a leg now uses the field name `instrumentType`; older plan extracts that still reference `optionType` are stale (see the IPC handlers page for the canonical post-rename shapes).

<!-- /generated -->

<!-- generated:from us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-12,us-13,us-14,us-32,us-33,us-35 -->

## Payload schemas

One `z.object({...})` per mutating IPC handler. Each schema exports a matching `z.infer<>` type. All live in `src/main/schemas.ts`. The corresponding handler is documented in [IPC handlers](./ipc-handlers.md); only the schema shape is reproduced here.

### Shared roll base — `RollPayloadBaseSchema`

```typescript
export const IsoDateRegex = /^\d{4}-\d{2}-\d{2}$/
export const IsoDateMessage = 'Must be a valid date (YYYY-MM-DD)'

export const RollPayloadBaseSchema = z.object({
  positionId: PositionIdSchema,
  costToClosePerContract: z.number().positive(),
  newPremiumPerContract: z.number().positive(),
  newExpiration: z.string().regex(IsoDateRegex, IsoDateMessage),
  newStrike: z.number().positive().optional(),
  fillDate: z.string().optional()
})
```

Extracted during the us-14 refactor pass after `RollCspPayloadSchema` and `RollCcPayloadSchema` proved field-for-field identical. Both roll schemas are now assigned from this base; the divergence between the two roll flows lives entirely in the lifecycle engine (expiration `>` vs `>=`, no-change guard on CC) and in the service layer. The `IsoDateRegex` / `IsoDateMessage` constants are also exported standalone for reuse in any future date-shaped payload field.

### `CloseCspPayloadSchema`

```typescript
export const CloseCspPayloadSchema = z.object({
  positionId: z.string().uuid(),
  closePricePerContract: z.number().positive(),
  fillDate: z.string().optional()
})
export type CloseCspPayload = z.infer<typeof CloseCspPayloadSchema>
```

`fillDate` is `YYYY-MM-DD`; the service defaults it to today via `new Date().toISOString().slice(0, 10)` when omitted. Bound to `positions:close-csp`. Driven by [us-4 — Close a CSP early](../features/us-4-close-csp.md).

### `ExpireCspPayloadSchema`

```typescript
export const ExpireCspPayloadSchema = z.object({
  positionId: z.string().uuid(),
  expirationDateOverride: z.string().optional()
})
export type ExpireCspPayload = z.infer<typeof ExpireCspPayloadSchema>
```

`expirationDateOverride` is rarely used in production — it exists so tests can bypass the system clock for the `referenceDate >= expirationDate` guard. Bound to `positions:expire-csp`. Driven by [us-5 — Record CSP expiration](../features/us-5-record-csp-expiration.md).

### `AssignCspPayloadSchema`

```typescript
export const AssignCspPayloadSchema = z.object({
  positionId: z.string().uuid(),
  assignmentDate: z.string() // YYYY-MM-DD
})
export type AssignCspPayload = z.infer<typeof AssignCspPayloadSchema>
```

Future `assignmentDate` values are **accepted** by the schema and the service — the future-date warning ("This date is in the future — are you sure?") is rendered client-side only because some brokers post assignment details over the weekend with a forward-dated business day. Bound to `positions:assign-csp`. Driven by [us-6 — Record CSP assignment](../features/us-6-record-csp-assignment.md).

### `OpenCcPayloadSchema`

```typescript
export const OpenCcPayloadSchema = z.object({
  positionId: z.string().uuid(),
  strike: z.number().positive(),
  expiration: z.string(),
  contracts: z.number().int().positive(),
  premiumPerContract: z.number().positive(),
  fillDate: z.string().optional()
})
export type OpenCcPayload = z.infer<typeof OpenCcPayloadSchema>
```

`expiration` is `YYYY-MM-DD`. `fillDate` defaults to today when omitted. Schema-level checks cover positivity and the integer constraint on `contracts`; phase, the `contracts ≤ sharesHeld` rule, and the date bounds (`>=` assignment date, `<=` today) are enforced by the lifecycle engine, not the schema. Bound to `positions:open-cc`. Driven by [us-7 — Open a covered call](../features/us-7-open-covered-call.md).

### `CloseCcPayloadSchema`

```typescript
export const CloseCcPayloadSchema = z.object({
  positionId: z.string().uuid(),
  closePricePerContract: z.number().positive(),
  fillDate: z.string().optional() // YYYY-MM-DD; defaults to today
})
export type CloseCcPayload = z.infer<typeof CloseCcPayloadSchema>
```

Same shape as `CloseCspPayloadSchema` (the CSP and CC close flows take identical inputs); the difference is in the lifecycle engine and service. Bound to `positions:close-cc-early`. Driven by [us-8 — Close a covered call early](../features/us-8-close-cc-early.md).

### `ExpireCcPayloadSchema`

```typescript
export const ExpireCcPayloadSchema = z.object({
  positionId: z.string().uuid(),
  expirationDateOverride: z.string().optional() // YYYY-MM-DD
})
export type ExpireCcPayload = z.infer<typeof ExpireCcPayloadSchema>
```

Identical in shape to `ExpireCspPayloadSchema`. `expirationDateOverride` plays double duty in the service: it acts as both the `referenceDate` for the `too_early` guard AND the `recordedDate` used as the new leg's `fill_date`. When omitted, `referenceDate` defaults to today and `recordedDate` defaults to the active CC_OPEN leg's expiration. Bound to `positions:expire-cc`. Driven by [us-9 — Record CC expiring worthless](../features/us-9-record-cc-expiration.md).

### `RecordCallAwayPayloadSchema`

```typescript
export const RecordCallAwayPayloadSchema = z.object({
  positionId: PositionIdSchema // shared z.string().uuid()
})
export type RecordCallAwayPayload = z.infer<typeof RecordCallAwayPayloadSchema>
```

Single-field payload: the call-away service derives `fillDate = ccOpenLeg.expiration` and `fillPrice = ccOpenLeg.strike` from the active `CC_OPEN` leg rather than accepting them from the renderer (story technical notes — "the fill price is always the CC strike"). This was also the schema that introduced the shared `PositionIdSchema` helper during the us-10 refactor pass. Bound to `positions:record-call-away`. Driven by [us-10 — Record shares called away](../features/us-10-record-call-away.md).

### `RollCspPayloadSchema`

```typescript
export const RollCspPayloadSchema = RollPayloadBaseSchema // post-us-14: assigned, not redeclared
export type RollCspPayload = z.infer<typeof RollCspPayloadSchema>
```

The `newExpiration` regex was tightened from a bare `z.string()` during us-12 post-review fixes — non-`YYYY-MM-DD` formats (`"May 16, 2026"`, `"2026/05/16"`, empty string) now fail at schema parse rather than reaching the lifecycle engine. `newStrike` is optional and defaults to the current strike on the service side, supporting plain roll-out (same strike) without requiring the renderer to look up and forward the current value. The lifecycle engine separately enforces `newExpiration > currentExpiration`. Bound to `positions:roll-csp`. Driven by [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md).

**Planned (us-13, not yet implemented):** the schema shape stays unchanged, but the lifecycle engine's expiration rule relaxes from strict `>` to allow same-expiration strike-only rolls. The new validation splits into two codes: `__root__ / no_change` ("Roll must change the expiration, strike, or both") when both strike and expiration are unchanged, and `newExpiration / must_not_be_earlier` ("New expiration must be after the current expiration") when `newExpiration < currentExpiration`. This enables the "Roll Down" / "Roll Up" labels alongside the existing "Roll Out" / "Roll Down & Out" / "Roll Up & Out". Driven by [us-13 — Roll a CSP down and out](../features/us-13-roll-csp-down-and-out.md).

### `RollCcPayloadSchema`

```typescript
export const RollCcPayloadSchema = RollPayloadBaseSchema // identical shape to RollCsp
export type RollCcPayload = z.infer<typeof RollCcPayloadSchema>
```

Mirror of `RollCspPayloadSchema` — every field is the same, only the lifecycle semantics differ (the CC roll engine accepts `newExpiration >= currentExpiration` so "Roll Up" / "Roll Down" with the same expiration are legal, and rejects the case where both strike and expiration are unchanged with `__roll__ / no_change`). `newStrike` is optional and defaults to the current CC strike service-side. Bound to `positions:roll-cc`. Driven by [us-14 — Roll an open covered call](../features/us-14-roll-cc.md).

### `GetStockQuotesPayloadSchema`

```typescript
export const GetStockQuotesPayloadSchema = z.object({
  tickers: z.array(z.string().min(1).max(10)).max(50)
})
export type GetStockQuotesPayload = z.infer<typeof GetStockQuotesPayloadSchema>
```

Up to 50 tickers per call, each 1–10 characters. Empty array is valid (the service returns `{ ok: true, quotes: {} }`). Bound to `market-data:stock-quotes`. Driven by [us-32 — Live Position Prices](../features/us-32-live-position-prices.md).

### `SetStockQuoteTickersPayloadSchema`

```typescript
export const SetStockQuoteTickersPayloadSchema = GetStockQuotesPayloadSchema
export type SetStockQuoteTickersPayload = z.infer<typeof SetStockQuoteTickersPayloadSchema>
```

Aliased to `GetStockQuotesPayloadSchema` because the two channels accept identical inputs. Bound to `market-data:set-stock-quote-tickers`. Driven by [us-32 — Live Position Prices](../features/us-32-live-position-prices.md).

### `GetOptionSnapshotsPayloadSchema`

```typescript
export const GetOptionSnapshotsPayloadSchema = z.object({
  symbols: z.array(z.string().min(1).max(25)).max(50)
})
export type GetOptionSnapshotsPayload = z.infer<typeof GetOptionSnapshotsPayloadSchema>
```

Up to 50 OCC symbols per call (matches the `stock-quotes` batch limit), each 1–25 characters — OCC symbols are at most 21 characters (e.g. `AAPL260516P00180000`), and 25 gives headroom for longer underlying roots. Empty array is valid (the service returns `{ ok: true, snapshots: {} }` without calling the provider). Bound to `market-data:option-snapshots`. Driven by [us-33 — Option mid + unrealized P&L](../features/us-33-option-mid-pnl.md).

### `ConfirmAssignmentPayloadSchema`

```typescript
export const ConfirmAssignmentPayloadSchema = z.object({
  pendingAssignmentId: z.number().int().positive()
})
export type ConfirmAssignmentPayload = z.infer<typeof ConfirmAssignmentPayloadSchema>
```

The `pendingAssignmentId` is the AUTOINCREMENT integer primary key of the `pending_assignments` row (one of the few non-UUID identifiers in the schema — the table predates the project's UUID convention for new tables and uses `INTEGER PRIMARY KEY AUTOINCREMENT`). The service `confirmPending` wraps the lifecycle `assignCspPosition` call and the `UPDATE pending_assignments SET status='confirmed'` in a single outer `db.transaction()` so the two state changes commit atomically. Error envelopes carry a `code` field (`NOT_FOUND` / `NOT_PENDING` / `TRANSITION_REJECTED`) alongside `errors`, mapped via the bespoke `pendingAssignmentErrorResponse` helper rather than the standard `handleIpcCall` path (a known limitation — `handleIpcCall` cannot express a top-level `code` alongside `errors`). Bound to `assignments:confirm`. Driven by [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md).

### `DismissAssignmentPayloadSchema`

```typescript
export const DismissAssignmentPayloadSchema = z.object({
  pendingAssignmentId: z.number().int().positive()
})
export type DismissAssignmentPayload = z.infer<typeof DismissAssignmentPayloadSchema>
```

**Deliberately separate from `ConfirmAssignmentPayloadSchema` despite identical shape.** The two schemas could share a base (and at the moment a reader could be forgiven for thinking they're duplication ripe for extraction), but they're kept as distinct named exports so future divergence — e.g. adding a `reason: z.enum([...])` field to dismiss for "why did the trader reject this assignment?" telemetry — can land as an additive change to one schema rather than a breaking-change migration that ripples across both flows. Error envelopes carry `code: 'NOT_FOUND' | 'NOT_PENDING'` (no `TRANSITION_REJECTED` — dismiss does not invoke the lifecycle engine). Bound to `assignments:dismiss`. Driven by [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md).

<!-- /generated -->

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-13,us-14,us-15,us-32,us-33,us-35 -->

## Result interfaces

The TypeScript shapes returned inside `{ ok: true, ...result }` envelopes. These are `interface`s in `src/main/schemas.ts`, produced by services rather than parsed from input. Money values are TEXT-encoded `decimal.js` strings (4 dp) per the project's money-math discipline; date values are ISO-8601 strings.

### Building-block records

These four shapes are referenced by name across the result interfaces below.

```typescript
interface PositionRecord {
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
  openedDate: string // ISO date
  closedDate: string | null // ISO date; set when status transitions to CLOSED
}

interface LegRecord {
  id: string
  positionId: string
  legRole: LegRole
  action: LegAction
  instrumentType: InstrumentType // 'PUT' | 'CALL' | 'STOCK'
  strike: string // 4 dp TEXT
  expiration: string // ISO date
  contracts: number
  premiumPerContract: string // 4 dp TEXT; '0.0000' on EXPIRE/ASSIGN legs
  fillPrice: string | null // null on EXPIRE/ASSIGN legs
  fillDate: string // ISO date
  rollChainId: string | null // us-15: shared UUID for ROLL_FROM + ROLL_TO pair; null on every other role
  createdAt: string
  updatedAt: string
}

interface CostBasisSnapshotRecord {
  id: string
  positionId: string
  basisPerShare: string // 4 dp TEXT
  totalPremiumCollected: string // 4 dp TEXT
  finalPnl: string | null // 4 dp TEXT; set when wheel closes (CSP close or expire)
  snapshotAt: string // ISO timestamp
  createdAt: string // ISO timestamp
}

interface PositionListItem {
  // summary projection for the list view
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
  strike: string | null // 4 dp TEXT; null when no active option
  expiration: string | null // ISO date; null when no active option
  dte: number | null // (expiration − today).days; null when expiration is null
  premiumCollected: string // 4 dp TEXT (= latest snapshot's totalPremiumCollected)
  effectiveCostBasis: string // 4 dp TEXT (= latest snapshot's basisPerShare)
}
```

`PositionListItem` is the trimmed projection returned by `positions:list`; full `PositionRecord` + `LegRecord` + `CostBasisSnapshotRecord` are returned by `positions:get` and by every mutating handler. The `rollChainId` field on `LegRecord` was added by us-15 — the underlying `legs.roll_chain_id` column has existed since migration 001 and was always written by `roll-csp-position.ts` and (later) `roll-cc-position.ts`, but the field wasn't surfaced through `getPosition` until the leg-history table needed to group ROLL_FROM / ROLL_TO pairs visually. Every non-roll service writes `rollChainId: null` on the leg it constructs; only the two roll services pass the actual UUID. Driven by [us-2 — Position list](../features/us-2-position-list.md) (shape) and [us-4 — Close a CSP early](../features/us-4-close-csp.md) (`PositionRecord` / `LegRecord` / `CostBasisSnapshotRecord` first appearing in their canonical form); `rollChainId` field added by [us-15 — Roll pair timeline grouping](../features/us-15-roll-pair-timeline.md).

### `GetPositionResult`

```typescript
interface GetPositionResult {
  position: PositionRecord
  activeLeg: LegRecord | null
  costBasisSnapshot: (CostBasisSnapshotRecord & { finalPnl: string | null }) | null
  legs: LegRecord[]
  allSnapshots: CostBasisSnapshotRecord[] // added by us-11; ordered snapshot_at ASC
  // rollCount: number                              // planned by us-13, not yet implemented
}
```

`activeLeg` is `null` for positions with no resolvable open leg — `HOLDING_SHARES`, `WHEEL_COMPLETE`, `CSP_CLOSED_PROFIT|LOSS`. After us-6, `HOLDING_SHARES` explicitly returns `null` because the ASSIGN leg is an event marker, not an ongoing option position.

**us-11** added `allSnapshots: CostBasisSnapshotRecord[]` (every snapshot for the position ordered `snapshot_at ASC`) so the renderer's `deriveRunningBasis()` pure helper can join snapshots to legs via a carry-forward pointer scan and render a per-row running cost-basis column in the leg-history table. The handler in `src/main/ipc/positions.ts` is unchanged — the new field flows through the existing `positions:get` response.

**Planned (us-13, not yet implemented):** add `rollCount: number` (count of `legs` with `leg_role = 'ROLL_TO'`) so the renderer can show a "Roll #N" badge in the roll sheet and an informational warning at `rollCount >= 3`. No new IPC channel; this is a response widening on `positions:get`.

Returned by `positions:get`. Introduced by [us-4 — Close a CSP early](../features/us-4-close-csp.md); extended by [us-11 — Wheel leg chain display](../features/us-11-wheel-leg-chain-display.md) and [us-13 — Roll a CSP down and out](../features/us-13-roll-csp-down-and-out.md) (planned).

### `CloseCspPositionResult`

```typescript
interface CloseCspPositionResult {
  position: {
    id: string
    ticker: string
    phase: 'CSP_CLOSED_PROFIT' | 'CSP_CLOSED_LOSS'
    status: 'CLOSED'
    closedDate: string
  }
  leg: LegRecord // the new CSP_CLOSE / BUY / PUT leg
  costBasisSnapshot: CostBasisSnapshotRecord & { finalPnl: string }
}
```

`finalPnl` is always set on the snapshot (never null) — closing the CSP is what gives the wheel its final P&L. Driven by [us-4 — Close a CSP early](../features/us-4-close-csp.md).

### `ExpireCspPositionResult`

```typescript
interface ExpireCspPositionResult {
  position: {
    id: string
    ticker: string
    phase: 'WHEEL_COMPLETE'
    status: 'CLOSED'
    closedDate: string // = open leg's expiration date
  }
  leg: LegRecord // EXPIRE / EXPIRE / PUT, premiumPerContract='0.0000', fillPrice=null
  costBasisSnapshot: CostBasisSnapshotRecord & { finalPnl: string }
}
```

`finalPnl` equals `totalPremiumCollected` (100% of collected premium captured). The expire leg's `fillDate` is the open leg's `expiration` (not "today"). Driven by [us-5 — Record CSP expiration](../features/us-5-record-csp-expiration.md).

### `AssignCspPositionResult`

```typescript
interface AssignCspPositionResult {
  position: {
    id: string
    ticker: string
    phase: 'HOLDING_SHARES'
    status: 'ACTIVE' // unchanged — assignment is a transition, not a close
  }
  leg: LegRecord // ASSIGN / ASSIGN / STOCK, premiumPerContract='0.0000', fillPrice=null
  costBasisSnapshot: CostBasisSnapshotRecord // finalPnl: null — position still open
  premiumWaterfall: Array<{
    label: string // 'CSP premium' for CSP_OPEN, 'Roll credit' for ROLL_TO
    amount: string // premiumPerContract for that leg (per-share, 4 dp)
  }>
}
```

The `premiumWaterfall` is computed by `calculateAssignmentBasis()` in the pure cost-basis engine — one entry per `CSP_OPEN` and `ROLL_TO` leg in history — so the renderer can render each deduction line individually (`− CSP premium $3.50`, `− Roll credit $1.50`). Driven by [us-6 — Record CSP assignment](../features/us-6-record-csp-assignment.md).

### `OpenCcPositionResult`

```typescript
interface OpenCcPositionResult {
  position: {
    id: string
    ticker: string
    phase: 'CC_OPEN'
    status: 'ACTIVE'
    closedDate: null
  }
  leg: LegRecord // CC_OPEN / SELL / CALL
  costBasisSnapshot: CostBasisSnapshotRecord // finalPnl: null
}
```

The new snapshot has `basisPerShare = prevBasisPerShare − ccPremiumPerContract` (CC premium reduces basis because the trader collected a credit) and `totalPremiumCollected += ccPremium × contracts × 100`. Driven by [us-7 — Open a covered call](../features/us-7-open-covered-call.md).

### `CloseCcPositionResult`

```typescript
interface CloseCcPositionResult {
  position: {
    id: string
    ticker: string
    phase: 'HOLDING_SHARES'
    status: 'ACTIVE'
    closedDate: null
  }
  leg: LegRecord // the new CC_CLOSE / BUY / CALL leg
  ccLegPnl: string // 4 dp TEXT; positive = profit, negative = loss
}
```

**No `costBasisSnapshot` field.** us-8 deliberately omits a new snapshot insert — the CC_OPEN snapshot already reflects the CC premium reduction, and the wheel is still open with no final P&L. `ccLegPnl` is computed `(openPremium − closePrice) × contracts × 100` to 4 dp and returned on the envelope rather than persisted. Driven by [us-8 — Close a covered call early](../features/us-8-close-cc-early.md).

### `ExpireCcPositionResult`

```typescript
interface ExpireCcPositionResult {
  position: {
    id: string
    ticker: string
    phase: 'HOLDING_SHARES'
    status: 'ACTIVE'
    closedDate: null
  }
  leg: LegRecord // EXPIRE / EXPIRE / CALL, premiumPerContract='0.0000', fillPrice=null
  costBasisSnapshot: CostBasisSnapshotRecord // unchanged — re-returned as-is from the CC_OPEN snapshot
  sharesHeld: number // = ASSIGN leg.contracts × 100
}
```

Like `CloseCcPositionResult`, **no new snapshot row is written** — the CC premium was already captured at CC open in us-7, and CC expiration is not a financial event. The existing snapshot is re-returned on the envelope for renderer convenience. `sharesHeld` is computed server-side so the renderer does not need to re-query the ASSIGN leg. The persisted CC_EXPIRED leg uses `legRole: 'CC_EXPIRED'` (us-11 split this out from the generic `EXPIRE` role so the leg-history table can render "expired worthless" with the right styling). Driven by [us-9 — Record CC expiring worthless](../features/us-9-record-cc-expiration.md).

### `RecordCallAwayResult`

```typescript
interface RecordCallAwayResult {
  position: {
    id: string
    ticker: string
    phase: 'WHEEL_COMPLETE'
    status: 'CLOSED'
    closedDate: string // = fillDate = CC expiration
  }
  leg: LegRecord // CC_CLOSE → CALLED_AWAY / EXERCISE / CALL,
  // premiumPerContract='0.0000', fillPrice=CC strike
  costBasisSnapshot: CostBasisSnapshotRecord & { finalPnl: string }
  finalPnl: string // e.g. "780.0000" or "-250.0000" (4 dp, signed)
  cycleDays: number // calendar days, position.openedDate → fillDate
  annualizedReturn: string // 4 dp; "0.0000" when cycleDays <= 0
  basisPerShare: string // effective cost basis used in the calculation
}
```

The call-away service writes a final `cost_basis_snapshots` row carrying the prior snapshot's `basisPerShare` and `totalPremiumCollected` plus the newly computed `final_pnl`. Formula: `finalPnl = (ccStrike − basisPerShare) × sharesHeld`; `annualizedReturn = (finalPnl / capitalDeployed) × (365 / cycleDays) × 100`, guarded to `'0.0000'` when `cycleDays <= 0`. The leg uses `legRole: 'CALLED_AWAY'` (per us-11 — was `CC_CLOSE` in the original us-10 implementation) so the leg-history table can render the "Called Away" row label and the "100 shares called away" annotation. Driven by [us-10 — Record shares called away](../features/us-10-record-call-away.md).

### Shared roll base — `RollResultBase`

```typescript
interface RollResultBase {
  position: {
    id: string
    ticker: string
    phase: WheelPhase // narrowed by extenders to a literal
    status: 'ACTIVE'
  }
  rollFromLeg: LegRecord
  rollToLeg: LegRecord
  rollChainId: string // shared UUID — links the leg pair
  costBasisSnapshot: CostBasisSnapshotRecord // finalPnl: null
}
```

Extracted during the us-14 refactor pass after `RollCspResult` and `RollCcResult` proved field-for-field identical apart from the `position.phase` literal. Both result interfaces now extend this base and add only their differing `position.phase` narrowing.

### `RollCspResult`

```typescript
interface RollCspResult extends RollResultBase {
  position: { id: string; ticker: string; phase: 'CSP_OPEN'; status: 'ACTIVE' }
  rollFromLeg: LegRecord // ROLL_FROM / BUY / PUT
  rollToLeg: LegRecord // ROLL_TO / SELL / PUT
}
```

Rolls are **always** stored as linked leg pairs sharing a `rollChainId`, never as in-place mutations of the previous leg (per CLAUDE.md). The position row is not updated — phase stays `CSP_OPEN` and the new `ROLL_TO` leg becomes the effective open leg via the phase-aware active-leg query. Driven by [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md).

### `RollCcResult`

```typescript
interface RollCcResult extends RollResultBase {
  position: { id: string; ticker: string; phase: 'CC_OPEN'; status: 'ACTIVE' }
  rollFromLeg: LegRecord // ROLL_FROM / BUY / CALL
  rollToLeg: LegRecord // ROLL_TO / SELL / CALL
}
```

Mirror of `RollCspResult` — the only differences are the `position.phase` literal (`'CC_OPEN'` not `'CSP_OPEN'`) and the leg `instrumentType` ('CALL' not 'PUT'). Same rules: linked leg pair sharing a `rollChainId`, new `ROLL_TO` leg becomes the effective open leg, `costBasisSnapshot.finalPnl` is `null` because the wheel is still open, `calculateRollBasis()` is reused from the cost-basis engine unchanged (net credit reduces basis per share, net debit increases it). Driven by [us-14 — Roll an open covered call](../features/us-14-roll-cc.md).

### Market-data result shapes

us-32 introduced three result shapes for the market-data IPC channels. These are flat IPC-friendly types (no nested records) and live alongside the position result interfaces in `src/main/schemas.ts` plus mirrored declarations in `src/preload/index.d.ts`.

```typescript
// market-data:stock-quotes success
interface IpcGetStockQuotesResult {
  ok: true
  quotes: Record<string, IpcStockQuote>
}

interface IpcStockQuote {
  price: string // 2 dp
  bid: string // 2 dp
  ask: string // 2 dp
  prevClose: string | null // 2 dp; populated on REST seed, null on stream tick
  volume: number
  timestamp: string // ISO-8601
}

// market-data:set-stock-quote-tickers success
interface IpcSetStockQuoteTickersResult {
  ok: true
  subscribedTickers: string[]
}

// market-data:market-status success
interface IpcGetMarketStatusResult {
  ok: true
  status: IpcMarketStatus
}

interface IpcMarketStatus {
  isOpen: boolean
  nextOpen: string // ISO-8601
  nextClose: string // ISO-8601
  session: 'regular' | 'pre' | 'post' | 'closed'
}

// market-data:stock-quote push event payload (main → renderer)
interface IpcStockQuoteEvent {
  ticker: string
  quote: IpcStockQuote // prevClose is always null on a tick
}

// market-data:stream-error push event payload (main → renderer)
interface IpcStreamErrorEvent {
  feed: 'stockQuotes' | 'optionQuotes' | 'optionTrades'
  code: string // mirrors provider StreamError.code
  message: string
  reconnectable: boolean
}
```

`change` and `changePercent` are intentionally **not** part of `IpcStockQuote` — the renderer derives both from `(price, prevClose)` so the math lives in one place. Driven by [us-32 — Live Position Prices](../features/us-32-live-position-prices.md).

### Assignment-detection result shapes

us-35 introduced four assignment IPC channels backed by these shapes. They live alongside the position result interfaces in `src/main/schemas.ts` and are mirrored in `src/preload/index.d.ts`.

```typescript
// assignments:list-pending success
interface ListPendingAssignmentsResult {
  ok: true
  assignments: PendingAssignmentNotification[]
}

interface PendingAssignmentNotification {
  id: number // pending_assignments.id (AUTOINCREMENT integer)
  ticker: string
  strike: string // 2 dp
  expiration: string // ISO date
  contractType: 'put' | 'call'
  qty: number
  transactionTime: string // ISO-8601 from the OPASN activity
  positionId: string // UUID — corrected from `number` during us-35 code-review (Area E1)
}

// assignments:confirm success
interface ConfirmAssignmentResult {
  ok: true
  position: { id: string; phase: 'HOLDING_SHARES'; assignedAt: string }
}

// assignments:dismiss success
interface DismissAssignmentResult {
  ok: true
  dismissedAt: string // ISO-8601
}

// assignments:run-detection-now success (dev / settings affordance)
interface RunDetectionNowResult {
  ok: true
  detected: number
  skipped: number
  durationMs: number
}

// Error envelope for assignments:confirm / assignments:dismiss
interface AssignmentErrorResponse {
  ok: false
  errors: string[]
  code: 'NOT_FOUND' | 'NOT_PENDING' | 'TRANSITION_REJECTED'
}
```

`PendingAssignmentNotification.positionId` is the UUID of the parent CSP position (not the pending row); it is joined server-side from `pending_assignments.position_id`. The error envelope carries a top-level `code` field — confirm/dismiss handlers cannot use the standard `handleIpcCall` wrapper because that helper has no way to surface `code` alongside `errors`. Instead, a bespoke `pendingAssignmentErrorResponse` helper in `src/main/ipc/assignments.ts` maps `PendingAssignmentError` (and the lifecycle `ValidationError` from `assignCspPosition`) into the shape above. Driven by [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md).

<!-- /generated -->

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-13,us-14,us-15,us-32,us-33,us-35 -->

## Driven by

- [us-2 — Position list](../features/us-2-position-list.md) — `PositionListItem` shape
- [us-4 — Close a CSP early](../features/us-4-close-csp.md) — `CloseCspPayloadSchema`, `PositionRecord` / `LegRecord` / `CostBasisSnapshotRecord` canonical forms, `GetPositionResult`, `CloseCspPositionResult`
- [us-5 — Record CSP expiration](../features/us-5-record-csp-expiration.md) — `ExpireCspPayloadSchema`, `ExpireCspPositionResult`, `LegAction` extension `+ 'EXPIRE'`
- [us-6 — Record CSP assignment](../features/us-6-record-csp-assignment.md) — `AssignCspPayloadSchema`, `AssignCspPositionResult`, `LegAction` extension `+ 'ASSIGN'`, `OptionType → InstrumentType` rename `+ 'STOCK'`
- [us-7 — Open a covered call](../features/us-7-open-covered-call.md) — `OpenCcPayloadSchema`, `OpenCcPositionResult`
- [us-8 — Close a covered call early](../features/us-8-close-cc-early.md) — `CloseCcPayloadSchema`, `CloseCcPositionResult` (no snapshot)
- [us-9 — Record CC expiring worthless](../features/us-9-record-cc-expiration.md) — `ExpireCcPayloadSchema`, `ExpireCcPositionResult` (no snapshot, includes `sharesHeld`)
- [us-10 — Record shares called away](../features/us-10-record-call-away.md) — `RecordCallAwayPayloadSchema`, `RecordCallAwayResult`, `LegAction` extension `+ 'EXERCISE'`, shared `PositionIdSchema` extraction, `LEG_ACTION_VALUES` constant
- [us-11 — Wheel leg chain display](../features/us-11-wheel-leg-chain-display.md) — `GetPositionResult.allSnapshots` field, `LegRole` additions `CALLED_AWAY` + `CC_EXPIRED` (replacing generic `CC_CLOSE` / `EXPIRE` for terminal CC events)
- [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md) — `RollCspPayloadSchema` (with strict YYYY-MM-DD regex), `RollCspResult`
- [us-13 — Roll a CSP down and out](../features/us-13-roll-csp-down-and-out.md) (planned) — `RollCspPayloadSchema` validation relaxation (same-expiration strike-only rolls), planned `rollCount: number` field on `GetPositionResult`
- [us-14 — Roll an open covered call](../features/us-14-roll-cc.md) — `RollCcPayloadSchema`, `RollCcResult`, shared `RollPayloadBaseSchema` + `RollResultBase` extraction, `IsoDateRegex` / `IsoDateMessage` constants
- [us-15 — Roll pair timeline grouping](../features/us-15-roll-pair-timeline.md) — `LegRecord.rollChainId` field (surfaced through `getPosition` for the leg-history table)
- [us-32 — Live Position Prices](../features/us-32-live-position-prices.md) — `GetStockQuotesPayloadSchema`, `SetStockQuoteTickersPayloadSchema`, `IpcStockQuote` / `IpcMarketStatus` / push-event payloads
- [us-33 — Option mid + unrealized P&L](../features/us-33-option-mid-pnl.md) — `GetOptionSnapshotsPayloadSchema`
- [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md) — `ConfirmAssignmentPayloadSchema`, `DismissAssignmentPayloadSchema` (separate exports despite identical shape), `PendingAssignmentNotification` / `ConfirmAssignmentResult` / `DismissAssignmentResult` / `RunDetectionNowResult` result shapes, bespoke `AssignmentErrorResponse` envelope with top-level `code` field
<!-- /generated -->

<!-- Hand-written sections below this line are preserved across regeneration. -->
