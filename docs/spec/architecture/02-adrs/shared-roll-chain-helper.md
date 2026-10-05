# ADR: One shared roll-chain helper that nets by action, and one shared legs reader

<!-- generated:from us-103 -->

## Decision

### 1. `groupRollChains` lives in `src/main/services/roll-chains.ts`

- The new shared `groupRollChains(legs: LegRecord[]): RollChain[]` replaces the private `groupRollsByChain` in `assignCspPosition`.
- `RollChain` has these fields: `rollChainId`, `rollFrom`, `rollTo`, `netCreditPerShare`, `contracts`, `fees`, `fillDate`.
- **Netting is by action:** `netCreditPerShare = Σ SELL premiums − Σ BUY premiums`, 4 dp and signed; positive means a credit.
- Chains sort by earliest `fillDate`, then `createdAt`. A chain missing either half is dropped.
- `assignCspPosition` maps `{ netCreditPerShare, contracts }` onto its existing `ROLL_NET` legs. Its tests and waterfall labels are unchanged.

### 2. `src/main/services/leg-rows.ts` is the one legs reader

- It exports two readers:
  - `readLegs(db, positionId): LegRecord[]`, which is the `GET_LEGS_QUERY` + `mapLegRow` that used to be private to `get-position.ts`.
  - `readLegsByPosition(db, positionIds): Map<string, LegRecord[]>`, which runs one `IN (...)` query with the same `fill_date ASC, created_at ASC` ordering. An empty input returns an empty map without querying.
- `pmcc-opening-legs.ts` is now pure over `LegRecord[]` (`pmccOpeningLegs(legs)`, `pmccInitialNetDebit(legs)`). `readPmccOpeningLegs` and the `PmccOpeningLegRow` DB shape are deleted.
- `get-position.ts` and `list-positions.ts` read the legs once. The opening summary, `initialNetDebit` and the ledger all come from those same rows.

## Context / Why

- **Roll chains:** the story names PMCC as the second consumer US-16 was waiting for, and US-109 will be the third ([us-16](../../features/us-16-cost-basis-sequential-rolls.md)). For wheel rolls, `ROLL_TO.premium − ROLL_FROM.premium` and `SELL − BUY` are the same number, so the move changes nothing for the wheel. The action-based form is also correct for the inverted LEAPS roll, where `ROLL_FROM` is the SELL and `ROLL_TO` is the BUY (OPT-13).
- **Legs reader:** the ledger needs every leg. Reading the two opening roles separately would add a second query per position for a subset of the same rows.

## Alternatives considered

- **A third private copy of the chain grouping in `pmcc-ledger.ts`.** Rejected: that is exactly what US-16's note said not to do.
- **Net by role with a `legType` flag.** Rejected: the caller would have to know which half is which.
- **Keep `readPmccOpeningLegs` and add a `readPmccLegs`.** Rejected: two readers over one table.

## Consequences

- Rolls stay stored as linked pairs ([rolls-as-linked-leg-pairs](./rolls-as-linked-leg-pairs.md)). Both strategies net them through the same helper when they read them.
- The list reads legs for every PMCC position in one batched query.
- The list and detail now recompute the opening debit from the shared reader's rows ([shared-pure-pmcc-opening-debit](./shared-pure-pmcc-opening-debit.md)).

## Sources

- [extract: us-103](../../.extracts/us-103.md)
- [feature: us-103-pmcc-cost-basis](../../features/us-103-pmcc-cost-basis.md)
<!-- /generated -->
