---
page: docs/spec/features/us-10-call-away.md
audited_at: 2026-06-27
findings: 1
---

# Audit: docs/spec/features/us-10-call-away.md

## Verified (24)

- ✓ All 29 listed source files exist (Glob), including `src/main/services/record-call-away-position.ts`, `src/renderer/src/pages/usePositionDetailSheets.ts`, `src/renderer/src/pages/PositionDetailContent.tsx`, and `e2e/call-away.spec.ts`.
- ✓ IPC handler `positions:record-call-away` registered in `src/main/ipc/positions.ts:107` via `registerParsedPositionHandler` (`positions.ts:32`) — matches the Refactor-pass standardization claim.
- ✓ `recordCallAway()` lifecycle function at `src/main/core/lifecycle.ts:243`; calls `requireCcOpenPhase` (`lifecycle.ts:55,244`) and `requireFillDateOnOrAfterOpen` (`lifecycle.ts:61,254`).
- ✓ Shared helpers `requireCcOpenPhase()`, `requireFillDateOnOrAfterOpen()`, and constant `NO_OPEN_COVERED_CALL_MESSAGE` (`lifecycle.ts:33,55,61`) shared by `recordCallAway` and `closeCoveredCall` (`lifecycle.ts:332,336`) — matches Refactor claim.
- ✓ `calculateCallAway()` at `src/main/core/costbasis.ts:310`; `sharesHeld = sharesFromContracts(contracts)` (`:313`), `cycleDays = calculateCycleDays(...)` (`:317`).
- ✓ Shared cost-basis helpers `SHARES_PER_CONTRACT` (`costbasis.ts:10`), `sharesFromContracts()` (`:27`), `calculateCycleDays()` (`:31`).
- ✓ `LegAction` enum extended to include `'EXERCISE'` — `LEG_ACTION_VALUES = ['SELL','BUY','EXPIRE','ASSIGN','EXERCISE']` at `src/main/core/types.ts:3`; named `LEG_ACTION_VALUES` constant matches claim.
- ✓ `RecordCallAwayPayloadSchema` at `src/main/schemas.ts:228` reusing `PositionIdSchema` (`schemas.ts:16,229`).
- ✓ Service writes `CALLED_AWAY`/`EXERCISE`/`CALL` leg (`src/main/services/record-call-away-position.ts:78,116`) — note: page Summary says `CC_CLOSE`/`EXERCISE`/`CALL`; US-11 changed the persisted role to `CALLED_AWAY` (see Unverifiable).
- ✓ Renderer adapter `recordCallAway` at `src/renderer/src/api/positions.ts:403`; error path via shared `throwMappedIpcErrors` (`positions.ts:102,410`).
- ✓ Shared `usePositionMutation()` hook at `src/renderer/src/hooks/usePositionMutation.ts:11`, invalidating `positionQueryKeys.all` (`:20`); `useRecordCallAway` (`useRecordCallAway.ts:8`) and `useCloseCoveredCallEarly` (`useCloseCoveredCallEarly.ts:7`) both delegate.
- ✓ Shared `ActionButton` renderer in `PositionDetailActions.tsx:24`; `record-call-away-btn` test id at `PositionDetailActions.tsx:62`.
- ✓ `usePositionDetailSheets()` hook at `src/renderer/src/pages/usePositionDetailSheets.ts:106`; owns `callAwayCtx` (`:44,113,199`) and overlay-open calc (`:120`).
- ✓ Preload bridge `recordCallAway` at `src/preload/index.ts:26` → `positions:record-call-away`.

## Drift (1)

- ✗ Architecture-decision bullet (line 40) links to `[US-6](./us-6-close-csp-early.md)` for the "`closeCspPosition` pattern", but that file does not exist. The close-CSP-early story page is `docs/spec/features/us-4-close-csp.md`; `us-6-record-assignment.md` is the assignment story. The referenced `closeCspPosition` function does exist (`src/main/services/close-csp-position.ts`), so only the spec cross-link is wrong. Suggested fix: change the link to `[US-4](./us-4-close-csp.md)`.

## Unverifiable (1)

- ? Page Summary and several ACs describe the leg as `CC_CLOSE`/`EXERCISE`/`CALL`, but US-11 later changed the persisted `leg_role` to `CALLED_AWAY` (`src/main/services/record-call-away-position.ts:78,116`). This is documented forward-evolution in `us-11-leg-history.md`, not US-10-scope drift; the `CC_CLOSE` text is stale relative to current code. Flag for human review.

## Missing files (1)

- ✗ `./us-6-close-csp-early.md` (linked from line 40) does not exist. See Drift above.
- ✓ `../domain/wheel-lifecycle.md`, `../domain/cost-basis.md`, `../contracts/ipc-handlers.md`, `../schema/tables.md`, and `./us-5-expire-csp.md` all resolve.
