# US-16: Cost basis through sequential rolls and post-roll assignment

<!-- generated:from us-16 -->
## Summary

Fixes the cost-basis math for two scenarios that previously produced materially wrong numbers: a CSP roll that changes strike (e.g., roll-down from $50 to $47) and an assignment that follows one or more rolls. The pure cost-basis engine now branches on `legType` and applies a strike-delta term for CSP rolls; the assignment service groups roll-pair legs by `roll_chain_id`, computes a net credit/debit per chain, and feeds those as synthetic `ROLL_NET` entries into the assignment basis calculation so the gross `ROLL_TO` premium is no longer double-counted. CC rolls remain `prevBasis − netCredit` regardless of strike. No IPC, schema, or renderer changes — purely engine and service-layer corrections covered by unit, integration, and E2E tests.

## Acceptance criteria

- AC1 — Cost basis after a single CSP roll with a net credit shows basis $47.30 and total premium $270.
- AC2 — Cost basis after a single CSP roll with a net debit shows basis $48.50 and total premium $150.
- AC3 — Cost basis after three sequential CSP rolls shows final basis $46.70 and total premium $330.
- AC4 — After CSP rolls followed by assignment, the assignment basis is $47.30 and the premium waterfall reads "CSP Open: $2.00, Roll #1 credit: $0.70".
- AC5 — Cost basis after a CC roll with a net credit shows basis $45.00.
- AC6 — The cost-basis snapshot chain is complete and auditable: six snapshots in chronological order, each carrying `basis_per_share` and `total_premium_collected`.
- AC7 — Multi-contract rolls apply net credit/debit per contract correctly: same per-share basis regardless of contract count.
- AC8 — A CSP roll-down to a lower strike yields basis $44.70, not $47.70 (the bug being fixed).
- AC9 — A CC roll-up to a higher strike does not change basis (strike direction has no effect on CC roll basis).

## What was built

`calculateRollBasis` in `src/main/core/costbasis.ts` now accepts `legType: 'CSP' | 'CC'` plus optional `prevStrike` / `newStrike` and branches on them. For `legType === 'CC'` (or `CSP` with `prevStrike === newStrike`) it applies the existing formula `basisPerShare = prevBasisPerShare − netCredit` where `netCredit = newPremium − costToClose`. For `legType === 'CSP'` with `newStrike ≠ prevStrike` it applies `basisPerShare = prevBasisPerShare + (newStrike − prevStrike) − netCredit`. The strike-delta term reflects the immediate change in the share-cost obligation (rolling down reduces basis, rolling up increases it) rather than deferring that adjustment to assignment time. Service callers `roll-csp-position.ts` and `roll-cc-position.ts` pass the new fields; the input type addition is intentionally breaking so callers must opt in.

`assignCspPosition` no longer feeds gross `ROLL_TO` legs into `calculateAssignmentBasis`. A private helper `groupRollsByChain` in `src/main/services/assign-csp-position.ts` groups legs by `roll_chain_id` (ordered by `fill_date`), computes `netPremium = ROLL_TO.premium − ROLL_FROM.premium` per chain, and emits one synthetic `{ legRole: 'ROLL_NET', premiumPerContract, contracts, label: 'Roll #N credit' | 'Roll #N debit' }` per chain. Those synthetic legs are passed to the engine alongside the original `CSP_OPEN` leg. The engine remains pure and roll-agnostic; it stays unaware of chains and indices.

`AssignmentBasisLeg` gains an optional `label?: string`. `calculateAssignmentBasis` uses `leg.label ?? LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole` when building waterfall lines, so the service controls the display text for roll-net entries while the engine still performs the math. The waterfall format is one line per roll (`"Roll #N credit: $0.70"` or `"Roll #N debit: $0.30"`) rather than separate gross `ROLL_FROM` / `ROLL_TO` lines.

`ROLL_NET` is a synthetic in-memory shape only; it is not stored in `legs` and is not a new `leg_role` enum value. No migration is needed and existing `cost_basis_snapshots` rows are reused untouched.

## Architecture decisions

- CSP different-strike roll formula includes the strike delta: `newBasis = prevBasis + (newStrike − prevStrike) − netCredit`. Deferring the adjustment to assignment time would leave intermediate snapshots inaccurate (the AC8 bug). → [../domain/cost-basis.md](../domain/cost-basis.md)
- CC rolls always use `newBasis = prevBasis − netCredit` regardless of strike direction. CC strike changes do not affect share cost basis — shares are already held and their cost was set at assignment. → [../domain/cost-basis.md](../domain/cost-basis.md)
- Net credit per roll chain is computed in the service layer, not the engine. The engine has no `roll_chain_id` grouping concept; pushing grouping into a pure function would leak storage layout into the engine. → [../domain/cost-basis.md](../domain/cost-basis.md)
- Premium waterfall renders one net line per roll (`"Roll #N credit: $X"` / `"Roll #N debit: $X"`), not two gross `ROLL_FROM`/`ROLL_TO` lines — matches the AC and the mockup.
- `AssignmentBasisLeg.label?` is an optional display override so the engine stays free of string-formatting policy while letting the service supply roll-indexed labels.
- `calculateRollBasis` is extended in place rather than split into `calculateCspRollBasis` / `calculateCcRollBasis`; the shared net-credit math is identical and duplication would have been worse than a branch on `legType`.
- `groupRollsByChain` is co-located as a private helper in `assign-csp-position.ts` until a second service needs it; no premature abstraction.
- No IPC, Zod schema, SQL migration, or renderer changes — display layer was already shipped under US-15.

## Contracts touched

- `RollBasisInput` (engine) — extended with required `legType: 'CSP' | 'CC'` and optional `prevStrike` / `newStrike` (required when `legType === 'CSP'`, ignored for `'CC'`). When CSP strikes match, the simple formula is used; when they differ, the strike-delta formula. → [../domain/cost-basis.md](../domain/cost-basis.md)
- `AssignmentBasisLeg` (engine) — added optional `label?: string`; the waterfall generator prefers `leg.label` over the legRole lookup. → [../domain/cost-basis.md](../domain/cost-basis.md)
- `ROLL_NET` synthetic premium leg — service-produced, never persisted: `{ legRole: 'ROLL_NET', premiumPerContract, contracts, label: 'Roll #N credit' | 'Roll #N debit' }`. Premium can be negative for debits. → [../domain/cost-basis.md](../domain/cost-basis.md)
- No IPC handler, Zod schema, or migration changes.

## Source files

- `src/main/core/costbasis.ts`
- `src/main/services/roll-csp-position.ts`
- `src/main/services/roll-cc-position.ts`
- `src/main/services/assign-csp-position.ts`
- `src/main/services/cost-basis-chain.test.ts`
- `e2e/cost-basis-sequential-rolls.spec.ts`
<!-- /generated -->

## Related features

- [US-12 — Roll an open CSP out](./us-12-roll-csp.md) — produces the `ROLL_FROM`/`ROLL_TO` legs and snapshots this story corrects the math for.
- [US-14 — Roll a covered call](./us-14-roll-cc.md) — sibling roll flow; confirms strike direction has no basis effect for CC rolls (AC9).
- [US-6 — Record assignment](./us-6-record-assignment.md) — `assignCspPosition` is the consumer where post-roll assignment basis is corrected.

<!-- Hand-written notes below this line are preserved across regeneration. -->
