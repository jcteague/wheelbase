# ADR: PMCC contributions take their side from the leg role and their sign from the action

<!-- generated:from us-103 -->

## Decision

`buildPmccContributions(legs: LegRecord[]): PmccContribution[]` in `src/main/services/pmcc-ledger.ts` turns a position's legs into engine input.

- **Legs not in a roll chain** (`rollChainId === null`):
  - **Side** comes from `PMCC_LEG_SIDE[legRole]`. This is an exhaustive `Record<PmccLegRole, PmccLedgerSide>`: `LEAPS_*` maps to `LONG` and `SHORT_CALL_*` maps to `SHORT`.
  - **Cash per share** is `+premiumPerContract` for `BUY`, `−premiumPerContract` for `SELL`, and `0` for `EXPIRE` / `ASSIGN` / `EXERCISE`.
  - `fees` and `contracts` come from the leg.
- **Roll chains** (from `groupRollChains`, see [shared-roll-chain-helper](./shared-roll-chain-helper.md)) produce one contribution per chain:
  - `cashPerShare = Σ BUY − Σ SELL`, which equals `−netCreditPerShare`
  - `fees = Σ leg fees`
  - `contracts = rollTo.contracts`
  - `side = LONG` when `rollFrom.action === 'SELL'` (closing a long), otherwise `SHORT`
- **Order:** by `fillDate`, then `createdAt`; a chain sorts by its earliest leg. Order does not change the result. It only keeps the DEBUG `pmcc_ledger_contributions` log chronological.
- A leg whose role is not a PMCC role is left out and logged at WARN as `pmcc_ledger_unknown_leg_role`.

## Context / Why

- **The side must come from the role**, not from the action or the strike. US-109 asks for "a side discriminator … without inferring from strike". A short-call buyback and a LEAPS purchase are both `BUY CALL`.
- **The sign must come from the action**, because every PMCC event is a cash flow with a direction.
- The exhaustive record turns "a PMCC role with no side" into a compile error the day US-111 adds a role. The four reserved roles (`SHORT_CALL_CLOSE`, `SHORT_CALL_EXPIRED`, `LEAPS_CLOSE`, `SHORT_CALL_ASSIGNED`) entered `LegRole` in this story for that reason ([pmcc-phase-and-leg-role-names](./pmcc-phase-and-leg-role-names.md)).

## Alternatives considered

- **Classify by action and instrument.** Rejected: wrong for buybacks.
- **Prefix-match the role string.** Rejected: untyped.
- **Two arrays of roles, one per side.** Rejected: not exhaustive.

## Consequences

- The pure engine stays free of roles ([pure-pmcc-ledger-engine](./pure-pmcc-ledger-engine.md)). Rolls stay linked leg pairs and are netted only when read ([rolls-as-linked-leg-pairs](./rolls-as-linked-leg-pairs.md)).

## Sources

- [extract: us-103](../../.extracts/us-103.md)
- [feature: us-103-pmcc-cost-basis](../../features/us-103-pmcc-cost-basis.md)
<!-- /generated -->
