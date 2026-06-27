---
page: docs/spec/features/us-4-close-csp.md
audited_at: 2026-06-27
findings: 1
---

# Audit: docs/spec/features/us-4-close-csp.md

## Verified (10)

- ✓ All 20 listed source files exist (core lifecycle/costbasis + tests, schemas, get-position/close-csp services + tests, positions service, ipc handlers + utils, preload, renderer adapter/hooks/components/pages + tests).
- ✓ IPC handler `positions:get` registered at `src/main/ipc/positions.ts:54`.
- ✓ IPC handler `positions:close-csp` registered at `src/main/ipc/positions.ts:67`.
- ✓ Shared `handleIpcCall` wrapper exists at `src/main/ipc/utils.ts:10`.
- ✓ `closeCsp` lifecycle function at `src/main/core/lifecycle.ts:112` (with `CloseCspInput`/`CloseCspResult`).
- ✓ `CloseCspPayloadSchema` at `src/main/schemas.ts:103`.
- ✓ `getPosition` helper at `src/main/services/get-position.ts:211`.
- ✓ `closeCspPosition` service at `src/main/services/close-csp-position.ts:11`, calling `getPosition` (line 22).
- ✓ Renderer adapter `mapIpcErrors` at `src/renderer/src/api/positions.ts:94`; `closePosition` adapter at line 258; `IPC_TO_FORM_FIELD` mapper at line 83.
- ✓ `usePosition` / `useClosePosition` hooks exported (`src/renderer/src/hooks/usePosition.ts:5`, `useClosePosition.ts:10`).

## Drift (1)

- ✗ Page names the cost-basis function `cspClose` (Summary §"the `cspClose` cost-basis function" and Revisions §us-4). The actual exported function is `calculateCspClose` at `src/main/core/costbasis.ts:71`. The type names `CspCloseInput` / `CspCloseResult` (Contracts touched §) are correct. Suggested fix: update page text `cspClose` → `calculateCspClose`.

## Unverifiable (1)

- ? `computePreview` helper extracted "above `CloseCspForm`" — narrative refactor claim; the component file exists but the exact local helper presence was not grepped. Flag for human review if precision needed.

## Missing files (0)

- ✓ Relative links `../domain/wheel-lifecycle.md`, `../domain/cost-basis.md`, `../contracts/ipc-handlers.md`, `../schema/tables.md` all resolve.
