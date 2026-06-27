# US-14: Roll an open covered call

<!-- generated:from us-14 -->

## Summary

Lets the trader roll an open covered call to a different strike, a later (or equal) expiration, or both, while the position stays in `CC_OPEN`. A right-side sheet hosts a React Hook Form + Zod form with a live, client-side net credit/debit preview and an amber "below cost basis" warning when the new strike falls under the current basis per share. On submit the backend writes a linked `ROLL_FROM` (BUY CALL) / `ROLL_TO` (SELL CALL) leg pair sharing a `roll_chain_id`, appends a new cost-basis snapshot, and never mutates the position row. The CC roll is the mirror image of the CSP roll (US-12), reusing `calculateRollBasis()` and the active-leg helper unchanged.

## Acceptance criteria

- The roll form shows the current CC (strike, expiration, DTE, premium collected) and cost basis context when opened.
- Net credit preview renders for "Roll Up & Out" (e.g. `$185 → $190` strike, Apr → May expiration), showing per-contract and total credit.
- An amber, non-blocking warning appears when the new strike is below the current basis per share, quoting the loss per share; the confirm button stays enabled.
- A successful roll creates a linked `ROLL_FROM` (BUY CALL) and `ROLL_TO` (SELL CALL) leg pair sharing the same `roll_chain_id`; the success screen shows "CC Rolled Successfully", the phase remains `CC_OPEN`, and the cost-basis transition is shown.
- "Roll Out" (same strike, later expiration), "Roll Down & Out" (lower strike, later expiration), and "Roll Up" (same expiration, higher strike) are all accepted with their respective labels.
- A net debit preview shows when cost-to-close exceeds the new premium; the roll can still be confirmed.
- The form rejects a new expiration earlier than the current expiration with "New expiration must be on or after the current expiration (...)".
- The form rejects a roll where neither strike nor expiration changed at field `__roll__` with code `no_change` and message "Roll must change at least one of strike or expiration"; the confirm button is disabled in that state.
- The form rejects non-positive cost-to-close with "Cost to close must be greater than zero".

## What was built

The pure lifecycle engine gains `rollCc(input)`: it validates phase is `CC_OPEN`, that the new expiration is on or after the current one (note: `>=`, not `>` as in `rollCsp`), that the new strike and expiration are not both unchanged (the no-change guard), and that both money inputs are positive, then returns `{ phase: 'CC_OPEN' }`. Cost-basis math is delegated to `calculateRollBasis()` unchanged from US-12 — the instrument type doesn't affect the formula `basisPerShare = prevBasisPerShare − (newPremium − costToClose)`.

`rollCcPosition` orchestrates the write inside one SQLite transaction: it loads context via `getPosition`, calls the lifecycle and cost-basis engines, then inserts two linked legs (`ROLL_FROM` BUY CALL at the current strike/expiration, `ROLL_TO` SELL CALL at the new strike/expiration) sharing a generated `roll_chain_id`, plus a fresh `cost_basis_snapshots` row with `final_pnl = NULL`. `newStrike` defaults to the current active-leg strike when omitted. The position row is untouched. The IPC handler `positions:roll-cc` is registered with `registerParsedPositionHandler` using `RollCcPayloadSchema` and returns `{ ok: true, position, rollFromLeg, rollToLeg, rollChainId, costBasisSnapshot }`.

The renderer adapter `rollCc` maps a snake_case payload to camelCase IPC fields and surfaces validation errors via `apiError`. A `useRollCc` hook wraps `usePositionMutation`. `RollCcSheet` is the same 420px portal sheet pattern; it owns a React Hook Form instance built from a `makeRollCcSchema` factory whose Zod refines enforce the on-or-after date rule and the no-change guard against the live current strike/expiration. `RollCcForm` is purely presentational and computes the below-cost-basis warning client-side by comparing `newStrike < basisPerShare`. The roll-type label expands beyond the CSP set: `getCcRollTypeLabel()` in `src/renderer/src/lib/rolls.ts` returns `'Roll Up & Out' | 'Roll Down & Out' | 'Roll Up' | 'Roll Down' | 'Roll Out' | 'No Change'`, alongside a paired `getCcRollTypeColor()` returning CSS variable strings. The refactor phase consolidated `RollCspPayloadSchema` and `RollCcPayloadSchema` onto a shared `RollPayloadBaseSchema`, and `RollCspResult` / `RollCcResult` onto a `RollResultBase` interface that differs only in the phase literal; date validation moved to shared `IsoDateRegex` / `IsoDateMessage` constants. `rollCcOpen` is OR'd into the `overlayOpen` expression in `usePositionDetailSheets` so the page content blurs while the sheet is open.

## Architecture decisions

- Phase stays `CC_OPEN` after a roll; lifecycle engine rejects rolls from any other phase → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- New expiration must be **on or after** the current expiration (unlike the CSP roll, which requires strictly later) so "Roll Up" / "Roll Down" at the same expiration are accepted → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- A no-change guard rejects rolls where both strike and expiration are unchanged; enforced in the lifecycle engine as defense-in-depth even though the confirm button is disabled in that state → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Cost basis after a roll: reuses `calculateRollBasis()` unchanged — instrument type doesn't affect the formula `basisPerShare = prevBasisPerShare − (newPremium − costToClose)`; a new snapshot row is appended with `final_pnl = NULL` and prior snapshots are never mutated → [../domain/cost-basis.md](../domain/cost-basis.md)
- CSP-roll architecture is **replicated**, not generalized: separate `rollCc()` and `rollCcPosition()` mirror their CSP counterparts because lifecycle validations meaningfully differ (`>=` vs `>`, no-change guard, below-basis warning); the refactor phase later extracted `RollPayloadBaseSchema` and `RollResultBase` once the duplication was concrete and identical → [../architecture/02-adrs/standalone-service-per-operation.md](../architecture/02-adrs/standalone-service-per-operation.md)
- Below-cost-basis warning is **renderer-only and non-blocking** — experienced traders may intentionally sell a CC below basis for defensive reasons → [../architecture/02-adrs/soft-client-side-warnings.md](../architecture/02-adrs/soft-client-side-warnings.md)
- `positions:roll-cc` registered via the shared `registerParsedPositionHandler` helper, returning the standard `{ ok, ... } | { ok: false, errors }` envelope → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Renderer adapter is snake_case at the boundary and maps to camelCase IPC fields → [../architecture/02-adrs/renderer-snake-case-adapter.md](../architecture/02-adrs/renderer-snake-case-adapter.md)
- Rolls are stored as a linked `ROLL_FROM` (BUY CALL) + `ROLL_TO` (SELL CALL) pair sharing a `roll_chain_id`; the position row is never updated; no migration needed since the schema already supports CALL instrument type and `ROLL_FROM` / `ROLL_TO` leg roles → [../architecture/02-adrs/rolls-as-linked-leg-pairs.md](../architecture/02-adrs/rolls-as-linked-leg-pairs.md)
- `newStrike` is optional in `RollCcPayloadSchema` and defaults server-side to the current active-leg strike — consistent with `RollCspPayloadSchema`; the form pre-fills it so users always have a value, but programmatic callers can omit it when keeping the same strike.
- A dedicated `getCcRollTypeLabel()` (renamed from `getCcRollType()` during refactor) is added rather than overloading the existing CSP `getRollTypeLabel()` because CC rolls add same-expiration cases ("Roll Up" / "Roll Down" / "No Change") that don't arise in CSP rolls; signature stability for existing callers preserved.
- Form uses React Hook Form + Zod with parse-on-submit; the no-change guard and date-ordering refine take the current strike/expiration via the `makeRollCcSchema` factory → [../architecture/02-adrs/react-hook-form-zod.md](../architecture/02-adrs/react-hook-form-zod.md)
- Sheet uses the 420px `createPortal` pattern matching the CSP roll sheet and other detail sheets → [../architecture/02-adrs/sheet-component-pattern.md](../architecture/02-adrs/sheet-component-pattern.md)
- `useRollCc` is a one-liner over `usePositionMutation` with no dedicated test file; integration coverage comes from the sheet's tests → [../architecture/02-adrs/tanstack-query-mutation-hooks.md](../architecture/02-adrs/tanstack-query-mutation-hooks.md)

## Contracts touched

- `positions:roll-cc` — IPC handler returning `{ position, rollFromLeg, rollToLeg, rollChainId, costBasisSnapshot }`; error codes include `invalid_phase`, `must_be_on_or_after_current`, `no_change`, `must_be_positive`, `not_found`, `no_active_leg` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `RollCcPayloadSchema` — Zod schema for `{ positionId, costToClosePerContract, newPremiumPerContract, newExpiration, newStrike?, fillDate? }` with `YYYY-MM-DD` regex on `newExpiration`; post-refactor assigned from `RollPayloadBaseSchema` → [../contracts/zod-schemas.md](../contracts/zod-schemas.md)
- `RollCcResult` — TypeScript interface matching `RollResultBase` with `position.phase: 'CC_OPEN'` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `rollCc` lifecycle function (`RollCcInput` / `RollCcResult`) — phase-gated, on-or-after expiration, no-change guard, positive-money guards → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `calculateRollBasis` cost-basis function — reused unchanged from US-12 → [../domain/cost-basis.md](../domain/cost-basis.md)
- Renderer adapter `rollCc` — snake_case payload, camelCase response, error mapping via `IPC_TO_FORM_FIELD` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `useRollCc` hook wrapping `usePositionMutation`.
- `getCcRollTypeLabel`, `getCcRollTypeColor`, `CcRollType` — new renderer helpers in `src/renderer/src/lib/rolls.ts` alongside the existing CSP helpers.
- Shared `RollPayloadBaseSchema`, `RollResultBase`, `IsoDateRegex`, `IsoDateMessage` — extracted during refactor to dedupe CSP and CC roll schemas → [../contracts/zod-schemas.md](../contracts/zod-schemas.md)

## Source files

- `src/main/core/lifecycle.ts`
- `src/main/schemas.ts`
- `src/main/services/roll-cc-position.ts`
- `src/main/ipc/positions.ts`
- `src/preload/index.ts`
- `src/renderer/src/api/positions.ts`
- `src/renderer/src/lib/rolls.ts`
- `src/renderer/src/hooks/useRollCc.ts`
- `src/renderer/src/components/RollCcForm.tsx`
- `src/renderer/src/components/RollCcSuccess.tsx`
- `src/renderer/src/components/RollCcSheet.tsx`
- `src/renderer/src/components/PositionDetailActions.tsx`
- `src/renderer/src/pages/usePositionDetailSheets.ts`
- `src/renderer/src/pages/PositionDetailPage.tsx`
- `e2e/cc-roll.spec.ts`
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
