---
page: docs/spec/features/us-9-expire-cc.md
audited_at: 2026-06-27
findings: 0
---

# Audit: docs/spec/features/us-9-expire-cc.md

## Verified (18)

- ✓ All 20 listed source files exist (Glob), including `src/main/services/expire-cc-position.ts` and `e2e/cc-expiration.spec.ts`.
- ✓ IPC handler `positions:expire-cc` registered in `src/main/ipc/positions.ts:113` wrapped in `handleIpcCall('positions_expire_cc_unhandled_error', ...)` (`positions.ts:114`) — matches page claim.
- ✓ `expireCc()` lifecycle function at `src/main/core/lifecycle.ts:303`, structurally separate from `expireCsp()` (`lifecycle.ts:149`).
- ✓ Service `expireCcPosition` at `src/main/services/expire-cc-position.ts:9`; computes `sharesHeld = assignLeg ? assignLeg.contracts * 100 : 0` (`:42`) and returns it (`:107`) — matches the server-side `sharesHeld` claim.
- ✓ EXPIRE/CALL leg shape with `premium_per_contract = '0.0000'` written by the service (since-US-11 the role is now `CC_EXPIRED`; see note below).
- ✓ `ExpireCcPayloadSchema` at `src/main/schemas.ts:254` validating `positionId: PositionIdSchema` + `expirationDateOverride?`.
- ✓ Renderer adapter `expireCc` at `src/renderer/src/api/positions.ts:451`; error path via `throwMappedIpcErrors` (`positions.ts:457`).
- ✓ `useExpireCoveredCall` invalidates `positionQueryKeys.all` (`src/renderer/src/hooks/useExpireCoveredCall.ts:14`).
- ✓ Preload bridge `expireCc` at `src/preload/index.ts:27` → `positions:expire-cc`; declared in `src/preload/index.d.ts:430`.
- ✓ `computeDte` referenced for the DTE-guarded button — exists in `src/renderer/src/lib/format.ts` (confirmed via US-11 audit).

## Drift (0)

None. (See Unverifiable for a downstream-evolution note.)

## Unverifiable (1)

- ? Page states the expire leg is written with `leg_role = 'EXPIRE'` (Summary, AC1, architecture decision). As of US-11 the service now persists `leg_role = 'CC_EXPIRED'` (`src/main/services/expire-cc-position.ts:51,84`). This is intended forward-evolution documented in `us-11-leg-history.md`, not drift in US-9's own scope, but the US-9 page's `'EXPIRE'` role text is now stale relative to current code. Flag for human review — likely fine to leave as the US-9-era record.

## Missing files (0)

- ✓ `../domain/wheel-lifecycle.md`, `../domain/cost-basis.md`, `../contracts/ipc-handlers.md`, `../schema/tables.md`, and `./us-7-open-covered-call.md` / `./us-5-expire-csp.md` all resolve.
