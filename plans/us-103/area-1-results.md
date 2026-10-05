# Area 1 results: PMCC leg roles and trigger events

## Files

- Modified: /Users/johnteague/my-stuff/wb-103/src/main/core/types.ts
- Modified: /Users/johnteague/my-stuff/wb-103/src/main/schemas.ts
- Modified: /Users/johnteague/my-stuff/wb-103/src/main/core/types.test.ts
- Created: /Users/johnteague/my-stuff/wb-103/src/main/schemas.pmcc.test.ts

## Public symbols added

- `LegRole` z.enum now also has `SHORT_CALL_CLOSE`, `SHORT_CALL_EXPIRED`, `LEAPS_CLOSE`, `SHORT_CALL_ASSIGNED` (types.ts)
- `type PmccLegRole` (the six PMCC roles, via Extract) (types.ts)
- `isPmccLegRole(role: LegRole): role is PmccLegRole`, backed by a module-private `ReadonlySet<LegRole>` (types.ts)
- `const PmccTriggerEvent = z.enum([PMCC_OPEN, PMCC_SHORT_OPEN, PMCC_SHORT_EXPIRED, PMCC_SHORT_CLOSED, PMCC_SHORT_ROLL, PMCC_LEAPS_ROLL])` (schemas.ts)
- `type WheelTriggerEvent` (not exported; the 8 wheel values) and `export type TriggerEvent = WheelTriggerEvent | z.infer<typeof PmccTriggerEvent>` (schemas.ts). `PMCC_OPEN` moved from the old union into `PmccTriggerEvent`, so `TriggerEvent` is a strict superset of what it was before.

## Red

`pnpm vitest run src/main/core/types.test.ts src/main/schemas.pmcc.test.ts` gave 13 failures. Each one fails because the code is not implemented yet:

- `PmccTriggerEvent` (x2): `TypeError: Cannot read properties of undefined (reading 'options' / 'safeParse')`, because the export is missing
- `contains all six PMCC leg roles`: `AssertionError: expected [ 'CSP_OPEN', … ] to deeply equal ArrayContaining{…}`, because the enum values are missing
- `isPmccLegRole` (x10): `TypeError: isPmccLegRole is not a function`, because the export is missing

`still contains every wheel leg role` passed during Red. It guards against a regression, so passing before the change is expected.

## Green

- types.test.ts + schemas.pmcc.test.ts + schemas.test.ts: 3 files, 88 tests passed
- `pnpm test`: 257 files, 3793 tests passed
- `pnpm lint`: clean
- `pnpm typecheck`: clean for Area 1. The only errors are in `src/main/services/roll-chains.test.ts`, an untracked file from another area's Red work (`Cannot find module './roll-chains'`). Area 1 did not cause them.
- Formatted the four files with prettier

## Deviations

- The PMCC trigger-event tests are in a new `src/main/schemas.pmcc.test.ts` (tasks.md allows this) and not in `schemas.test.ts`.
- No renderer label text was added, as instructed.
