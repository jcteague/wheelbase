# US-7: Open a covered call

<!-- generated:from us-7 -->
## Summary

Adds the ability to sell a covered call against shares acquired through CSP assignment, introducing the lifecycle transition `HOLDING_SHARES → CC_OPEN`. A right-side sheet on the position detail page hosts a React Hook Form + Zod form with an inline cost-basis guardrail; on submit the backend writes a `CC_OPEN`/`SELL`/`CALL` leg, appends a fresh cost-basis snapshot reducing `basis_per_share` by the CC premium, and transitions the position to `CC_OPEN` — all in one transaction. No schema migration required.

## Acceptance criteria

- The "Open Covered Call →" button appears in the position detail header only when phase is `HOLDING_SHARES`; the sheet is rejected if the phase is anything else, with `invalid_phase` messages distinguishing "A covered call is already open on this position" from "This position is closed".
- A `CC_OPEN` leg is written with `action = SELL`, `instrument_type = CALL`, `fill_price = null`, and the trader-entered strike, expiration, contracts, and premium per contract.
- Effective cost basis updates to `prevBasisPerShare − ccPremiumPerContract`; `total_premium_collected` increases by `ccPremium × contracts × 100`; a new `cost_basis_snapshots` row is inserted with `final_pnl = null` and the prior snapshot is never mutated.
- Strike above basis renders an info note "Shares called away at $X → profit of $Y/share"; strike equal to basis warns "This strike is at your cost basis — you would break even if called away"; strike below basis warns "This strike is below your cost basis — you would lock in a loss of $Y/share if called away". All three are non-blocking — Confirm stays enabled.
- Contracts must be ≤ the ASSIGN leg's `contracts`; exceeding it rejects with "Contracts cannot exceed shares held (n)". Partial coverage (`ccContracts < assignContracts`) is allowed with a UI notice "1 of 2 contracts covered — 100 shares uncovered".
- Fill date is rejected if before the ASSIGN leg's `fill_date` ("Fill date cannot be before the assignment date") or in the future ("Fill date cannot be in the future"); a future fill date in the form shows a soft warning but Confirm stays enabled.
- Strike and premium per contract must be positive; expiration in the past is rejected ("Expiration date must be in the future") and disables the Confirm button; zero premium shows a soft warning only.

## What was built

The pure lifecycle engine gains `openCoveredCall(input)`: it validates phase is `HOLDING_SHARES`, strike and premium are positive, `contracts ≤ positionContracts`, and `assignmentDate ≤ fillDate ≤ referenceDate`, then returns `{ phase: 'CC_OPEN' }`. Two private helpers — `requirePositiveStrike` and `requirePositivePremium` — were extracted during refactor and are shared with `openWheel()`. The cost-basis engine gains `calculateCcOpenBasis(input)` with the formula `basisPerShare = round4(prevBasisPerShare − ccPremiumPerContract)`, `totalPremiumCollected = round4(prevTotal + ccPremium × contracts × 100)` using `decimal.js` and `ROUND_HALF_UP` via the existing `round4` helper.

`openCoveredCallPosition` orchestrates the write inside one SQLite transaction: it loads context via `getPosition`, reads the ASSIGN leg to source `assignmentDate` and `positionContracts`, calls the lifecycle and cost-basis engines, inserts the `CC_OPEN`/`SELL`/`CALL` leg, appends the new `cost_basis_snapshots` row, and updates `positions.phase` to `CC_OPEN`. The IPC handler `positions:open-cc` is registered using the shared `handleIpcCall('positions_open_cc_unhandled_error', ...)` wrapper and returns `{ ok: true, position, leg, costBasisSnapshot }`. `fillDate` defaults to today when omitted.

The renderer adapter `openCoveredCall` maps a snake_case payload to camelCase IPC fields (extending `IPC_TO_FORM_FIELD`). A `useOpenCoveredCall` mutation hook invalidates `positionQueryKeys.all` on success. `OpenCoveredCallSheet` is a portal-based right-side panel mirroring `AssignmentSheet`; after a 649-line draft was split during refactor it now orchestrates state and submit only (104 lines), delegating to `OpenCcForm` (form + guardrail), `OpenCcSuccess` (success hero with `StatBox` sub-component and profit preview `(strike − basisPerShare) × sharesHeld`), and `openCcGuardrail.ts` (the pure `computeGuardrail(strike, basis)` function, extracted to satisfy `react-refresh/only-export-components`). The guardrail variant mapping is `type === 'above' → AlertBox variant="info"`, `type === 'at' | 'below' → AlertBox variant="warning"`. The conditional entry-point button lives on `PositionDetailPage`, which owns `openCcCtx` state populated from the position's basis-per-share, total-premium-collected, contracts, and assignment date.

## Architecture decisions

- Lifecycle owns a dedicated `openCoveredCall()` function rather than overloading an existing transition; the engine remains a pure state machine where each transition gets its own named function (matching the `recordAssignment()` pattern) → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Cost basis after CC open is a dedicated `calculateCcOpenBasis()` rather than a branch of `calculateAssignmentBasis()`; CC premium reduces basis as a credit and conflating two distinct events would break the engine's open/closed boundary → [domain/cost-basis.md](../domain/cost-basis.md)
- Fill-date validation (`fillDate ≥ assignmentDate`, `fillDate ≤ referenceDate`) lives in the lifecycle engine as pure date-string comparisons, mirroring `openWheel()` and `recordAssignment()` → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Contract-count validation lives in the lifecycle engine (`exceeds_shares` thrown from `openCoveredCall()` itself); the service layer still owns reading the ASSIGN leg's `contracts` from leg history because that leg is the source of truth for shares held → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `positions:open-cc` registered via the shared `handleIpcCall` wrapper with label `positions_open_cc_unhandled_error`, returning the standard `{ ok, ... } | { ok: false, errors }` envelope → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Renderer adapter is snake_case at the boundary and maps to camelCase IPC fields via `IPC_TO_FORM_FIELD`; error fields `strike` / `premiumPerContract` / `fillDate` map back to `strike` / `premium_per_contract` / `fill_date` → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- CC open leg shape: `leg_role = 'CC_OPEN'`, `action = 'SELL'`, `instrument_type = 'CALL'`, `fill_price = null` (manual entry has no separate fill-price vs premium distinction); reuses existing `legs`, `cost_basis_snapshots`, and `positions` tables with no migration → [schema/tables.md](../schema/tables.md)
- The cost-basis guardrail is a client-side, non-blocking pure function (`computeGuardrail`) — Confirm stays enabled in all three variants because the trader may have a deliberate reason to sell below basis.
- The sheet follows the `AssignmentSheet` portal pattern (right-side panel, header/body/footer, form-state → success-state transition); future fill dates and zero premium are soft warnings only, mirroring US-6 assignment-date behaviour.
- File-size limit (~200 lines) drove the split into `OpenCoveredCallSheet` (orchestrator), `OpenCcForm`, `OpenCcSuccess`, and `openCcGuardrail.ts`; the guardrail helper was extracted to its own module to satisfy `react-refresh/only-export-components`.

## Contracts touched

- `positions:open-cc` — IPC handler returning `{ position, leg, costBasisSnapshot }` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `OpenCcPayloadSchema` — Zod schema for `{ positionId, strike, expiration, contracts, premiumPerContract, fillDate? }` with positive-number and integer constraints → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `OpenCcPositionResult` — IPC return type composing `PositionData`, `LegRecord`, and `CostBasisSnapshotRecord` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `openCoveredCall` lifecycle function (`OpenCoveredCallInput` / `OpenCoveredCallResult`); known error codes `__phase__/invalid_phase`, `contracts/exceeds_shares`, `fillDate/before_assignment`, `fillDate/cannot_be_future`, `strike/must_be_positive`, `premiumPerContract/must_be_positive` → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `calculateCcOpenBasis` cost-basis function (`CcOpenBasisInput` / `CcOpenBasisResult`) → [../domain/cost-basis.md](../domain/cost-basis.md)
- Preload bridge: `window.api.openCoveredCall(payload)` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Renderer adapter `openCoveredCall` — snake_case payload, camelCase response, error mapping via `IPC_TO_FORM_FIELD` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `useOpenCoveredCall` hook — TanStack Query mutation invalidating `positionQueryKeys.all`.
- `computeGuardrail(strike, basis)` — pure renderer helper returning `{ type: 'below' | 'at' | 'above', message } | null`.
- Shared lifecycle helpers `requirePositiveStrike` / `requirePositivePremium` extracted during refactor, used by both `openWheel()` and `openCoveredCall()` → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)

## Source files

- `src/main/core/lifecycle.ts`
- `src/main/core/lifecycle.test.ts`
- `src/main/core/costbasis.ts`
- `src/main/core/costbasis.test.ts`
- `src/main/schemas.ts`
- `src/main/services/open-covered-call-position.ts`
- `src/main/services/open-covered-call-position.test.ts`
- `src/main/services/positions.ts`
- `src/main/ipc/positions.ts`
- `src/preload/index.ts`
- `src/renderer/src/api/positions.ts`
- `src/renderer/src/hooks/useOpenCoveredCall.ts`
- `src/renderer/src/components/OpenCoveredCallSheet.tsx`
- `src/renderer/src/components/OpenCcForm.tsx`
- `src/renderer/src/components/OpenCcForm.test.tsx`
- `src/renderer/src/components/OpenCcSuccess.tsx`
- `src/renderer/src/components/OpenCcSuccess.test.tsx`
- `src/renderer/src/components/openCcGuardrail.ts`
- `src/renderer/src/components/openCcGuardrail.test.ts`
- `src/renderer/src/pages/PositionDetailPage.tsx`
- `e2e/open-covered-call.spec.ts`
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
