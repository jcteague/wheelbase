# ADR: One pure `calculatePmccOpeningDebit`, shared by service, list, detail and form preview

<!-- generated:from us-101 -->

## Decision

`calculatePmccOpeningDebit({ contracts, long: { strike, fillPrice, fees }, short })` in `src/main/core/costbasis.ts` is the single implementation of the PMCC opening cash flows. It returns 4-dp strings for `leapsCost`, `shortCredit`, `fees`, `initialNetDebit`, `netDebitBeforeFees`, `basisPerShare`, `strikeWidthPerShare` and `debitToWidthPercent`:

- `initialNetDebit = (longFill − shortFill) × 100 × contracts + longFees + shortFees`
- `debitToWidthPercent = (longFill − shortFill) / (short.strike − long.strike) × 100`. Fees are excluded, and the value is `null` when the width is ≤ 0.
- It never throws on a negative debit. Rejecting a net credit is `openPmcc`'s job (see [pmcc-validation-pure-engine-mirrored-by-form-schema](./pmcc-validation-pure-engine-mirrored-by-form-schema.md)).

It has four consumers:

1. **Service:** `createPmccPosition` uses it for the snapshot and the `openingDebit` return field.
2. **List:** `listPositions` recomputes `PmccListSummary.initialNetDebit` from the legs' fills and fees.
3. **Detail:** `PmccLegReference` recomputes it the same way. Neither list nor detail uses the rounded `basis_per_share`.
4. **Form preview:** `PmccCashFlows` imports it from `main/core/costbasis`, the same way `PositionCard` imports `computeUnrealizedPnl`.

A `money4(value: Decimal): string` helper, extracted during refactor, owns the 4-dp TEXT money convention across `costbasis.ts`.

## Context / Why

- The AC pins five numbers ($2,500.00 / $200.00 / $0.00 / $2,300.00 / $30.00, plus 76.67%). Two implementations would drift apart.
- Recomputing from the legs avoids the rounding loss of a per-share basis.

## Alternatives considered

- **A copy under `src/shared/`.** Rejected: that is a second implementation.
- **An ad-hoc `parseFloat` preview in the form.** Rejected: it drifts from the service and does not use Decimal math.

## Consequences

- Property tests cover the Decimal identities, contract scale-invariance, a `null` ratio exactly when width ≤ 0, fee-independence of the ratio, and the 4-dp format.
- The engine stays pure ([pure-core-engines](./pure-core-engines.md)); the preview is a [client-side-pnl-preview](./client-side-pnl-preview.md) that uses the same function the server does.

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
<!-- /generated -->
