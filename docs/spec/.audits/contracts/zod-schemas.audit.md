---
page: docs/spec/contracts/zod-schemas.md
audited_at: 2026-09-28
findings: 55
---

# Audit: docs/spec/contracts/zod-schemas.md

## Verified (33)

- ✓ IPC payload schemas live in `src/main/schemas.ts` with matching `z.infer<>` type exports (e.g. `src/main/schemas.ts:129-135`, `:186-191`).
- ✓ `registerParsedPositionHandler(db, channel, logLabel, schema, handler)` is a private helper in `src/main/ipc/positions.ts:35`, built on `handleIpcCall` from `src/main/ipc/utils.ts`; registered for the mutating position channels at `positions.ts:73-144`.
- ✓ `handleIpcCall` maps `ValidationError` → `{ field, code, message }` and unknown errors → `__root__` / `internal_error` (`src/main/ipc/utils.ts:24-26`, `:62-68`); `ZodError` issues map to `{ field: path[0], code, message }` (`utils.ts:52-60`).
- ✓ Core enums import from `src/main/core/types.ts` (import at `src/main/schemas.ts:27-34`).
- ✓ `WheelStatus = z.enum(['ACTIVE','CLOSED'])` (`src/main/core/types.ts:6`).
- ✓ `LegRole` values `CSP_OPEN, CSP_CLOSE, ROLL_FROM, ROLL_TO, CC_OPEN, CC_CLOSE, CC_EXPIRED, CALLED_AWAY, EXPIRE, ASSIGN` (`src/main/core/types.ts:19-30`).
- ✓ `LEG_ACTION_VALUES = ['SELL','BUY','EXPIRE','ASSIGN','EXERCISE'] as const` module-private and `LegAction = z.enum(LEG_ACTION_VALUES)` (`src/main/core/types.ts:3`, `:31`).
- ✓ `InstrumentType = z.enum(['PUT','CALL','STOCK'])` (`src/main/core/types.ts:32`); migration `migrations/003_rename_option_type_to_instrument_type.sql` exists.
- ✓ `expire-cc-position.ts` persists `CC_EXPIRED` (`src/main/services/expire-cc-position.ts:51`, `:84`); `record-call-away-position.ts` persists `CALLED_AWAY` / `EXERCISE` (`src/main/services/record-call-away-position.ts:78`, `:116-117`).
- ✓ Phase-aware active-leg resolution `CSP_OPEN → CSP_OPEN|ROLL_TO`, `CC_OPEN → CC_OPEN|ROLL_TO` (`src/main/services/active-leg-sql.ts:10-11`).
- ✓ `RollPayloadBaseSchema` field shape (positionId, costToClosePerContract, newPremiumPerContract, newExpiration regex, optional newStrike, optional fillDate) matches `src/main/schemas.ts:328-335`.
- ✓ `CloseCspPayloadSchema` shape (`src/main/schemas.ts:129-133`).
- ✓ `ExpireCspPayloadSchema` shape (`src/main/schemas.ts:186-189`).
- ✓ `OpenCcPayloadSchema` shape (`src/main/schemas.ts:233-240`).
- ✓ `CloseCcPayloadSchema` shape (`src/main/schemas.ts:304-308`).
- ✓ `ExpireCcPayloadSchema` shape (`src/main/schemas.ts:280-283`).
- ✓ `RecordCallAwayPayloadSchema = { positionId: PositionIdSchema }` (`src/main/schemas.ts:254-256`); `PositionIdSchema = z.string().uuid()` (`:40`).
- ✓ `RollCspPayloadSchema = RollPayloadBaseSchema` and `RollCcPayloadSchema = RollPayloadBaseSchema` (`src/main/schemas.ts:348`, `:365`).
- ✓ `newStrike` defaults to the current strike service-side (`src/main/services/roll-csp-position.ts:34`).
- ✓ us-13 relaxation is still planned/not implemented: `rollCsp` still rejects `newExpiration <= currentExpiration` (`src/main/core/lifecycle.ts:371-377`); no `rollCount` in `src/main`.
- ✓ CC roll accepts `>=` and rejects unchanged strike+expiration with `__roll__` / `no_change` (`src/main/core/lifecycle.ts:401-415`).
- ✓ `GetStockQuotesPayloadSchema` — ≤50 tickers, each 1–10 chars (`src/main/schemas.ts:382-391`); `SetStockQuoteTickersPayloadSchema` aliased (`:394`).
- ✓ `GetOptionSnapshotsPayloadSchema` — ≤50 symbols, 1–25 chars (`src/main/schemas.ts:397-399`).
- ✓ `CollectIvrNowBatchSchema` shape with `skippedReason: z.enum(['market_data_unavailable']).nullable()` (`src/main/schemas.ts:173-178`); re-parsed in `ivr:collect-now` handler after `scheduler.runNow(IVR_COLLECT_JOB_NAME)` (`src/main/ipc/ivr.ts:10-17`); batch produced by `collectIvHistoryBatch` (`src/main/services/ivr-collector.ts:69`); mirrored as `IpcCollectIvrNowBatch` (`src/preload/index.d.ts:371`) and `CollectIvrNowResult` (`src/renderer/src/api/ivr.ts:34`).
- ✓ `SaveAlertDefaultsPayloadSchema` / `SaveAlertOverridesPayloadSchema` bounds 1–99 / 6–45 with matching messages (`src/main/schemas.ts:460-489`, constants in `src/main/core/alert-thresholds.ts:6-12`); override fields `.nullable()`, `positionId: z.string().min(1)`.
- ✓ `LegRecord` field set incl. `rollChainId: string | null` (`src/main/schemas.ts:81-96`).
- ✓ `GetPositionResult` has `position`, `activeLeg`, `costBasisSnapshot`, `legs`, `allSnapshots` (`src/main/schemas.ts:149-155`).
- ✓ `ExpireCspPositionResult`, `OpenCcPositionResult`, `CloseCcPositionResult` (incl. `ccLegPnl`, no snapshot), `ExpireCcPositionResult` (incl. `sharesHeld`), `RecordCallAwayResult` (incl. `finalPnl`, `cycleDays`, `annualizedReturn`, `basisPerShare`) match `src/main/schemas.ts:193-326`.
- ✓ Market-data IPC mirrors `IpcStockQuote`, `IpcMarketStatus` (session `'regular'|'pre'|'post'|'closed'`), `IpcStockQuoteEvent`, `IpcStreamErrorEvent` (feed `'stockQuotes'|'optionQuotes'|'optionTrades'`) in `src/preload/index.d.ts:212-226`, `:662-672`.
- ✓ `ConfirmAssignmentPayloadSchema` / `DismissAssignmentPayloadSchema` = `{ pendingAssignmentId: z.number().int().positive() }` (`src/main/schemas.ts:503-510`); `PendingAssignmentNotification` in `src/preload/index.d.ts:617-626`; confirm returns `{ id, phase: 'HOLDING_SHARES', assignedAt }` (`src/main/services/pending-assignments.ts:91`), dismiss returns `{ dismissedAt }` (`src/main/ipc/assignments.ts:31`).
- ✓ Settings payload schemas (`BrokerEnvironmentSchema`, `NonEmptyTrimmedStringSchema`, save/remove/set-active/test-stored, `TestConnectionPayloadSchema` with `vendor: z.literal('alpaca')`) match `src/main/schemas.ts:430-497`.
- ✓ `CredentialStatus` (no Massive fields; `marketData` derived from `activeBrokerEnv !== 'none' || hasFallbackCredentials()`) matches `src/main/services/settings.ts:11-18`, `:168`; `TestConnectionResult` / `ConnectionErrorCode` match `src/main/services/settings-connections.ts:6-24`; `MockSettingsConnectionConfig` has only an `alpaca` key (`src/main/index.ts:40-42`).
- ✓ `WatchlistRemovePayloadSchema`, `WatchlistEntryRecord`, ticker rule `^[A-Z]{1,5}$` trimmed+uppercased, notes ≤500, ivrTrigger 0–100, booleans default false (`src/main/schemas.ts:517-556`); renderer `watchlistEntrySchema` with the two messages (`src/renderer/src/schemas/watchlist.ts:31-37`).

## Drift (15)

- ✗ `WheelPhase` lists 6 values, but `src/main/core/types.ts:7-18` defines 10 — also `CSP_EXPIRED`, `CC_EXPIRED`, `CC_CLOSED_PROFIT`, `CC_CLOSED_LOSS`. Suggested fix: list all enum members.
- ✗ "All five live in `src/main/core/types.ts`" — the file also exports `StrategyType = z.enum(['WHEEL','PMCC'])` (`src/main/core/types.ts:5`), which the page never documents though `PositionRecord.strategyType` uses it.
- ✗ Page shows `export const IsoDateRegex`, `export const IsoDateMessage`, `export const RollPayloadBaseSchema` and says the constants are "exported standalone for reuse"; all three are module-private `const` (`src/main/schemas.ts:42-43`, `:328`). `RollResultBase` is also non-exported (`:337`).
- ✗ `AssignCspPayloadSchema.assignmentDate` documented as bare `z.string()`, but code is `z.string().regex(IsoDateRegex, IsoDateMessage)` (`src/main/schemas.ts:211`).
- ✗ `CloseCspPayloadSchema` / `ExpireCspPayloadSchema` shown with inline `z.string().uuid()`; code uses shared `PositionIdSchema` (`src/main/schemas.ts:130`, `:187`) — shape is equivalent, but the page says only us-10 introduced the helper.
- ✗ `CloseCspPayloadSchema` note: "the service defaults it to today via `new Date().toISOString().slice(0, 10)`"; service uses `localToday()` (`src/main/services/close-csp-position.ts:16-17`).
- ✗ `PositionRecord` documented with 6 fields; code has 15, incl. `strategyType`, `accountId`, `notes`, `thesis`, `tags`, `profitTargetPercent`, `managementWindowDteOverride`, `createdAt`, `updatedAt` (`src/main/schemas.ts:63-79`).
- ✗ `CostBasisSnapshotRecord` is missing `triggerEvent: TriggerEvent` (`src/main/schemas.ts:108-117`; `TriggerEvent` union at `:98-106`).
- ✗ `PositionListItem` is missing `instrumentType`, `contracts`, `entryPremiumPerContract`, `profitTargetPercent` (`src/main/schemas.ts:157-171`).
- ✗ `CloseCspPositionResult.position.phase` documented as `'CSP_CLOSED_PROFIT' | 'CSP_CLOSED_LOSS'` and `status: 'CLOSED'`; code types them as the broad `WheelPhase` / `WheelStatus` (`src/main/schemas.ts:138-144`). `AssignCspPositionResult.position` also carries `closedDate: null` (`:217-223`), which the page omits.
- ✗ `RollResultBase` documented as containing `position`; in code the base holds only `rollFromLeg`, `rollToLeg`, `rollChainId`, `costBasisSnapshot`, and each extender declares its own `position` (`src/main/schemas.ts:337-377`).
- ✗ Market-data result shapes are said to "live alongside the position result interfaces in `src/main/schemas.ts`". None of `IpcStockQuote`, `IpcMarketStatus`, `IpcGetStockQuotesResult` etc. is in `schemas.ts`. `IpcStockQuote` is in `src/main/services/market-data.ts:11`, and the rest exist only in `src/preload/index.d.ts:212-300`, where the results are `IpcResult<...>` wrappers, not `{ ok: true, ... }` interfaces.
- ✗ Assignment error envelope: the page cites a `pendingAssignmentErrorResponse` helper in `src/main/ipc/assignments.ts` and codes `'TRANSITION_REJECTED'`, "outside the standard `handleIpcCall` shape". There is no such helper. The `code` is added inside `handleIpcCall` via `rootCauseEnvelope` (`src/main/ipc/utils.ts:14-16`, `:28-29`), and `PendingAssignmentError` codes are only `'NOT_PENDING' | 'NOT_FOUND'` (`src/main/services/pending-assignments.ts:7`).
- ✗ Watchlist: the page documents `WatchlistAddPayloadSchema` / `WatchlistAddPayload`. The code exports `WatchlistEntryPayloadSchema` / `WatchlistEntryPayload`, shared by add and update (`src/main/schemas.ts:538-541`). `notes` is also `.nullable().optional()`.
- ✗ Coverage gap in "One `z.object({...})` per mutating IPC handler": these exported schemas are not catalogued — `CreatePositionPayloadSchema` (`src/main/schemas.ts:45`), `GetOptionSnapshotPayloadSchema` (`:402`), `GetOptionChainPayloadSchema` (`:408`), `GetBrokerActivitiesPayloadSchema` (`:420`), `SaveScreeningCriteriaPayloadSchema` (`:567`), `DismissAlertPayloadSchema` (`:607`); nor are the result types `AlertRecord`, `DismissedAlertRecord`, `ManagementQueueItem`, `EvaluateAlertsResult` (`:591-639`).

## Unverifiable (1)

- ? Overview says the handler "performs `schema.safeParse(raw)`". The helper actually calls `schema.parse` inside `handleIpcCall`, which catches the `ZodError` (`src/main/ipc/positions.ts:43`). The observable envelope is the same; this is a narrative mechanism detail, flagged for human review rather than counted as drift.

## Missing files (6)

- ✗ `../features/us-5-record-csp-expiration.md` does not exist (actual: `docs/spec/features/us-5-expire-csp.md`).
- ✗ `../features/us-6-record-csp-assignment.md` does not exist (actual: `us-6-record-assignment.md`).
- ✗ `../features/us-9-record-cc-expiration.md` does not exist (actual: `us-9-expire-cc.md`).
- ✗ `../features/us-10-record-call-away.md` does not exist (actual: `us-10-call-away.md`).
- ✗ `../features/us-11-wheel-leg-chain-display.md` does not exist (actual: `us-11-leg-history.md`).
- ✗ `../features/us-13-roll-csp-down-and-out.md` does not exist (actual: `us-13-roll-down-and-out.md`).
