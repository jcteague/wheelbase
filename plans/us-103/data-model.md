# Data Model: US-103 — PMCC cost basis

## 1. Entities

### `cost_basis_snapshots` (existing table, no migration)

| Column                    | PMCC meaning                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `basis_per_share`         | `PmccLedgerResult.basisPerShare` — per share of contract, 4 dp, **may be negative**                |
| `total_premium_collected` | `PmccLedgerResult.shortCreditsTotal` — short-call credits to date in dollars, after short-leg fees |
| `final_pnl`               | `NULL` for every US-103 event (terminal P&L is US-111 / US-120)                                    |
| `trigger_event`           | one `PmccTriggerEvent`                                                                             |
| `snapshot_at`             | `makeSnapshotAt(eventDate)` — the leg event's fill / expiration date plus the wall-clock time      |

One row per leg event, append-only ([ADR](../../docs/spec/architecture/02-adrs/append-only-cost-basis-snapshots.md)).
The `PMCC_OPEN` row written by `createPmccPosition` is already in this shape.

### `legs` (existing table, no migration)

Every PMCC leg is a `CALL`. Side is given by `leg_role`, direction by `action`:

| `leg_role`              | `action`                                                               | Side                  | Written by      |
| ----------------------- | ---------------------------------------------------------------------- | --------------------- | --------------- |
| `LEAPS_OPEN`            | `BUY`                                                                  | LONG                  | US-101          |
| `SHORT_CALL_OPEN`       | `SELL`                                                                 | SHORT                 | US-101, US-115  |
| `SHORT_CALL_EXPIRED`    | `EXPIRE` (premium 0)                                                   | SHORT                 | US-119          |
| `SHORT_CALL_CLOSE`      | `BUY`                                                                  | SHORT                 | US-119          |
| `SHORT_CALL_ASSIGNED`   | `ASSIGN` (premium 0)                                                   | SHORT                 | US-111          |
| `LEAPS_CLOSE`           | `SELL`                                                                 | LONG                  | US-120          |
| `ROLL_FROM` + `ROLL_TO` | BUY + SELL (short roll) / SELL + BUY (LEAPS roll), one `roll_chain_id` | by `ROLL_FROM.action` | US-104 / US-105 |

US-103 **adds the four reserved roles to the `LegRole` enum** and classifies all of them; it writes
none of them in production code.

### `PmccContribution` (in-memory, engine input)

| Field          | Type                | Rule                                                                                                                   |
| -------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `side`         | `'LONG' \| 'SHORT'` | from `PMCC_LEG_SIDE[legRole]`; for a roll chain, `LONG` iff `rollFrom.action === 'SELL'`                               |
| `cashPerShare` | `string` (4 dp)     | signed per share: `+premium` for BUY, `−premium` for SELL, `0` for EXPIRE/ASSIGN/EXERCISE; a chain is `Σ BUY − Σ SELL` |
| `contracts`    | `number`            | the leg's contracts; a chain's `rollTo.contracts`                                                                      |
| `fees`         | `string` (4 dp $)   | the leg's `fees`; a chain's `Σ fees`                                                                                   |

### `PmccLedgerResult` (in-memory, engine output; carried on IPC)

| Field                     | Formula                                                              | Null when             |
| ------------------------- | -------------------------------------------------------------------- | --------------------- |
| `leapsCostTotal`          | `Σ_LONG (cashPerShare × contracts × 100 + fees)`                     | never                 |
| `shortCreditsTotal`       | `−Σ_SHORT (cashPerShare × contracts × 100 + fees)` (credit positive) | never                 |
| `basisTotal`              | `leapsCostTotal − shortCreditsTotal`                                 | never                 |
| `basisPerShare`           | `basisTotal / (leapsContracts × 100)`                                | never                 |
| `leapsCostPerShare`       | `leapsCostTotal / (leapsContracts × 100)`                            | never                 |
| `shortCreditsPerShare`    | `shortCreditsTotal / (leapsContracts × 100)`                         | never                 |
| `effectiveShareCost`      | `longStrike + basisPerShare`                                         | `longStrike === null` |
| `premiumRecoveredPercent` | `shortCreditsTotal / leapsCostTotal × 100`                           | `leapsCostTotal ≤ 0`  |

All money strings are 4 dp, `Decimal.ROUND_HALF_UP`, rounded once at the end of each field.
`leapsContracts < 1` throws (`'leapsContracts must be a positive integer'`) — callers validate.

### `RollChain` (in-memory, shared service helper)

| Field                | Type        | Rule                                                        |
| -------------------- | ----------- | ----------------------------------------------------------- |
| `rollChainId`        | `string`    | the shared `roll_chain_id`                                  |
| `rollFrom`, `rollTo` | `LegRecord` | the two halves; a chain missing either is dropped           |
| `netCreditPerShare`  | `string`    | `Σ SELL premiums − Σ BUY premiums`, 4 dp, positive = credit |
| `contracts`          | `number`    | `rollTo.contracts`                                          |
| `fees`               | `string`    | `rollFrom.fees + rollTo.fees`                               |
| `fillDate`           | `string`    | the earlier of the two `fillDate`s                          |

## 2. Validation rules from the acceptance criteria

| AC                                                          | Rule encoded where                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Cost basis after the two opening legs                       | engine fold; `PMCC_OPEN` row already present                                                              |
| Open credit is cash, not profit                             | credit enters `shortCreditsTotal`; no `realized`/`profit` field or label exists                           |
| Expiration does not move cost basis                         | `EXPIRE` → `cashPerShare = 0`; snapshot still written                                                     |
| Subsequent short lowers basis                               | SELL → negative cash on SHORT side                                                                        |
| Roll is one net amount                                      | `groupRollChains` → one `PmccContribution` per `roll_chain_id`                                            |
| LEAPS roll re-anchors effective share cost, no strike delta | strike never enters the fold; `currentLongStrike` picks the newest long BUY                               |
| Negative basis not clamped                                  | no `max(0, …)` anywhere; `fmtMoney` renders the sign                                                      |
| Per share regardless of quantity                            | divide totals by `leapsContracts × 100`                                                                   |
| Fees counted once, on their leg                             | `fees` is read from each leg row exactly once; chains sum both halves                                     |
| One snapshot per leg event                                  | `appendPmccSnapshot` inserts exactly one row                                                              |
| Failed event leaves no change                               | writer runs inside the caller's `db.transaction`                                                          |
| List shows running basis                                    | `PmccListSummary.basisTotal` from the ledger                                                              |
| Wheel unaffected                                            | every new path is behind `strategyType === 'PMCC'`; wheel services untouched except the helper extraction |

## 3. State transitions

None. US-103 changes no phase. `appendPmccSnapshot` accepts any PMCC position regardless of phase;
phase guards belong to the consumer stories' lifecycle functions.

## 4. Type Design

Reviewed with `/typescript-advanced-types`. Plain types wherever a plain type encodes the rule; an
advanced construct only where it buys an invariant or a derivation.

| Type / value                                              | File                                                             | Construct                                                                                                                                     | What it buys                                                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PmccLedgerSide`                                          | `src/main/core/costbasis.ts`                                     | `'LONG' \| 'SHORT'` literal union                                                                                                             | Plain — two values, no state to make illegal.                                                                                                        |
| `PmccContribution`, `PmccLedgerInput`, `PmccLedgerResult` | `src/main/core/costbasis.ts`                                     | Plain object interfaces                                                                                                                       | Plain types — no advanced constructs needed. `effectiveShareCost` / `premiumRecoveredPercent` are `string \| null`, matching `debitToWidthPercent`.  |
| `PmccLegRole`                                             | `src/main/core/types.ts`                                         | `Extract<LegRole, 'LEAPS_OPEN' \| 'LEAPS_CLOSE' \| 'SHORT_CALL_OPEN' \| 'SHORT_CALL_CLOSE' \| 'SHORT_CALL_EXPIRED' \| 'SHORT_CALL_ASSIGNED'>` | **Derivation**: a slice of the enum, so a misspelt role is a compile error, and `isPmccLegRole(role): role is PmccLegRole` narrows a `LegRecord`.    |
| `PMCC_LEG_SIDE`                                           | `src/main/services/pmcc-ledger.ts`                               | `Record<PmccLegRole, PmccLedgerSide>` (`as const satisfies` not needed — the Record is exhaustive by itself)                                  | **Illegal state unrepresentable**: adding a PMCC role to the enum without a side fails `typecheck`.                                                  |
| `PmccTriggerEvent`                                        | `src/main/schemas.ts`                                            | `z.enum([...])` + `z.infer`                                                                                                                   | **Derivation**: one list serves the writer's parameter type, the `_test:` payload schema and `TriggerEvent`; the union cannot drift from the schema. |
| `TriggerEvent`                                            | `src/main/schemas.ts`                                            | `WheelTriggerEvent \| PmccTriggerEvent`                                                                                                       | **Derivation**: the existing union split in two so the PMCC half is reusable without widening wheel code.                                            |
| `RollChain`                                               | `src/main/services/roll-chains.ts`                               | Plain object interface                                                                                                                        | Plain — the two halves are `LegRecord`s, not re-shaped.                                                                                              |
| `PmccListSummary`                                         | `src/main/schemas.ts`                                            | `{ long; short } & Pick<PmccLedgerResult, 'basisPerShare' \| 'basisTotal'>`                                                                   | **Derivation**: the list carries the engine's own field names and 4-dp convention; a renamed engine field breaks the list at compile time.           |
| `GetPositionResult.pmccLedger`                            | `src/main/schemas.ts`                                            | `PmccLedgerResult \| null`                                                                                                                    | Plain — null is the "not a PMCC / no legs" case, same as `initialNetDebit`.                                                                          |
| `TestPmccLegEventPayloadSchema`                           | `src/main/schemas.ts` (test section)                             | `z.object({ …, legRole: LegRole, action: LegAction, triggerEvent: PmccTriggerEvent })`                                                        | **Derivation**: reuses the core Zod enums so the seam can only write roles and triggers the app knows.                                               |
| `PmccCostBasisProps`                                      | `src/renderer/src/components/position-cockpit/PmccCostBasis.tsx` | `{ ledger: PmccLedgerResult }` (type imported from `api/positions`, which re-exports it from `main/schemas`)                                  | **Removes a cast**: the renderer types the drawer with the main-process type, as `SnapshotDetail = CostBasisSnapshotRecord` already does.            |

Implementation note: `PmccLegRole` is derived from a single
`PMCC_LEG_ROLE_VALUES as const satisfies readonly LegRole[]` list, so the type and the runtime
`Set` behind `isPmccLegRole` cannot drift while a misspelt role remains a compile error; the union
is identical to the planned `Extract`. `appendPmccSnapshot` is generic over the trigger event
(`AppendPmccSnapshotResult<T>`), so `createPmccPosition` returns a typed `PMCC_OPEN` snapshot
without a cast.

Renderer re-exports to add in `src/renderer/src/api/positions.ts`: `PmccLedgerResult` (from
`../../../main/core/costbasis`), alongside the existing `PmccListSummary` re-export.

## 5. Fixtures used by every test layer

Dates are relative to the run day in e2e (`localDate(n)`), fixed in Vitest. Prices are the AC's.

| Name          | Leg rows                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `OPEN`        | `LEAPS_OPEN` BUY $80 / 25.00 / exp +368d; `SHORT_CALL_OPEN` SELL $110 / 2.00 / exp +32d                  |
| `EXPIRE_1`    | `SHORT_CALL_EXPIRED` EXPIRE $110 / 0.0000 / fillDate = short expiration                                  |
| `SHORT_2`     | `SHORT_CALL_OPEN` SELL $108 / 1.80 / exp +67d, fillDate +35d                                             |
| `SHORT_ROLL`  | chain `rc-1`: `ROLL_FROM` BUY $108 / 3.00; `ROLL_TO` SELL $112 / 2.40 / exp +95d; fillDate +63d          |
| `LEAPS_ROLL`  | chain `rc-2`: `ROLL_FROM` SELL $80 / 26.00; `ROLL_TO` BUY $85 / 23.50 / exp +494d; fillDate +84d         |
| `CYCLES`      | `SHORT_CALL_OPEN` SELL $118 / 19.70 / exp +120d, fillDate +100d (stands in for six cycles; gives −$0.40) |
| `FEES`        | `OPEN` with `fees = 1.0000` on both legs                                                                 |
| `THREE`       | `OPEN` with `contracts = 3` on both legs                                                                 |
| `WHEEL_46_50` | wheel: CSP $48.50 strike, $2.00 premium, assigned → `HOLDING_SHARES`, basis $46.50                       |
