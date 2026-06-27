---
page: docs/spec/contracts/zod-schemas.md
audited_at: 2026-06-27
findings: 4
---

# Audit: docs/spec/contracts/zod-schemas.md

## Verified (24)

- ✓ Schemas live in `src/main/schemas.ts` (all payload/result exports present, e.g. `schemas.ts:103,160,183,207,228,254,278,322,339,363,368,371,404,408,415,420,427,434,451,456`).
- ✓ Core enums in `src/main/core/types.ts`: `WheelPhase` (`:7`), `WheelStatus` (`:6`), `LegRole` (`:19`), `LegAction` (`:31`), `InstrumentType` (`:32`) — schemas import them rather than redeclaring.
- ✓ `LegAction = z.enum(LEG_ACTION_VALUES)` with values `['SELL','BUY','EXPIRE','ASSIGN','EXERCISE']` (`core/types.ts:3,31`).
- ✓ `InstrumentType = z.enum(['PUT','CALL','STOCK'])` (`core/types.ts:32`); column rename migration exists at `migrations/003_rename_option_type_to_instrument_type.sql`.
- ✓ `PositionIdSchema = z.string().uuid()` (`schemas.ts:16`).
- ✓ `RollPayloadBaseSchema` defined and assigned to both `RollCspPayloadSchema` (`schemas.ts:322`) and `RollCcPayloadSchema` (`schemas.ts:339`).
- ✓ `RollResultBase` interface extended by `RollCspResult` (`schemas.ts:326`) and `RollCcResult` (`schemas.ts:343`).
- ✓ `CloseCspPayloadSchema` shape — `positionId`, `closePricePerContract: z.number().positive()`, `fillDate: z.string().optional()` (`schemas.ts:103-106`).
- ✓ `ExpireCspPayloadSchema`, `AssignCspPayloadSchema`, `OpenCcPayloadSchema`, `RecordCallAwayPayloadSchema`, `ExpireCcPayloadSchema`, `CloseCcPayloadSchema` all present (`schemas.ts:160,183,207,228,254,278`).
- ✓ `GetStockQuotesPayloadSchema` / `SetStockQuoteTickersPayloadSchema` (aliased) (`schemas.ts:363,368`).
- ✓ `GetOptionSnapshotsPayloadSchema = z.object({ symbols: z.array(z.string().min(1).max(25)).max(50) })` (`schemas.ts:371-372`).
- ✓ `CollectIvrNowBatchSchema` present (`schemas.ts:147`); consumed by `ivr:collect-now` via `CollectIvrNowBatchSchema.parse(...)` (`src/main/ipc/ivr.ts:4,13`).
- ✓ `ConfirmAssignmentPayloadSchema` / `DismissAssignmentPayloadSchema` — each `{ pendingAssignmentId: z.number().int().positive() }`, separate named exports (`schemas.ts:451-459`).
- ✓ `assignments:confirm` / `assignments:dismiss` / `assignments:list-pending` / `assignments:run-detection-now` handlers exist (`src/main/ipc/assignments.ts:16,20,27,35`); `list-pending` and `run-detection-now` take no payload.
- ✓ `BrokerEnvironmentSchema = z.enum(['paper','live'])` (`schemas.ts:404`).
- ✓ Settings payload schemas: `SaveAlpacaCredentialsPayloadSchema`, `RemoveAlpacaCredentialsPayloadSchema`, `SetActiveBrokerEnvironmentPayloadSchema`, `TestStoredAlpacaConnectionPayloadSchema` (`schemas.ts:408,415,420,427`).
- ✓ `TestConnectionPayloadSchema = z.discriminatedUnion('vendor', [...])` with `massive` and `alpaca` variants (`schemas.ts:434`).
- ✓ Result interfaces `PositionRecord`, `LegRecord`, `CostBasisSnapshotRecord`, `PositionListItem`, `GetPositionResult`, `CloseCspPositionResult`, etc. present in `src/main/schemas.ts` (`:39,55,82,131,123,111,167,190,218,234,261,286,326,343`).
- ✓ `GetPositionResult` includes `allSnapshots: CostBasisSnapshotRecord[]` (us-11) (`schemas.ts:128`).
- ✓ `LegRecord` includes `rollChainId` (us-15) — confirmed in interface (`schemas.ts:55` block).
- ✓ Settings IPC handlers `settings:get-credential-status`, `settings:save-alpaca-credentials`, `settings:remove-alpaca-credentials`, `settings:set-active-broker-environment`, `settings:test-connection`, `settings:test-stored-alpaca-connection` (`src/main/ipc/settings.ts:48,54,69,83,96,109`).
- ✓ `pendingAssignmentErrorResponse` bespoke error-envelope helper referenced in `src/main/ipc/assignments.ts`.
- ✓ `OptionType → InstrumentType` rename + `+ STOCK` matches code; `LegAction` extensions `EXPIRE/ASSIGN/EXERCISE` all present in the tuple.
- ✓ `IsoDateRegex` / `IsoDateMessage` and `RollPayloadBaseSchema` shape (`positionId`, `costToClosePerContract`, `newPremiumPerContract`, `newExpiration`, `newStrike?`, `fillDate?`) present in `schemas.ts:302-309`.

## Drift (4)

- ✗ **`WheelStatus` values.** Page (line 26) claims `'ACTIVE' | 'PAUSED' | 'CLOSED'`. Code is `z.enum(['ACTIVE', 'CLOSED'])` (`src/main/core/types.ts:6`) — **no `PAUSED`**. Suggested fix: drop `PAUSED` from the documented enum.
- ✗ **`registerParsedPositionHandler` location.** Page (line 9) says it is registered "from `src/main/ipc/utils.ts`." It is actually defined locally in `src/main/ipc/positions.ts:32` (a private helper in that file). `src/main/ipc/utils.ts` exports only `handleIpcCall` (`utils.ts:10`); grep for `registerParsedPositionHandler` finds it solely in `positions.ts`. Suggested fix: correct the source path to `src/main/ipc/positions.ts`.
- ✗ **`LEG_ACTION_VALUES` export.** Page (line 36) shows `export const LEG_ACTION_VALUES = [...]`. In code it is **not exported** — `const LEG_ACTION_VALUES = [...] as const` (`src/main/core/types.ts:3`, no `export` keyword). Only `LegAction` is exported. Suggested fix: drop the `export` from the documented snippet (or export it in code if intended public).
- ✗ **`CloseCspPayloadSchema` reproduced literal.** Page (lines 81-85) shows `positionId: z.string().uuid()`. Code uses the shared `positionId: PositionIdSchema` (`schemas.ts:104`). Same runtime shape, but the reproduced snippet predates the helper extraction. Several other payload snippets on the page (`ExpireCsp`, `AssignCsp`, `OpenCc`, `CloseCc`) likewise show inline `z.string().uuid()` where code now uses `PositionIdSchema` (`schemas.ts:161,184,208,255,279`). Suggested fix: update reproduced snippets to `PositionIdSchema` for consistency. Low severity.

## Unverifiable (2)

- ? The narrative that `registerParsedPositionHandler` "catches `ValidationError` ... and any uncaught error (returned as `__root__` / `internal_error`)" (line 9) — the helper exists and wraps `handleIpcCall` (`positions.ts:40`), but the full error-mapping branches were not line-traced.
- ? Numerous "planned (us-13, not yet implemented)" notes (e.g. `rollCount`, relaxed roll expiration rule) — correctly labelled as not-yet-implemented; `GetPositionResult` has no `rollCount` field (`schemas.ts:123-129`), consistent with "planned." No drift, but inherently forward-looking.

## Missing files (0)

- All cited source paths exist: `src/main/schemas.ts`, `src/main/core/types.ts`, `src/main/core/lifecycle.ts`, `src/main/ipc/utils.ts`, `src/main/ipc/positions.ts`, `src/main/ipc/assignments.ts`, `src/main/ipc/ivr.ts`, `src/main/ipc/settings.ts`, `src/preload/index.d.ts` (referenced for `PendingAssignmentNotification` / mirrored market-data types — existence not separately confirmed but path is plausible).
