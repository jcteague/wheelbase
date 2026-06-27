---
page: docs/spec/features/us-6-record-assignment.md
audited_at: 2026-06-27
findings: 0
---

# Audit: docs/spec/features/us-6-record-assignment.md

## Verified (12)

- ✓ All 19 listed source files exist, including migration `migrations/003_rename_option_type_to_instrument_type.sql` and `e2e/csp-assignment.spec.ts`.
- ✓ IPC handler `positions:assign-csp` registered at `src/main/ipc/positions.ts:75`.
- ✓ `recordAssignment` lifecycle function at `src/main/core/lifecycle.ts:273`.
- ✓ `calculateAssignmentBasis` cost-basis function at `src/main/core/costbasis.ts:115`.
- ✓ `AssignCspPayloadSchema` at `src/main/schemas.ts:183`.
- ✓ Migration 003 renames to `instrument_type` with expanded CHECK `instrument_type IN ('PUT', 'CALL', 'STOCK')` (`migrations/003...sql:6`); rebuild references `option_type` source column (line 41).
- ✓ `InstrumentType` Zod enum `['PUT', 'CALL', 'STOCK']` at `src/main/core/types.ts:32`; replaces `OptionType` (no `OptionType` symbol remains).
- ✓ `LegAction` enum includes `'ASSIGN'` (`src/main/core/types.ts:3`).
- ✓ Existing `'ASSIGN'` `LegRole` reused (`src/main/core/types.ts:25`), no new leg_role enum value.
- ✓ Renderer adapter `assignPosition` at `src/renderer/src/api/positions.ts:281`; uses `mapIpcErrors`/`IPC_TO_FORM_FIELD`.
- ✓ `useAssignPosition` hook exported at `src/renderer/src/hooks/useAssignPosition.ts:6`.
- ✓ Preload binding `assignPosition` invokes `positions:assign-csp` at `src/preload/index.ts:23`.

## Drift (0)

None. (Page's "Refactor status: pending" banner is a self-documented narrative caveat, not a code claim.)

## Unverifiable (3)

- ? `ASSIGN` event leg field shape (`leg_role='ASSIGN'`, `action='ASSIGN'`, `instrument_type='STOCK'`, `premium_per_contract='0.0000'`, `fill_price=NULL`, `final_pnl=NULL`) — service-internal insert; `assign-csp-position.ts` exists but the exact INSERT column values not line-verified.
- ? `getPosition().activeLeg` returns `null` for `HOLDING_SHARES` — narrative behavior; `get-position.ts` exists and maps an active leg, but the null-for-HOLDING_SHARES branch not isolated.
- ? `premiumWaterfall` `{label, amount}` ordering with `'Roll credit'` vs `'CSP premium'` labels — narrative engine-output claim; function exists, exact label logic not grepped.

## Missing files (0)

- ✓ Relative links `../schema/tables.md`, `../domain/wheel-lifecycle.md`, `../domain/cost-basis.md`, `../contracts/ipc-handlers.md` all resolve.
