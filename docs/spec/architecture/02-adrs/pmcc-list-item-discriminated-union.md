# ADR: PMCC list item is a discriminated union; wheel code paths untouched

<!-- generated:from us-101 -->

## Decision

`PositionListItem` becomes `WheelListItem | PmccListItem`, discriminated on `strategyType`. This follows the same exactly-one-arm pattern as `IpcIvRankPair`.

- **Shared base:** both arms share a base (`PositionListItemBase`, built by `toListItemBase`) with `id`, `ticker`, `phase`, `status`, `premiumCollected`, `effectiveCostBasis` and `profitTargetPercent`.
- **Wheel arm:** only `WheelListItem` carries the wheel fields.
- **PMCC arm:** only `PmccListItem` carries `pmcc: PmccListSummary` (long and short `{ strike, expiration, dte, contracts }` plus `initialNetDebit`). It types the six wheel fields `strike`, `expiration`, `dte`, `instrumentType`, `contracts` and `entryPremiumPerContract` as `null`, so the calendar, `useOptionSnapshots` and `deriveRowDisplay` skip a PMCC row **without a branch**.
- **Summary source:** one extra legs query (`readPmccSummaries`) fills the summary. `initialNetDebit` is recomputed from the legs ([shared-pure-pmcc-opening-debit](./shared-pure-pmcc-opening-debit.md)).
- **Sorting:** a PMCC row's own `dte` is null, so `sortPositionsByDte` (`core/position-order.ts`) orders it by its short call's DTE among the wheel rows; rows with no DTE at all (shares held) sort last.

The renderer branches on `strategyType`, never on a phase string:

- **Row:** `PositionCard` delegates to `PmccPositionRow`. It shows the `PMCC` badge, both strikes, per-leg expiration and DTE, `Premium` as short credit, and `Cost Basis` as the net debit, with `—` for mid and P&L. It shares `rowStyle(index, phase)` with the wheel row.
- **Detail:** `PositionCockpit` renders `PmccLegReference` (two leg cards plus the initial net debit, and "Live P&L unavailable until PMCC valuation ships"). It has no verdict block and no cost-basis drawer.
- **Other detail surfaces:** `PositionDetailContent` hides `PositionAlertOverridesForm`, and `PositionDetailActions` shows only the badge for `PMCC_OPEN`.

**The wheel-only jobs are unchanged.** `evaluate-alerts.ts` and `detect-assignments.ts` get no code change. Tests prove that their phase filters (`phase IN ('CSP_OPEN','CC_OPEN')`, `phase = 'CSP_OPEN'`) and the phase-aware `activeLegSubquery()` ([active-leg-resolution](./active-leg-resolution.md)) already exclude PMCC.

## Context / Why

- The story says to show a PMCC only on surfaces that can handle its strategy.
- US-108 and US-118 replace these minimal views, so they have to be truthful now and cheap to delete later.
- Typed-null wheel fields make exclusion a property of the data, not a set of scattered `if (strategyType === 'PMCC')` checks.

## Alternatives considered

- **Fill `expiration` with the short call's date so the calendar shows the PMCC.** Deferred: it would render a PMCC through wheel copy ("CC expiring").

## Consequences

- `positions:list` stays unwrapped by `handleIpcCall`. The renderer adapter branches once on `strategyType`.
- A PMCC whose leg rows are missing is dropped from the list with a WARN (`pmcc_list_summary_incomplete`) rather than surfaced. This cannot happen through `createPmccPosition`, and it is noted for US-108.
- Pre-existing type debt widened: preload `IpcPositionListItem.phase` is still `string` cast `as WheelPhase`.

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
<!-- /generated -->
