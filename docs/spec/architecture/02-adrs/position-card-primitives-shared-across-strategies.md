# ADR: One set of position-card primitives shared across strategies

<!-- generated:from us-18 -->

## Decision

The positions list is one card grid. Wheel and PMCC cards are built from **one set of
presentational primitives** in `src/renderer/src/components/position-card/`:

- `CardShell`, `CardHeader` and `PriceBlock`
- `ActionStrip`
- `LegBlock` and `LegTag`
- `CardFooter` and `CardFooterCell`
- shared class strings in `styles.ts`

The primitives are typed on plain props, for example `tone: CardTone` (`'red' | 'gold'`) and
`accent: CardAccent` (`StrategyPhase<'WHEEL'> | 'PMCC'`). They have no knowledge of queue rows or
list items. Class maps are typed `Record<CardTone, string>` and `Record<CardAccent, string>`, so a
new tone or accent cannot ship unstyled. `PositionsGrid` branches once on `item.strategyType` to
choose `WheelCard` or `PmccCard`.

Three related choices:

1. **`WheelCardDisplay` is a discriminated union of card states.**
   - `deriveWheelCardDisplay(item, snapshot, quote, { closed, profitTargetDefault })` in
     `src/renderer/src/lib/wheel-card-display.ts` returns one of `closed | shares | option`.
   - `WheelCard.tsx` only composes; every figure comes from the display.
   - Invalid combinations do not type-check. A closed card cannot carry a TARGET badge or a live
     P&L, and a shares card cannot carry an urgent DTE. `expectTypeOf(...).not.toExtend` tests guard
     this.
2. **The PMCC renders as a minimal card until US-108.** `PmccCard` uses the same shell:
   - a teal accent and a `PMCC` badge;
   - a state label, `LEAPS + short call open` or `No short open`;
   - the price, with its next-decision DTE (`short?.dte ?? long.dte`, the same rule as
     `position-order.ts`);
   - one `L` / `S` `LegBlock` per open leg, each with a `—` mark;
   - P&L `—` / `no valuation yet`;
   - a basis and premium footer.

   It has no strip, TARGET badge or flag, and never a wheel phase badge. It shows only what the old
   `PmccPositionRow` showed.

3. **The table cells are deleted, not wrapped.** The following are removed:
   - `PositionRow` (`PositionCard.tsx`) and `PmccPositionRow`;
   - `OptMidCell`, `UnrealizedPnlCell` and `PriceCell`;
   - `positionRowStyles.ts` and the tests of everything above;
   - `TABLE_COLUMNS` and the `.wb-position-row*` CSS.

   The formatting helpers in `lib/option-display.ts` stay.

## Context / Why

- **US-108 needs the same pieces.** It reuses the primitives unchanged for the full PMCC card, and
  the mockup (`mockups/epic-09-pmcc-dashboard.mdx`) draws both cards from the same pieces.
- **One presentation the day the grid ships.** US-108 rejects a mixed table-plus-card dashboard, so
  the grid needs one presentation from the start. A minimal PMCC card that is truthful now is cheap
  to replace later. This is the same reasoning as
  [pmcc-list-item-discriminated-union](./pmcc-list-item-discriminated-union.md), whose minimal row
  this card supersedes.
- **A union replaces independent nullable fields.** The data-model sketch had a dozen independent
  nullable fields, which allowed states the UI must never draw. The union makes those states
  unrepresentable and leaves the component with no branching on figures.
- **The old cells cannot be reused.** They are `<td>`s and cannot live in a card. Keeping them as
  dead code would break the orphan rule, and the reconciled story drops the table view.

## Alternatives considered

- **A single `PositionCard` with strategy branches.** Rejected, because the wheel card would carry
  PMCC concerns.
- **A `PositionCardBase` abstraction.** This was rejected again at refactor time. Composition of
  small primitives is enough.
- **One display interface with independent fields:** `pnl | null`, `pnlSubline`, `targetReached`,
  `pnlPercent`, `maxProfit`, `targetPercent`, `dteUrgent`, `priceSubline` and `mark`. Superseded by
  the union.
- **Keeping `PmccPositionRow` inside a one-row table.** Rejected, because it gives two
  presentations on one page.
- **Keeping the cells as an alternate table view.** Rejected by the reconciled story.

## Consequences

- **US-108's card is assembly only.** It assembles existing primitives and adds valuation and its
  live-derived strip; the shell, strip, leg block and footer do not change. The ✕ and ◆ lanes slot
  into the reserved lane numbers. See
  [wheel-card-strip-mirrors-management-queue](./wheel-card-strip-mirrors-management-queue.md).
- **The e2e test-id contract is preserved across the move.** The table's ids stay:
  - `position-card`, `position-card-closed` and `position-ticker`
  - `position-card-{T}-price`, `-opt-mid` and `-pnl`
  - `target-badge`, `expiring-soon-flag` and `opt-mid-spread-warning`
  - `pending-assignment-indicator-{id}`

  New hooks are `action-strip` (`data-tone`), `leg-block` (`data-action`) and `data-edge` on the
  shell. Existing specs needed only selector updates.

- **Closed and edge-case behaviour.**
  - A closed wheel card keeps the short phase badge (for example `CSP ✓`), shows `—` live figures,
    requests no quote or snapshot, and stays clickable.
  - The row-wide ≤ 7 DTE highlight is gone; the card edge is reserved for action tones.

## Sources

- [extract: us-18](../../.extracts/us-18.md)
- [feature: us-18-position-cards](../../features/us-18-position-cards.md)
- `plans/us-18/research.md` (ADRs, U5, U7); `plans/us-18/data-model.md` § 3, § 4;
`plans/us-18/plan.md` Areas 3–6; `docs/us-18-implementation.md` § 3–5, § Removed
<!-- /generated -->
