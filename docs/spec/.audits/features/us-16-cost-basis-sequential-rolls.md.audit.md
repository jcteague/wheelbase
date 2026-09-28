---
page: docs/spec/features/us-16-cost-basis-sequential-rolls.md
audited_at: 2026-09-28
findings: 3
---

# Audit: docs/spec/features/us-16-cost-basis-sequential-rolls.md

## Verified (14)

- ✓ All cited source files exist: `src/main/core/costbasis.ts`, `src/main/services/{roll-csp-position,roll-cc-position,assign-csp-position}.ts`, `src/main/services/cost-basis-chain.test.ts`, `e2e/cost-basis-sequential-rolls.spec.ts`
- ✓ `RollBasisInput.legType: 'CSP' | 'CC'`, optional `prevStrike` / `newStrike` — `src/main/core/costbasis.ts:217-225`
- ✓ `calculateRollBasis` throws when CSP roll lacks strikes — `costbasis.ts:236-241`
- ✓ CSP different-strike formula `prev + (newStrike − prevStrike) − net`; same-strike `prev − net` — `costbasis.ts:259-262`
- ✓ `netCredit = newPremium − costToClose` — `costbasis.ts:247`
- ✓ `calculateRollBasis` extended in place (no `calculateCspRollBasis` / `calculateCcRollBasis`) — only one export at `costbasis.ts:235`
- ✓ `roll-csp-position.ts:56-58` passes `legType: 'CSP'`, `prevStrike`, `newStrike`; `roll-cc-position.ts:64` passes `legType: 'CC'`
- ✓ `AssignmentBasisLeg.label?: string` — `costbasis.ts:85-89`; waterfall uses `leg.label ?? LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole` — `costbasis.ts:130`
- ✓ Private `groupRollsByChain` in `assign-csp-position.ts:16`, used at `:71`
- ✓ Synthetic `legRole: 'ROLL_NET'` with `label: 'Roll #N credit|debit'` — `assign-csp-position.ts:84-87`
- ✓ `ROLL_NET` is not persisted / not a migration enum — no occurrence in `migrations/`
- ✓ e2e covers AC1–AC9 by name — `e2e/cost-basis-sequential-rolls.spec.ts:177,213,245,293,328,437,550,584` (+ AC6 at `:372`)
- ✓ Related pages exist: `us-12-roll-csp.md`, `us-14-roll-cc.md`, `us-6-record-assignment.md`, `domain/cost-basis.md`
- ✓ No IPC / schema changes claimed — consistent

## Drift (1)

- ✗ Page states CC rolls "always use `newBasis = prevBasis − netCredit`" and describes `RollBasisInput` as only adding `legType`/`prevStrike`/`newStrike`. Current code adds `positionContracts?: number` (`src/main/core/costbasis.ts:226-227`), required for CC rolls (throws at `:243-245`), and the CC branch prorates across all held shares: `prev − (net × rolledShares) / sharesFromContracts(positionContracts)` (`costbasis.ts:253-257`). `roll-cc-position.ts:65` passes `positionContracts: assignLeg.contracts`. Equals the documented formula only when rolled contracts = held contracts. Suggested fix: document `positionContracts` and the proration in the Contracts/What-was-built sections (likely a later story's change).

## Unverifiable (2)

- ? AC dollar figures ($47.30, $48.50, $46.70, $44.70, $45.00) — exercised by e2e/unit tests; not recomputed here.
- ? "The engine remains pure and roll-agnostic" — narrative; `costbasis.ts` has no chain concept by grep, but purity is not mechanically proven.

## Missing files (0)

None.
