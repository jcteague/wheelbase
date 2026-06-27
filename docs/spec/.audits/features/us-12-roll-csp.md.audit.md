---
page: docs/spec/features/us-12-roll-csp.md
audited_at: 2026-06-27
findings: 0
---

# Audit: docs/spec/features/us-12-roll-csp.md

## Verified (19)

- ✓ `makeRollCspSchema(currentExpiration)` factory at `src/renderer/src/components/RollCspSheet.tsx:13`, wired into the RHF `zodResolver` at `:79` — matches the date-ordering-refine claim.

- ✓ All 19 listed source files exist (Glob), including `src/main/services/roll-csp-position.ts`, `src/main/services/active-leg-sql.ts`, `src/renderer/src/lib/rolls.ts`, and `e2e/csp-roll.spec.ts`.
- ✓ IPC handler `positions:roll-csp` registered in `src/main/ipc/positions.ts:122` via `registerParsedPositionHandler` (`positions.ts:32`) with `RollCspPayloadSchema`.
- ✓ `rollCsp()` lifecycle function at `src/main/core/lifecycle.ts:365`.
- ✓ `calculateRollBasis()` cost-basis function at `src/main/core/costbasis.ts:235`; computes `net` and `netTotal = net.times(sharesFromContracts(...))` (`:249`).
- ✓ `RollCspPayloadSchema` at `src/main/schemas.ts:322` (derived from `RollPayloadBaseSchema`); `positionId: PositionIdSchema` (`schemas.ts:303`).
- ✓ Service `roll-csp-position.ts` writes linked `ROLL_FROM` (BUY) at `:73` and `ROLL_TO` (SELL) at `:93`, sharing `roll_chain_id` (`:72,92`) — matches the linked-pair claim.
- ✓ `activeLegSubquery()` helper at `src/main/services/active-leg-sql.ts:6`; phase-aware: `CSP_OPEN → ('CSP_OPEN','ROLL_TO')` (`:10`), `CC_OPEN → ('CC_OPEN','ROLL_TO')` (`:11`) — matches the centralized active-leg claim.
- ✓ Renderer adapter `rollCsp` at `src/renderer/src/api/positions.ts:497`; error path via `throwMappedIpcErrors` (`positions.ts:507`); uses `IPC_TO_FORM_FIELD` (`positions.ts:83`).
- ✓ `useRollCsp` wraps `usePositionMutation` (`src/renderer/src/hooks/useRollCsp.ts:7-8`).
- ✓ Roll helpers `getRollTypeLabel` (`rolls.ts:25`), `computeNetCreditDebit` (`rolls.ts:40`), `rollCreditDebitColors` (`rolls.ts:61`) all in `src/renderer/src/lib/rolls.ts`.
- ✓ Preload bridge `rollCsp` at `src/preload/index.ts:28` → `positions:roll-csp`; declared in `src/preload/index.d.ts:431`.

## Drift (0)

None.

## Unverifiable (0)

None.

## Missing files (0)

- ✓ `../domain/wheel-lifecycle.md`, `../domain/cost-basis.md`, `../contracts/ipc-handlers.md`, `../schema/tables.md` all resolve.
