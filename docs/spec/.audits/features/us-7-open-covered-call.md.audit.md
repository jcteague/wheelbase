---
page: docs/spec/features/us-7-open-covered-call.md
audited_at: 2026-06-27
findings: 0
---

# Audit: docs/spec/features/us-7-open-covered-call.md

## Verified (12)

- ✓ All 21 listed source files exist, including the split renderer components (`OpenCoveredCallSheet.tsx`, `OpenCcForm.tsx`, `OpenCcSuccess.tsx`, `openCcGuardrail.ts`) with their tests and `e2e/open-covered-call.spec.ts`.
- ✓ IPC handler `positions:open-cc` registered at `src/main/ipc/positions.ts:91`.
- ✓ `openCoveredCall` lifecycle function at `src/main/core/lifecycle.ts:181`.
- ✓ `calculateCcOpenBasis` cost-basis function at `src/main/core/costbasis.ts:155`.
- ✓ `OpenCcPayloadSchema` at `src/main/schemas.ts:207`.
- ✓ Shared lifecycle helpers `requirePositiveStrike` (`lifecycle.ts:35`) and `requirePositivePremium` (`lifecycle.ts:47`), both invoked by `openWheel` (lines 72, 82) and `openCoveredCall` (lines 198, 199) — confirms the "shared with openWheel()" refactor claim.
- ✓ `round4` helper exists at `src/main/core/costbasis.ts:23` and is used in `calculateCcOpenBasis` (lines 164-165).
- ✓ `computeGuardrail(strike, basis)` pure helper at `src/renderer/src/components/openCcGuardrail.ts:24`.
- ✓ Renderer adapter `openCoveredCall` at `src/renderer/src/api/positions.ts:324`; uses `mapIpcErrors`/`IPC_TO_FORM_FIELD`.
- ✓ `useOpenCoveredCall` hook exported at `src/renderer/src/hooks/useOpenCoveredCall.ts:6`.
- ✓ Preload binding `openCoveredCall` invokes `positions:open-cc` at `src/preload/index.ts:24`.
- ✓ `handleIpcCall` wrapper (referenced with label `positions_open_cc_unhandled_error`) exists at `src/main/ipc/utils.ts:10`.

## Drift (0)

None.

## Unverifiable (3)

- ? CC open leg shape (`leg_role='CC_OPEN'`, `action='SELL'`, `instrument_type='CALL'`, `fill_price=null`) — service-internal INSERT in `open-covered-call-position.ts`; file exists, exact column values not line-verified.
- ? Component line counts ("104 lines", "649-line draft", "~200 line limit") and `react-refresh/only-export-components` extraction rationale — narrative refactor claims; not mechanically audited.
- ? Guardrail variant mapping (`above → info`, `at|below → warning`) — narrative; `computeGuardrail`/`computeGuardrailComparison` exist (`openCcGuardrail.ts:6,24`) but the AlertBox variant wiring in `OpenCcForm` not grepped.

## Missing files (0)

- ✓ Relative links `../domain/wheel-lifecycle.md`, `../domain/cost-basis.md`, `../contracts/ipc-handlers.md`, `../schema/tables.md` all resolve.
