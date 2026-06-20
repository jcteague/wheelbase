# US-13: Roll a CSP down (and/or out)

<!-- generated:from us-13 -->

> **Status: plan-only — not yet implemented.** The `plans/us-13/` directory contains `plan.md`, `research.md`, `data-model.md`, `contracts/positions-roll-csp.md`, and `quickstart.md`, but **no `tasks.md` and no `refactor-phase-results.md`**. Everything below records design intent only; none of it has been verified against the running code. Re-run `/update-spec us-13` once the implementation artifacts land.

## Summary

Extends the US-12 CSP roll form ([us-12-roll-csp.md](./us-12-roll-csp.md)) to support **strike changes** at the same expiration — turning a "roll out" into the full 5-way taxonomy of Roll Out, Roll Down & Out, Roll Up & Out, Roll Down, and Roll Up. The lifecycle engine's strict `newExpiration > currentExpiration` rule is relaxed to allow same-expiration strike-only rolls, while still rejecting no-change rolls and earlier-expiration rolls. A new `rollCount` field on the `positions:get` response drives a "Roll #N" badge and a soft 3+ advisory warning in the form. No IPC payload changes, no schema migrations.

## Acceptance criteria

- The roll form makes the strike field editable (pre-filled with the current strike) and displays the current roll count (e.g. "Roll #2") alongside the existing US-12 inputs.
- Net credit preview (green) renders for a roll-down-and-out with net credit, labelled e.g. "Roll Down & Out: $180 → $175 strike, Apr → May expiration".
- Net debit preview (amber/gold) renders with the updated warning copy: "This roll produces a net debit, which increases your cost basis".
- Confirming a roll-down-and-out writes a `ROLL_FROM` (BUY at current strike) and `ROLL_TO` (SELL at new strike) sharing a `roll_chain_id`, keeps the position in `CSP_OPEN`, appends a cost-basis snapshot for the net, **and the position card and detail page display the new strike as the active strike**.
- Roll to a higher strike is accepted with label "Roll Up & Out" (when expiration also changes) or "Roll Up" (when only the strike changes).
- Roll with both strike and expiration unchanged is rejected at field `__root__` with code `no_change` and message "Roll must change the expiration, strike, or both".
- Roll with `newExpiration < currentExpiration` is rejected at field `newExpiration` with code `must_not_be_earlier` and message "New expiration must be after the current expiration".
- When `rollCount >= 3`, the form shows the badge in red and an amber `AlertBox`: "This position has been rolled multiple times — consider whether the capital is better deployed elsewhere." Submission is **not** blocked.
- The roll-type label is derived from a shared 4-arg helper covering all 5 outcomes (Roll Out, Roll Down & Out, Roll Up & Out, Roll Down, Roll Up).

## What is planned

The pure lifecycle engine's `rollCsp(input)` gains `currentStrike: string` and `newStrike: string` on `RollCspInput` and replaces the US-12 unconditional `newExpiration > currentExpiration` check with a two-part rule: reject when **both** strike and expiration are unchanged (code `no_change` at `__root__`), and reject when `newExpiration < currentExpiration` (code `must_not_be_earlier` at `newExpiration`). A new positive-strike check (`requirePositiveDecimal`) is added for `newStrike`. Phase, cost-to-close, and new-premium validations are unchanged; the function still returns `{ phase: 'CSP_OPEN' }`.

The `rollCspPosition` service wires the strike pair through to the engine — `currentStrike: activeLeg.strike` and `newStrike: formattedNewStrike` (the existing US-12 service already defaults `newStrike` to the current strike when omitted from the payload). The transactional write itself (linked `ROLL_FROM`/`ROLL_TO` pair, shared `roll_chain_id`, fresh cost-basis snapshot) is unchanged.

`get-position.ts` adds `rollCount: number` to its result, computed as `COUNT(*) FROM legs WHERE position_id = ? AND leg_role = 'ROLL_TO'`. The CSP_OPEN active-leg subquery is widened to include `ROLL_TO` so the most recent rolled leg drives the displayed strike/expiration. `list-positions.ts` receives the same active-leg widening (`leg_role IN ('CSP_OPEN', 'CC_OPEN', 'ROLL_TO')`) so the positions table also reflects the post-roll strike. No new IPC channels.

A new pure renderer module `src/renderer/src/lib/rollType.ts` exports a 4-arg `getRollTypeLabel(currentStrike, newStrike, currentExpiration, newExpiration)` returning one of five labels via the decision table:

| strike | expiration | label             |
| ------ | ---------- | ----------------- |
| same   | later      | Roll Out          |
| lower  | later      | Roll Down & Out   |
| higher | later      | Roll Up & Out     |
| lower  | same       | Roll Down         |
| higher | same       | Roll Up           |
| same   | same       | rejected upstream |
| any    | earlier    | rejected upstream |

This replaces the inline 3-arg helper used by `RollCspSheet` in US-12 and is shared with `RollCspSuccess`. `RollCspSheet` gains a `rollCount: number` prop driving a "Roll #{rollCount}" badge (gray `#8899aa` below 3, red `#f85149` at 3+) and the amber `AlertBox` at 3+. Client-side `validate()` mirrors the engine's two rules so obvious errors don't require a round-trip. The debit-warning copy passed to `NetCreditDebitPreview` is updated to the new cost-basis wording. `RollCspSuccess` adds a gold "Active strike: $X → $Y" row and an info `AlertBox` mentioning assignment at the new strike when the strikes differ.

## Open questions (resolvable at implementation time)

- **Overlap with US-12's already-shipped active-leg fix.** US-12's refactor (`us-12-roll-csp.md` and `docs/spec/.extracts/us-12.md`) already centralized active-leg resolution in `active-leg-sql.ts` and applied it to both `get-position.ts` and `list-positions.ts`, including `ROLL_TO` in the CSP_OPEN filter. US-13's plan §3 still lists this widening as work to do; `research.md` flags the conflict ("If US-12 fixes this before merge, this area becomes a no-op for US-13"). Confirm during Red phase whether any residual gap remains.
- **Error-code naming mismatch.** `plan.md` §1 references the existing US-12 wording (`must_be_after_current`-style) for the earlier-expiration error, while `contracts/positions-roll-csp.md` and the new tests use `must_not_be_earlier`. Reconcile to one code before writing the failing tests.
- **`string` vs `number` typing for `newStrike`.** `data-model.md` types `RollCspInput.currentStrike` and `newStrike` as `string` (consistent with 4-dp money TEXT storage), while `RollCspPayloadSchema` continues to declare `newStrike: z.number().positive().optional()` at the IPC boundary. The service must format the incoming number to a string before calling the engine — US-12's `formattedNewStrike` already does this and should keep working unchanged, but the boundary cross-typing should be documented in the engine's input type comment.

## Architecture decisions

- Strike-change validation lives in the **lifecycle engine** (`rollCsp`), not the service — keeps all roll-validity rules in one place per the architecture standards → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Same-expiration strike-only rolls are **allowed**: the US-12 rule `newExpiration > currentExpiration` is replaced with a split rejection for `no_change` (root) and `must_not_be_earlier` (newExpiration) → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Roll-type labelling is a **shared pure function** in `src/renderer/src/lib/rollType.ts`, consumed by both `RollCspSheet` and `RollCspSuccess`; replaces the 3-arg inline helper from US-12.
- Roll count is computed as `COUNT(*) WHERE leg_role = 'ROLL_TO'` and returned on the existing `positions:get` response — **no new IPC channel** → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- The 3+ roll-count warning is **soft / informational only** — it never blocks submission, per the story's "Out of Scope" list.
- Active-leg queries in `get-position.ts` and `list-positions.ts` must include `ROLL_TO` so the rendered strike/expiration reflect the latest rolled leg (see Open Questions for overlap with US-12) → [schema/tables.md](../schema/tables.md)
- Client-side `validate()` in `RollCspSheet` mirrors the engine's two-part rule (no-change → root error, earlier-expiration → field error); the engine remains the authority and re-checks on the main side.
- Net-debit copy updated from US-12's "This roll costs more to close than the new premium provides" to "This roll produces a net debit, which increases your cost basis" — names the consequence (cost basis), not just the fact → [domain/cost-basis.md](../domain/cost-basis.md)
- `RollCspPayloadSchema` is **unchanged** — `newStrike` was already declared as `z.number().positive().optional()` in US-12 and the service already defaults it to the current strike when omitted → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Phase stays `CSP_OPEN` across all 5 roll types; cost basis is appended (not mutated) via the same `calculateRollBasis(...)` US-12 inserts; on later assignment, the **rolled-to** strike is the assignment strike → [domain/cost-basis.md](../domain/cost-basis.md)
- No schema migrations; `legs` and `positions` shapes are untouched → [schema/tables.md](../schema/tables.md)

## Contracts touched

- `positions:roll-csp` — request payload and success response **unchanged** from US-12; new error cases added: `__root__` / `no_change` and `newExpiration` / `must_not_be_earlier`. US-12's `must_be_after_current` is superseded by the split. → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `positions:get` — response **widened** with `rollCount: number` on `GetPositionResult`. No new channel. → [../contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `rollCsp` lifecycle function — `RollCspInput` extended with `currentStrike: string` and `newStrike: string`; validations widened (positive strike, no-change root error, earlier-expiration field error) → [../domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- `rollCspPosition` service — passes `currentStrike: activeLeg.strike` and `newStrike: formattedNewStrike` into the engine; transactional write is otherwise unchanged.
- `getRollTypeLabel` — **new** 4-arg pure helper in `src/renderer/src/lib/rollType.ts` returning one of five labels; replaces the US-12 inline 3-arg version.
- `RollCspSheet` — new `rollCount: number` prop; renders the "Roll #N" badge and 3+ advisory `AlertBox`; client-side validation mirrors the engine.
- Renderer `GetPositionResponse` — extended with `rollCount: number` in `src/renderer/src/api/positions.ts`.

## Planned source files

(Paths reflect `plans/us-13/plan.md`; none have been verified against the working tree.)

- `src/main/core/lifecycle.ts` — extend `RollCspInput`, add positive-strike / no-change / earlier-expiration validations
- `src/main/core/lifecycle.test.ts` — new tests covering all five accepted labels, plus the two rejections
- `src/main/services/roll-csp-position.ts` — pass `currentStrike` / `newStrike` into the engine
- `src/main/services/roll-csp-position.test.ts` — roll-down-and-out, roll-down-same-expiration, no-change rejection, earlier-expiration rejection
- `src/main/services/get-position.ts` — add `rollCount`; CSP_OPEN active-leg filter includes `ROLL_TO`
- `src/main/services/get-position.test.ts` — `rollCount` 0 / 2; ROLL_TO becomes active leg
- `src/main/services/list-positions.ts` — active-leg filter widened to include `ROLL_TO`
- `src/main/services/list-positions.test.ts` — list shows ROLL_TO strike after roll with strike change
- `src/main/schemas.ts` — extend `GetPositionResult` with `rollCount: number`; `RollCspPayloadSchema` unchanged
- `src/renderer/src/lib/rollType.ts` — **new** module exporting 4-arg `getRollTypeLabel`
- `src/renderer/src/lib/rollType.test.ts` — **new** unit tests for all five labels
- `src/renderer/src/api/positions.ts` — extend `GetPositionResponse` with `rollCount`
- `src/renderer/src/components/RollCspSheet.tsx` — accept `rollCount`; render badge + 3+ warning; updated debit copy; success state highlights strike transition; mirror engine validation
- `src/renderer/src/components/RollCspSheet.test.tsx` — badge / warning / debit copy / dynamic label / success / validation tests
- `src/renderer/src/pages/PositionDetailContent.tsx` (or `usePositionDetailSheets.ts`) — pass `rollCount={positionData.rollCount}` into `RollCspSheet`
- `src/renderer/src/pages/PositionDetailContent.test.tsx` — integration test verifying `rollCount` is wired through
- `e2e/roll-csp-down-and-out.spec.ts` — **new** Playwright `_electron` E2E with one test per AC (9 tests)
- `mockups/us-12-13-roll-csp-form.mdx` — design source of truth for six form states

## Related

- Parent: [us-12-roll-csp.md](./us-12-roll-csp.md) — original roll-out form, lifecycle, and cost-basis machinery this story extends

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
