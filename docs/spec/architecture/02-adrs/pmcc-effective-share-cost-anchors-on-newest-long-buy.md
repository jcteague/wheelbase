# ADR: `Effective share cost` anchors on the strike of the newest long-side BUY leg

<!-- generated:from us-103 -->

## Decision

- `currentLongStrike(legs)` in `src/main/services/pmcc-ledger.ts` returns the strike of the most recent long-side `BUY` leg, ordered by `fillDate` then `createdAt`, or `null` if there is none.
  - At entry that leg is `LEAPS_OPEN`.
  - After a LEAPS roll it is the `ROLL_TO` of the latest chain whose `ROLL_FROM` is a SELL.
  - A short roll's BUY half does not count.
- The same leg supplies `leapsContracts`. `pmccLedgerFromLegs` returns `null` when no such leg exists, not only when there are no legs.
- **There is no strike-delta term.** Strike reaches the ledger only through `effectiveShareCost = longStrike + basisPerShare`. A roll changes the basis only through its net cash.

## Context / Why

- The story says the strike change shows up in the effective-share-cost line, which reads the open long leg's strike, and not in the basis.
- After US-105's LEAPS roll, the line re-anchors to $104.30 without any other rule.
- Because strike never enters the contribution fold, US-105's "no strike-delta term" holds by construction ([pure-pmcc-ledger-engine](./pure-pmcc-ledger-engine.md)).

## Alternatives considered

- **Reuse the "later rows win" rule of `readPmccOpeningLegs` over `LEAPS_OPEN` only.** Rejected: it misses the roll.
- **Derive the strike from `activeLegSubquery`.** Rejected: it is phase-aware and shaped for the wheel ([active-leg-resolution](./active-leg-resolution.md)).

## Consequences

- When there is no long BUY leg, there is no ledger. The detail page then shows no drawer, and the list has no basis.

## Sources

- [extract: us-103](../../.extracts/us-103.md)
- [feature: us-103-pmcc-cost-basis](../../features/us-103-pmcc-cost-basis.md)
<!-- /generated -->
