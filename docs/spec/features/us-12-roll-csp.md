# US-12: Roll an open CSP out

<!-- generated:from us-12,us-12-refactor -->
## Summary

Lets the trader roll an open cash-secured put to a later expiration (and optionally a different strike) while the position stays in `CSP_OPEN`. A right-side sheet hosts a React Hook Form + Zod form with a live, client-side net credit/debit preview; on submit the backend writes a linked `ROLL_FROM` / `ROLL_TO` leg pair sharing a `roll_chain_id`, appends a new cost-basis snapshot, and never mutates the position row. Active-leg resolution is phase-aware and centralized so rolled positions render the new strike/expiration everywhere.

## Acceptance criteria

- The roll form shows the current leg (strike, expiration, DTE, premium collected) and inputs for new expiration, cost to close per contract, and new premium per contract; strike is pre-filled with the current strike.
- The net credit/debit preview updates as the trader types: credits render in green; debits render in amber/gold with a warning that the roll costs more to close than the new premium provides.
- Confirming the roll writes a `ROLL_FROM` (BUY) and `ROLL_TO` (SELL) leg sharing a `roll_chain_id`, inserts a new cost-basis snapshot reflecting the net credit/debit, keeps the position in `CSP_OPEN`, and returns the trader to the position detail page.
- The form rejects a new expiration earlier than or equal to the current expiration with "New expiration must be after the current expiration".
- The form rejects non-positive cost to close or non-positive new premium with field-specific messages.

## What was built

The pure lifecycle engine gains `rollCsp(input)`: it validates phase is `CSP_OPEN`, new expiration is strictly later, and both money inputs are positive, then returns `{ phase: 'CSP_OPEN' }`. The cost-basis engine gains `calculateRollBasis(...)`, which computes `net = newPremium − costToClose` (positive = credit) and produces `basisPerShare = prevBasisPerShare − net` plus an updated `totalPremiumCollected`. Money math uses `decimal.js` with 4 dp rounding.

`rollCspPosition` orchestrates the write inside one SQLite transaction: it loads context via `getPosition`, calls the lifecycle and cost-basis engines, then inserts two linked legs (`ROLL_FROM` BUY at the current strike/expiration, `ROLL_TO` SELL at the new strike/expiration) sharing a generated `roll_chain_id`, plus a fresh `cost_basis_snapshots` row with `final_pnl = NULL`. The position row is untouched. The IPC handler `positions:roll-csp` is registered with `registerParsedPositionHandler` using `RollCspPayloadSchema` and returns `{ ok: true, position, rollFromLeg, rollToLeg, rollChainId, costBasisSnapshot }`.

Active-leg resolution is centralized in `src/main/services/active-leg-sql.ts`. Both `get-position.ts` and `list-positions.ts` use the same phase-aware subquery: `CSP_OPEN → CSP_OPEN | ROLL_TO`, `CC_OPEN → CC_OPEN | ROLL_TO`, ordered by `fill_date DESC, created_at DESC LIMIT 1`. This is what allows rolled positions to show the new strike/expiration in the list and detail views, and what makes a second roll read the previous `ROLL_TO` instead of a stale `CSP_OPEN`.

The renderer adapter `rollCsp` maps a snake_case payload to camelCase IPC fields (extending `IPC_TO_FORM_FIELD`) and surfaces validation errors via `apiError`. A `useRollCsp` hook wraps `usePositionMutation`. `RollCspSheet` is a 420px portal sheet matching the other right-side sheets; it owns a React Hook Form instance built from a `makeRollCspSchema(currentExpiration)` factory whose Zod refine enforces date ordering against the live current expiration. `RollCspForm` is purely presentational. Roll-domain helpers — `getRollTypeLabel` ("Roll Out" / "Roll Down & Out" / "Roll Up & Out"), `computeNetCreditDebit`, and `rollCreditDebitColors` — live in `src/renderer/src/lib/rolls.ts` and are shared between the form and the success card. The success hero keeps its richer linear-gradient treatment by design.

## Revisions

- **us-12** (original): shipped `rollCsp` lifecycle + `calculateRollBasis`, the `positions:roll-csp` handler/service writing a linked `ROLL_FROM`/`ROLL_TO` pair and snapshot, the 420px `RollCspSheet` with client-side net credit/debit preview, the success state with amber/gold debit treatment, and an active-leg query fix in `get-position.ts` to include `ROLL_TO` so second rolls and detail views worked.
- **us-12-refactor**: fixed a parallel bug in `list-positions.ts` (rolled positions showed null strike/expiration) by extracting the phase-aware active-leg subquery into a shared `active-leg-sql.ts` helper used by both queries, deduped roll helpers into `src/renderer/src/lib/rolls.ts`, and migrated `RollCspSheet` from hand-managed `useState` + imperative `validate()` to React Hook Form + Zod (matching `CloseCspForm`), closing NaN edge cases and aligning with project standards.

## Architecture decisions

- Phase stays `CSP_OPEN` after a roll; lifecycle engine rejects rolls from any other phase → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- New expiration must be strictly later than the current expiration; date regex `YYYY-MM-DD` enforced at the Zod boundary → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Cost basis after a roll: `basisPerShare = prevBasisPerShare − (newPremium − costToClose)`; credit reduces basis, debit increases it; a new snapshot row is appended with `final_pnl = NULL` and the opening snapshot is never mutated → [domain/cost-basis.md](../domain/cost-basis.md)
- `positions:roll-csp` registered via the shared `registerParsedPositionHandler` helper, returning the standard `{ ok, ... } | { ok: false, errors }` envelope; handler error label follows `positions_{verb}_{noun}_unhandled_error` → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Renderer adapter is snake_case at the boundary and maps to camelCase IPC fields via `IPC_TO_FORM_FIELD` → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Rolls are stored as a linked `ROLL_FROM` (BUY) + `ROLL_TO` (SELL) pair sharing a `roll_chain_id`; the position row is never updated; reuses the existing `roll_chain_id` column and `ROLL_FROM`/`ROLL_TO` enum values — no migration → [schema/tables.md](../schema/tables.md)
- Active-leg resolution is phase-aware (`CSP_OPEN → CSP_OPEN | ROLL_TO`, `CC_OPEN → CC_OPEN | ROLL_TO`) and centralized in `active-leg-sql.ts`, used by both `get-position` and `list-positions` → [schema/tables.md](../schema/tables.md)
- Net credit/debit preview is computed client-side (pure arithmetic) — no debounced IPC round-trip.
- Sheet uses the 420px `createPortal` pattern matching `ExpirationSheet`, `AssignmentSheet`, and `OpenCoveredCallSheet`.
- Forms use React Hook Form + Zod with a renderer-side string-input schema and parse-on-submit; date-ordering refine takes the current expiration via a `makeRollCspSchema(currentExpiration)` factory (mirroring `makeCloseCspSchema`).
- Roll-domain helpers (`getRollTypeLabel`, `computeNetCreditDebit`, `rollCreditDebitColors`) live in `src/renderer/src/lib/rolls.ts`; `RollCspForm` stays purely presentational and does not own the form instance.

## Contracts touched

- `positions:roll-csp` — IPC handler returning `{ position, rollFromLeg, rollToLeg, rollChainId, costBasisSnapshot }` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `RollCspPayloadSchema` — Zod schema for `{ positionId, costToClosePerContract, newPremiumPerContract, newExpiration, newStrike?, fillDate? }` with `YYYY-MM-DD` regex on `newExpiration` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `rollCsp` lifecycle function (`RollCspInput` / `RollCspResult`) → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `calculateRollBasis` cost-basis function (`RollBasisInput` / `RollBasisResult`) → [../domain/cost-basis.md](../domain/cost-basis.md)
- `activeLegSubquery()` — shared SQL helper resolving the current active leg by phase → [../schema/tables.md](../schema/tables.md)
- Renderer adapter `rollCsp` — snake_case payload, camelCase response, error mapping via `IPC_TO_FORM_FIELD` → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `useRollCsp` hook wrapping `usePositionMutation`.
- `getRollTypeLabel`, `computeNetCreditDebit`, `rollCreditDebitColors` — shared renderer helpers in `src/renderer/src/lib/rolls.ts`.

## Source files

- `src/main/core/lifecycle.ts`
- `src/main/core/costbasis.ts`
- `src/main/schemas.ts`
- `src/main/services/roll-csp-position.ts`
- `src/main/services/active-leg-sql.ts`
- `src/main/services/get-position.ts`
- `src/main/services/list-positions.ts`
- `src/main/ipc/positions.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/api/positions.ts`
- `src/renderer/src/hooks/useRollCsp.ts`
- `src/renderer/src/lib/rolls.ts`
- `src/renderer/src/components/RollCspSheet.tsx`
- `src/renderer/src/components/RollCspForm.tsx`
- `src/renderer/src/components/RollCspSuccess.tsx`
- `src/renderer/src/components/PositionDetailActions.tsx`
- `src/renderer/src/pages/PositionDetailPage.tsx`
- `e2e/csp-roll.spec.ts`
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
