---
page: docs/spec/features/us-5-expire-csp.md
audited_at: 2026-06-27
findings: 0
---

# Audit: docs/spec/features/us-5-expire-csp.md

## Verified (10)

- ✓ All 19 listed source files exist (core lifecycle/costbasis/types, schemas, expire-csp + positions services, ipc handler, preload + preload .d.ts, renderer adapter/hook/lib/components/pages).
- ✓ IPC handler `positions:expire-csp` registered at `src/main/ipc/positions.ts:83`.
- ✓ `expireCsp` lifecycle function at `src/main/core/lifecycle.ts:149`.
- ✓ `calculateCspExpiration` cost-basis function at `src/main/core/costbasis.ts:173`.
- ✓ `ExpireCspPayloadSchema` at `src/main/schemas.ts:160`.
- ✓ Renderer adapter `expirePosition` at `src/renderer/src/api/positions.ts:270`.
- ✓ `useExpirePosition` hook exported at `src/renderer/src/hooks/useExpirePosition.ts:6`.
- ✓ Shared `PHASE_COLOR` constant at `src/renderer/src/lib/phase.ts:3`.
- ✓ Preload binding `expirePosition` invokes `positions:expire-csp` (`src/preload/index.ts:22`); `IpcExpireCspPayload` declared in `src/preload/index.d.ts:100` and `expirePosition` method on the api interface at line 425.
- ✓ shadcn `Sheet` primitive present at `src/renderer/src/components/ui/sheet.tsx`.

## Drift (0)

None within this page's scope. (Note: the page claims `LegAction` was extended to `z.enum(['SELL', 'BUY', 'EXPIRE'])`; the live enum at `src/main/core/types.ts:3` is `['SELL', 'BUY', 'EXPIRE', 'ASSIGN', 'EXERCISE']`. This reflects later stories (US-6 added `ASSIGN`, a later one added `EXERCISE`) appending values — correct for US-5's point-in-time scope, not drift.)

## Unverifiable (2)

- ? `snapshot_at = now + 1ms` ordering detail and `final_pnl = totalPremiumCollected` snapshot mechanics — service-internal narrative; functions exist but exact arithmetic not line-verified here.
- ? `ExpirationSheet` two internal states (`'confirmation'`/`'success'`) and the missing-ac `handleConfirmExpiration` one-line fix — component exists; internal state machine not grepped. Flag for human review.

## Missing files (0)

- ✓ Relative links `../domain/wheel-lifecycle.md`, `../domain/cost-basis.md`, `../contracts/ipc-handlers.md`, `../schema/tables.md` all resolve.
