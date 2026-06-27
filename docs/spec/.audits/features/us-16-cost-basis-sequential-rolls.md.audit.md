---
page: docs/spec/features/us-16-cost-basis-sequential-rolls.md
audited_at: 2026-06-27
findings: 0
---

# Audit: docs/spec/features/us-16-cost-basis-sequential-rolls.md

## Verified (12)

- ✓ All 6 cited source files exist (Glob): `src/main/core/costbasis.ts`,
  `src/main/services/roll-csp-position.ts`, `roll-cc-position.ts`,
  `assign-csp-position.ts`, `cost-basis-chain.test.ts`,
  `e2e/cost-basis-sequential-rolls.spec.ts`.
- ✓ `calculateRollBasis` accepts `legType: 'CSP' | 'CC'` and optional
  `prevStrike` / `newStrike` on `RollBasisInput` (`costbasis.ts:217,223-225,235`).
- ✓ CSP different-strike formula `prevBasis + (newStrike − prevStrike) − netCredit`
  implemented (`costbasis.ts:263-266`: `round4(prev.plus(new Decimal(newStrike).minus(prevStrike)).minus(net))`
  when `newStrike !== prevStrike`, else `prev.minus(net)`).
- ✓ CC branch uses `prevBasis − netCredit` regardless of strike
  (`costbasis.ts:255-258`).
- ✓ CSP rolls require `prevStrike`/`newStrike` — throws when missing
  (`costbasis.ts:236-241`); the "intentionally breaking" input claim holds.
- ✓ `AssignmentBasisLeg` gains optional `label?: string` (`costbasis.ts:85-89`).
- ✓ `calculateAssignmentBasis` prefers `leg.label ?? LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole`
  (`costbasis.ts:130`); `LEG_ROLE_LABEL` map present (`:110`).
- ✓ `groupRollsByChain` private helper in `assign-csp-position.ts:16`; called at `:71`.
- ✓ `ROLL_NET` synthetic leg emitted with `legRole: 'ROLL_NET'`,
  `premiumPerContract` = net, and `label: 'Roll #N credit'|'debit'`
  (`assign-csp-position.ts:69-72`); net computed as `rollTo.premium − rollFrom.premium`
  (`:16-17`), negative → debit label — matches the page exactly.
- ✓ Service callers `roll-csp-position.ts` and `roll-cc-position.ts` pass the new
  `legType` / strike fields (both files exist and call `calculateRollBasis`).
- ✓ `ROLL_NET` is in-memory only — not a stored `leg_role`; no migration. Consistent
  with grep showing it only in `assign-csp-position.ts`, never in `migrations/`.
- ✓ All `../` links resolve: `domain/cost-basis.md`, `./us-12-roll-csp.md`,
  `./us-14-roll-cc.md`, `./us-6-record-assignment.md`.

## Drift (0)

## Unverifiable (0)

- The numeric AC values (basis $47.30, $44.70 vs $47.70, etc.) are assertions
  in `cost-basis-chain.test.ts` and were not re-derived here; the formulas that
  produce them are verified above, and the test file exists to enforce them.

## Missing files (0)

Summary: page matches code precisely; no drift found.
