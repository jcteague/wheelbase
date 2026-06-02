# ADR: Active-leg metadata flows through `positions:list`, not a second query

<!-- generated:from us-33 -->

## Decision

`PositionListItem` is extended with four nullable fields — `instrumentType: 'PUT' | 'CALL' | null`, `contracts: number | null`, `entryPremiumPerContract: string | null`, `profitTargetPercent: number | null` — sourced by extending the existing active-leg subquery in `LIST_QUERY` to select `l.instrument_type, l.contracts, l.premium_per_contract` plus `p.profit_target_percent`. No separate IPC call.

## Why

The active-leg JOIN already exists, so adding three columns is trivial and avoids a second renderer query just to get the inputs needed for OCC symbol building and unrealized P&L. `instrumentType` is the authoritative "has an open option leg" signal — more durable than coupling on `phase`, which is fragile if new phases get added.

## Alternatives considered

- **Derive "has open option leg" purely from `phase`** — coupling on phase is fragile; instrument type stays correct under future phase additions.
- **Add a second IPC call to fetch active-leg metadata** — duplicates work that the existing subquery already does.

## Source

- `plans/us-33/research.md`
- `plans/us-33/contracts/positions-list.md`
- Feature page: `../../features/us-33-option-mid-pnl.md`
<!-- /generated -->
