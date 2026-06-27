---
page: docs/spec/features/us-14-roll-cc.md
audited_at: 2026-06-27
findings: 2
---

# Audit: docs/spec/features/us-14-roll-cc.md

## Verified (14)

- ✓ All 15 cited source files exist (Glob): `src/main/core/lifecycle.ts`,
  `src/main/schemas.ts`, `src/main/services/roll-cc-position.ts`,
  `src/main/ipc/positions.ts`, `src/preload/index.ts`,
  `src/renderer/src/api/positions.ts`, `src/renderer/src/lib/rolls.ts`,
  `src/renderer/src/hooks/useRollCc.ts`, `RollCcForm.tsx`, `RollCcSuccess.tsx`,
  `RollCcSheet.tsx`, `PositionDetailActions.tsx`, `usePositionDetailSheets.ts`,
  `PositionDetailPage.tsx`, `e2e/cc-roll.spec.ts`.
- ✓ `rollCc` lifecycle function exists with `RollCcInput` / `RollCcResult`
  (`src/main/core/lifecycle.ts:384-421`); phase-gated via `requireCcOpenPhase`,
  on-or-after rule `newExpiration < currentExpiration` → `must_be_on_or_after_current`
  (`:401-406`), positive-money guards (`:417-418`).
- ✓ `rollCcPosition` service exists (`src/main/services/roll-cc-position.ts:11`),
  writes `ROLL_FROM` BUY CALL (`:80`) and `ROLL_TO` SELL CALL (`:100`) sharing
  `roll_chain_id`.
- ✓ IPC `positions:roll-cc` registered via `registerParsedPositionHandler`
  with `RollCcPayloadSchema` (`src/main/ipc/positions.ts:13,29`).
- ✓ Error codes `not_found` and `no_active_leg` present in the service
  (`roll-cc-position.ts:24,29`); `invalid_phase`, `must_be_on_or_after_current`,
  `no_change`, `must_be_positive` present in lifecycle.
- ✓ `RollCcResult` interface has `phase: 'CC_OPEN'` (`schemas.ts:343-350`).
- ✓ Refactor extractions present: `RollPayloadBaseSchema` (`schemas.ts:302`),
  `RollResultBase` (`:311`), `RollCspPayloadSchema`/`RollCcPayloadSchema` both
  `= RollPayloadBaseSchema` (`:322,339`), `IsoDateRegex`/`IsoDateMessage` (`:18-19`).
- ✓ `getCcRollTypeLabel` (`rolls.ts:82`) returns the documented 6-value union
  `CcRollType` (`:67-73`); `getCcRollTypeColor` (`:95`) and `getCcRollTypeDetail`
  (`:123`) exist.
- ✓ Renderer adapter `rollCc` (`api/positions.ts:547`) and `useRollCc` hook
  wrapping `usePositionMutation` (`hooks/useRollCc.ts:5-9`) exist.
- ✓ `newStrike` optional / defaults server-side: `RollCcPayloadSchema` inherits
  the base schema; service defaults to active-leg strike.
- ✓ All `../` ADR and contract links resolve (standalone-service-per-operation,
  soft-client-side-warnings, renderer-snake-case-adapter, rolls-as-linked-leg-pairs,
  react-hook-form-zod, sheet-component-pattern, tanstack-query-mutation-hooks,
  ipc-handlers, zod-schemas, wheel-lifecycle, cost-basis all exist).
- ✓ `calculateRollBasis` reused (now `legType`-aware, see US-16); still drives CC roll basis.
- ✓ `CcRollType`, `getCcRollTypeColor` exported from `rolls.ts` as claimed.
- ✓ Phase stays `CC_OPEN`; rolls stored as linked leg pair, position row untouched.

## Drift (2)

- ✗ AC (line 18) and "Contracts touched" (line 48) describe the no-change
  rejection with code `no_change` and message **"Roll must change the expiration,
  strike, or both"**. The actual lifecycle code throws with message **"Roll must
  change at least one of strike or expiration"** (`src/main/core/lifecycle.ts:413`).
  Wording drift. Suggested fix: update the page to the actual message.
- ✗ The page implies the no-change error is at field `no_change` / unspecified
  field, but the actual `ValidationError` uses field **`__roll__`** with code
  `no_change` (`src/main/core/lifecycle.ts:411-412`). The page never names the
  field; for parity with US-13's `__root__` discussion it should state `__roll__`.
  Minor — flag for accuracy.

## Unverifiable (0)

## Missing files (0)

Summary: implementation matches the page well; two wording/field drifts on the
no-change rejection.
