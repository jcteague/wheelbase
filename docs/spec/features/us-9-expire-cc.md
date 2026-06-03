# US-9: Record CC expiring worthless

<!-- generated:from us-9 -->

## Summary

Adds the covered-call expiration-worthless path to the wheel lifecycle. On or after the option's expiration date a trader with a `CC_OPEN` position clicks "Record Expiration →" in the detail header, confirms in a right-side `CcExpirationSheet`, and the wheel transitions back to `HOLDING_SHARES` — the position stays `ACTIVE`, `closed_date` remains `NULL`, and the wheel continues. The expire leg is written with `action = 'EXPIRE'`, `instrument_type = 'CALL'`, `premium_per_contract = '0.0000'`, `fill_price = NULL`, and `fill_date` set to the CC's expiration date (not "today"). **Critically, no new `cost_basis_snapshots` row is written**: the CC premium was already captured into the snapshot when the CC was opened in [US-7](./us-7-open-covered-call.md), so expiration is not a financial event. The success state surfaces a "+$X.XX premium captured (100%)" hero, a "Still Holding: N shares" badge, a 1–3 day strategic-patience nudge, and a "Sell New Covered Call on {ticker} →" CTA that simply closes the sheet — once the query cache invalidates and the position refetches as `HOLDING_SHARES`, the existing US-7 entry-point button reappears in the detail header.

> **Refactor status: pending.** `plans/us-9/` has no `refactor-phase-results.md` at extraction time, so post-refactor decisions (helper extraction, file splits, naming consolidation across `expireCsp`/`expireCc`) are not yet captured here. `/update-spec us-9` will incorporate them when the Refactor pass lands.

## Acceptance criteria

- Recording expiration on or after the CC's expiration date transitions the position from `CC_OPEN → HOLDING_SHARES`; `status` stays `ACTIVE`, `closed_date` stays `NULL`, and an EXPIRE/CALL leg is written with `premium_per_contract = '0.0000'`, `fill_price = NULL`, and `fill_date = the CC's expiration date`.
- The success state shows "+$X.XX premium captured (100%)" where `$X.XX = premiumPerContract × contracts × 100`, a "Still Holding: N shares of {ticker}" badge, and a "Sell New Covered Call on {ticker} →" CTA.
- Recording expiration before the expiration date is rejected with the exact message `"Cannot record expiration before the expiration date (YYYY-MM-DD)"` (literal `expirationDate` interpolated); the boundary `referenceDate === expirationDate` is allowed.
- Recording expiration when the position is not in `CC_OPEN` is rejected with the exact message `"No open covered call on this position"`.
- The success state includes the strategic nudge "💡 Many traders wait 1–3 days before selling the next covered call — avoid chasing premium right at expiration." displayed above the sell-next-CC CTA.
- The "Record Expiration →" entry-point button appears in the position detail header only when `phase === 'CC_OPEN'` and `computeDte(activeLeg.expiration) <= 0` — the frontend hides the button before expiration day so the backend's `too_early` rejection is effectively unreachable via the UI.

## What was built

The pure lifecycle engine gains `expireCc(input)`: it validates `currentPhase === 'CC_OPEN'` (else `__phase__/invalid_phase/"No open covered call on this position"`) and `referenceDate >= expirationDate` (else `expiration/too_early/"Cannot record expiration before the expiration date (${expirationDate})"`), then returns `{ phase: 'HOLDING_SHARES' }`. The function is structurally separate from `expireCsp` because the post-transition phase differs (`HOLDING_SHARES`, not `WHEEL_COMPLETE`) and the wrong-phase message text is different. The boundary `referenceDate === expirationDate` passes; one day earlier throws.

`expireCcPosition` orchestrates the write inside one SQLite transaction. It loads context via `getPosition`, copies `strike`/`expiration`/`contracts` from the active `CC_OPEN` leg, calls `expireCc()`, then inserts the EXPIRE/CALL leg (`leg_role = 'EXPIRE'`, `action = 'EXPIRE'`, `instrument_type = 'CALL'`, `premium_per_contract = '0.0000'`, `fill_price = NULL`, `fill_date = recordedDate`) and updates the position row (`phase = HOLDING_SHARES`; `status` and `closed_date` unchanged). The service explicitly guards against a missing CC_OPEN leg with `no_active_leg`/`__root__` even though the phase guard normally precludes that state — defensive against corrupt fixtures or partial transactions. The service-layer date contract: `referenceDate = payload.expirationDateOverride ?? today` and `recordedDate = payload.expirationDateOverride ?? openLeg.expiration`, resolved separately so each defaults to its own natural value. The IPC result includes `sharesHeld = assignLeg.contracts × 100`, computed server-side because the renderer would otherwise have to re-query the position; `basisPerShare` (a money value) cannot stand in for a share count.

**No `cost_basis_snapshots` row is written, updated, or deleted on CC expiry** — the snapshot from CC-open already captures the premium credit and remains the latest source of truth for `basisPerShare` and `totalPremiumCollected`. The IPC result still returns the existing snapshot under `costBasisSnapshot` so the renderer can render unchanged-basis figures without a second round trip.

The IPC handler `positions:expire-cc` is registered with the shared `handleIpcCall('positions_expire_cc_unhandled_error', ...)` wrapper using `ExpireCcPayloadSchema` and returns `{ ok: true, position, leg, costBasisSnapshot, sharesHeld }`. Error envelopes follow the established convention: `__phase__` for phase mismatch, `expiration` for the date-too-early check, `__root__` for not-found / no-active-leg / internal.

On the renderer, the `expireCc` API adapter maps snake_case (`position_id`, `expiration_date_override`) to camelCase IPC fields and throws `ApiError` with `status: 400` and `body.detail = mapIpcErrors(errors)` on `{ ok: false }`, mirroring `expirePosition` (CSP). `useExpireCoveredCall` wraps it in a TanStack Query mutation that invalidates `positionQueryKeys.all` and forwards an optional `onSuccess` callback (used by the sheet to transition to its success state). `CcExpirationSheet` is a right-side 400 px sheet rendered via `createPortal` into `document.body`, following the `ExpirationSheet.tsx` pattern. It owns a single boolean `successState` and renders entirely from props (`positionId`, `ticker`, `strike`, `expiration`, `expirationDisplay`, `contracts`, `premiumPerContract`, `sharesHeld`, `onClose`). The success hero composes a "Premium Captured" caption in green small caps, a large "+$${totalPremium}" amount (where `totalPremium = (parseFloat(premiumPerContract) * contracts * 100).toFixed(0)`), a "100% premium captured · {contracts} contract" sub-line, and an inline "Still Holding" sky-blue badge. The 1–3 day nudge uses `AlertBox variant="info"`. The "Sell New Covered Call on {ticker} →" CTA simply calls `onClose()` — after cache invalidation the position refetches as `HOLDING_SHARES` and the existing US-7 "Open Covered Call →" entry-point button reappears, so no explicit navigation is needed.

`PositionDetailPage` adds `ccExpCtx` state, derives `ccExpired = phase === 'CC_OPEN' && computeDte(activeLeg.expiration) <= 0`, looks up `assignLeg = legs.find(l => l.legRole === 'ASSIGN')` and passes `sharesHeld = assignLeg?.contracts ? assignLeg.contracts * 100 : 0` to the sheet (mirroring the server-side computation). `ccExpCtx` joins `expirationCtx`, `assignmentCtx`, and `openCcCtx` in the page's blur condition so the page dims while the sheet is open. `PositionDetailActions` gains `onRecordCcExpiration` and `ccExpired` props; the "Record Expiration →" button renders only when `phase === 'CC_OPEN' && ccExpired`.

## Architecture decisions

- A dedicated `expireCc()` lifecycle function returns `{ phase: 'HOLDING_SHARES' }` rather than reusing `expireCsp()` with a flag — CC expiry keeps the wheel alive; CSP expiry ends it at `WHEEL_COMPLETE`. Single-purpose core engine functions are preferred over branching → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- No `cost_basis_snapshots` row is written on CC expiry. The CC premium was incorporated into the snapshot created by `openCoveredCallPosition()` in [US-7](./us-7-open-covered-call.md); the EXPIRE leg only records that the contract expired. Writing a duplicate snapshot for audit trail was rejected as redundant → [../domain/cost-basis.md](../domain/cost-basis.md)
- Error messages are exact per AC — wrong-phase emits `"No open covered call on this position"` (not the generic `expireCsp` "invalid phase" copy); too-early emits `"Cannot record expiration before the expiration date (YYYY-MM-DD)"` with the literal expiration date interpolated. The date-in-message pattern requires `expireCc()` to receive `expirationDate` as an interpolable string, not just a comparison value → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- No DB migration is required. `LegRole = 'EXPIRE'`, `LegAction = 'EXPIRE'`, `InstrumentType = 'CALL'`, and `WheelPhase = 'HOLDING_SHARES'` are already in `src/main/core/types.ts` enums — US-9 is purely a new combination of existing values → [../schema/tables.md](../schema/tables.md)
- IPC channel naming follows the `positions:{verb}-{noun}` convention used by `positions:expire-csp` and `positions:open-cc`: `positions:expire-cc` (channel), `expireCc` (preload method). `positions:expire-covered-call` was rejected as too verbose given the existing abbreviation convention → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- The "Record Expiration →" button is frontend-guarded by DTE: visible only when `phase === 'CC_OPEN' && computeDte(activeLeg.expiration) <= 0`. The frontend gate provides better UX than relying solely on backend rejection; `computeDte` already exists in `src/renderer/src/lib/format.ts` so no new helper is needed.
- The sell-next-CC CTA closes the sheet rather than navigating explicitly. The user is already on the position detail page; after TanStack Query invalidates `positionQueryKeys.all`, the position refetches as `HOLDING_SHARES` and the existing US-7 entry-point button surfaces naturally. Explicit `navigate('#/positions/${positionId}')` was rejected as redundant.
- `sharesHeld` is computed server-side and returned in the IPC result (`assignLeg.contracts × 100`) instead of being re-derived on the renderer. The service already loads the position detail (including all legs) for validation, so the computation is zero-cost and avoids a second round trip. `basisPerShare` cannot stand in: it is a money value, not a share count.
- `ExpireCcPayloadSchema.expirationDateOverride` plays double duty — it is both `referenceDate` (the "today" used by the date guard) and `recordedDate` (the `fill_date` written onto the leg) when present, resolved separately so each defaults to its own natural value (today / the open leg's `expiration`). Same dual-use pattern as `ExpireCspPayloadSchema.expirationDateOverride`, primarily used to bypass system-clock dependency in tests.
- The CC expire leg shape: `leg_role = 'EXPIRE'`, `action = 'EXPIRE'`, `instrument_type = 'CALL'`, `premium_per_contract = '0.0000'` ("expired worthless"), `fill_price = NULL` ("no fill ever occurred"), `fill_date = the CC's expiration date` (not "today") regardless of when the user records the expiration. Matches the [US-5](./us-5-expire-csp.md) expire-leg conventions → [../schema/tables.md](../schema/tables.md)
- The renderer adapter is snake_case at the boundary and mirrors the `expirePosition` (CSP) error-mapping pattern; on `{ ok: false }` it throws `ApiError` with `status: 400` and `body.detail = mapIpcErrors(errors)` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- The service defensively guards against a missing CC_OPEN leg (`no_active_leg`/`__root__`) even though the phase guard would normally preclude this — protection against corrupt fixtures and partial transactions.
- No isolated unit tests for the preload bridge or the `useExpireCoveredCall` hook; coverage comes from IPC handler tests + component tests + e2e, mirroring the US-7 strategy.
- E2E (`e2e/cc-expiration.spec.ts`) covers 5 scenarios mapped 1:1 to ACs. AC 3 ("reject before expiration") is asserted via UI absence — with `DTE > 0` the "Record Expiration →" button is not rendered, so the rejection manifests as the button being unreachable; the backend rejection is exercised separately via a direct IPC call against a `HOLDING_SHARES` position.
- The worktree caveat (recorded for future implementers): `worktree-us-9` was created from `origin/main` at commit `47f5412`, which predates local main's US-7 commit `9fb1928`. Implementation must rebase or merge local main first so that `openCoveredCall` is available in `lifecycle.ts`, the `CC_OPEN` leg query exists in `get-position.ts`, and the `openCoveredCall` service is present.

## Contracts touched

- `positions:expire-cc` — IPC handler returning `{ position, leg, costBasisSnapshot, sharesHeld }`; `costBasisSnapshot` is the unchanged CC-open snapshot, not a new row → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `ExpireCcPayloadSchema` — Zod schema validating `{ positionId: uuid, expirationDateOverride?: string }` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `ExpireCcInput` / `ExpireCcResult` — pure lifecycle engine function signature (`currentPhase`, `expirationDate`, `referenceDate` → `{ phase: 'HOLDING_SHARES' }`); known errors `__phase__/invalid_phase/"No open covered call on this position"` and `expiration/too_early/"Cannot record expiration before the expiration date (${expirationDate})"` → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `ExpireCcPositionResult` — service / IPC return shape (`position`, `leg`, `costBasisSnapshot`, `sharesHeld`) → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Preload binding `window.api.expireCc(payload)` declared in `src/preload/index.d.ts` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Renderer adapter `expireCc` with `ExpireCcPayload` / `ExpireCcResponse` and snake_case → camelCase mapping; error-mapping pattern mirrors `expirePosition` (CSP) → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `useExpireCoveredCall` — TanStack Query mutation hook invalidating `positionQueryKeys.all` on success and forwarding an optional `onSuccess` callback.
- `CcExpirationSheetProps` — renderer component contract: `{ open, positionId, ticker, strike, expiration, expirationDisplay, contracts, premiumPerContract, sharesHeld, onClose }`.
- Known IPC error codes for `positions:expire-cc`: `__root__/not_found`, `__phase__/invalid_phase`, `__root__/no_active_leg`, `expiration/too_early`, `__root__/internal_error`, plus Zod field-level codes for payload validation → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)

## Source files

- `src/main/core/lifecycle.ts`
- `src/main/core/lifecycle.test.ts`
- `src/main/schemas.ts`
- `src/main/schemas.test.ts`
- `src/main/services/expire-cc-position.ts`
- `src/main/services/expire-cc-position.test.ts`
- `src/main/services/positions.ts`
- `src/main/ipc/positions.ts`
- `src/main/ipc/positions.test.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/api/positions.ts`
- `src/renderer/src/api/positions.test.ts`
- `src/renderer/src/hooks/useExpireCoveredCall.ts`
- `src/renderer/src/components/CcExpirationSheet.tsx`
- `src/renderer/src/components/CcExpirationSheet.test.tsx`
- `src/renderer/src/components/PositionDetailActions.tsx`
- `src/renderer/src/pages/PositionDetailPage.tsx`
- `src/renderer/src/pages/PositionDetailPage.test.tsx`
- `e2e/cc-expiration.spec.ts`
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
