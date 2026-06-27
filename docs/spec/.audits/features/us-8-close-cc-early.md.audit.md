---
page: docs/spec/features/us-8-close-cc-early.md
audited_at: 2026-06-27
findings: 0
---

# Audit: docs/spec/features/us-8-close-cc-early.md

## Verified (24)

- ✓ All 24 listed source files exist (verified via Glob/test -e), including `src/main/services/close-covered-call-position.ts`, `src/renderer/src/components/ui/CcPnlPreview.tsx`, and `e2e/close-cc-early.spec.ts`.
- ✓ IPC handler `positions:close-cc-early` registered in `src/main/ipc/positions.ts:99` via `registerParsedPositionHandler` with label `positions_close_cc_early_unhandled_error` (`src/main/ipc/positions.ts:100`).
- ✓ `closeCoveredCall()` lifecycle function at `src/main/core/lifecycle.ts:331`; calls `requireCcOpenPhase`, `requirePositiveClosePrice`, `requireFillDateOnOrAfterOpen`.
- ✓ Shared `requirePositiveClosePrice` helper at `src/main/core/lifecycle.ts:51`, used by `closeCsp` (`lifecycle.ts:117`) and `closeCoveredCall` (`lifecycle.ts:334`) — matches refactor claim.
- ✓ `calculateCcClose()` cost-basis function at `src/main/core/costbasis.ts:195`; formula `round4((open − close) × sharesFromContracts(contracts))` (`costbasis.ts:198`) matches `(openPremium − closePrice) × contracts × 100`.
- ✓ `calculateCspClose` exists separately at `src/main/core/costbasis.ts:71` (dedicated-function claim holds).
- ✓ `CloseCcPayloadSchema` at `src/main/schemas.ts:278` with `positionId: PositionIdSchema` and `closePricePerContract` / `fillDate?`.
- ✓ Service `closeCoveredCallPosition` at `src/main/services/close-covered-call-position.ts:11`; returns `ccLegPnl` (`:111`).
- ✓ Renderer adapter `closeCoveredCallEarly` at `src/renderer/src/api/positions.ts:357`; uses `IPC_TO_FORM_FIELD` (`positions.ts:83`) and `throwMappedIpcErrors` (`positions.ts:102`).
- ✓ `useCloseCoveredCallEarly` delegates to `usePositionMutation` (`src/renderer/src/hooks/useCloseCoveredCallEarly.ts:7-8`), which invalidates `positionQueryKeys.all` (`usePositionMutation.ts:20`).
- ✓ Preload bridge `closeCoveredCallEarly` at `src/preload/index.ts:25` → `positions:close-cc-early`; declared in `src/preload/index.d.ts:428`.
- ✓ `CcPnlPreview` profit branch uses `(openPremium − closePrice) / openPremium × 100` "% of max" (`CcPnlPreview.tsx:33,39`) — matches the us-8-pct-fix revision; loss branch "% above open" (`CcPnlPreview.tsx:42`); returns null for empty/zero close price (`CcPnlPreview.tsx:14`).

## Drift (0)

None.

## Unverifiable (0)

None beyond narrative prose (warning copy text, success-CTA deferral), which is non-mechanical.

## Missing files (0)

- ✓ `../domain/wheel-lifecycle.md`, `../domain/cost-basis.md`, `../contracts/ipc-handlers.md`, `../schema/tables.md` all resolve.
