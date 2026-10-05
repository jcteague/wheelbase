# ADR: One pure `calculatePmccLedger` over signed contributions; the engine never sees legs

<!-- generated:from us-103 -->

## Decision

`src/main/core/costbasis.ts` gains `calculatePmccLedger(PmccLedgerInput) → PmccLedgerResult`. Its input is the LEAPS contract count, the current long strike (or `null`), and a list of **contributions**, each with a side (`LONG` / `SHORT`), a signed `cashPerShare`, a contract count and dollar fees. It never receives a leg, a leg role or a `roll_chain_id`.

- **Sign convention:** `cashPerShare` is positive for cash paid out and negative for cash received. `fees` is dollars for the whole contribution.
- **The fold is in dollars, divided once:**
  - `contributionTotal = cashPerShare × contracts × 100 + fees`
  - `leapsCostTotal = Σ LONG contributions`
  - `shortCreditsTotal = −Σ SHORT contributions` (a net credit is positive)
  - `basisTotal = leapsCostTotal − shortCreditsTotal`
  - `basisPerShare = basisTotal / (leapsContracts × 100)`; the two per-side per-share figures divide the same way
  - `effectiveShareCost = longStrike + basisPerShare`, or `null` when there is no strike
  - `premiumRecoveredPercent = shortCreditsTotal / leapsCostTotal × 100`, or `null` when `leapsCostTotal ≤ 0`
- Every output is a 4-dp string through the file's existing `money4`. Only `decimal.js` is imported.
- `leapsContracts` below 1, or not an integer, throws `'leapsContracts must be a positive integer'`. Callers validate before calling.

## Context / Why

- The story's formula, `basis = long_debits + fees − short_credits ± roll_nets`, is a sum of signed cash. If the sign is set from the action at the boundary, one rule covers every event: an opening debit, an opening credit, a buyback, a short roll (BUY to close + SELL to open, net debit $0.60) and a LEAPS roll (SELL to close + BUY to open, net credit $2.50). The engine needs no `kind` switch.
- US-105's "no strike-delta term" rule holds by construction, because strike never enters the fold (see [pmcc-effective-share-cost-anchors-on-newest-long-buy](./pmcc-effective-share-cost-anchors-on-newest-long-buy.md)).
- Folding in dollars and dividing once gives `2302.0000` / `23.0200` for the fee example. It also prorates US-115's partial coverage (1 short against 3 LEAPS) the same way `calculateCcOpenBasis` prorates CC income across held shares.
- Classifying contributions by side at the boundary keeps leg roles out of `core/`. This follows US-16's precedent that "the engine has no roll_chain_id grouping concept" ([pure-core-engines](./pure-core-engines.md)).

## Alternatives considered

- **Pass `LegRecord[]` into the engine.** Rejected: it leaks `roll_chain_id` and role names into `core/`.
- **Per-share-only arithmetic.** Rejected: it breaks when contract counts differ and when fees are per-leg dollars.
- **A `kind` discriminator on each contribution.** Rejected: more surface, with no extra rule to justify it.
- **Extend `calculateRollBasis` with `legType: 'PMCC_SHORT' | 'PMCC_LEAPS'`.** Rejected: the wheel function is a delta on the previous snapshot, while the PMCC ledger replays every fill.

## Consequences

- Turning legs into contributions is the service layer's job ([pmcc-contributions-by-role-and-action](./pmcc-contributions-by-role-and-action.md)).
- Property tests in `costbasis.property.test.ts` can check the identities (`basisTotal = leapsCostTotal − shortCreditsTotal`, contract scale-invariance, order independence) against independent formulas.

## Sources

- [extract: us-103](../../.extracts/us-103.md)
- [feature: us-103-pmcc-cost-basis](../../features/us-103-pmcc-cost-basis.md)
<!-- /generated -->
