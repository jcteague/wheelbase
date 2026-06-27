---
page: docs/spec/architecture/02-adrs/active-leg-metadata-via-positions-list.md
audited_at: 2026-06-27
findings: 1
---

# Audit: active-leg-metadata-via-positions-list.md

## Verified (4)

- ✓ `PositionListItem` carries `contracts: number | null` — `src/main/services/list-positions.ts:25`.
- ✓ `instrumentType`, `entryPremiumPerContract`, `profitTargetPercent` mapped into the list item — `list-positions.ts:79-86`.
- ✓ Columns `l.instrument_type, l.contracts, l.premium_per_contract` plus `p.profit_target_percent` are selected in the list query — `list-positions.ts:39,41`.
- ✓ No separate IPC call for active-leg metadata — these fields ride the existing list query.

## Drift (1)

- ✗ Page says the four fields are "sourced by extending the existing active-leg subquery in `LIST_QUERY`" (line 7). In the code, the extra columns are selected directly in the list query body in `list-positions.ts:39-41`; the shared `activeLegSubquery()` helper (`src/main/services/active-leg-sql.ts`) returns only `SELECT id FROM legs ...` and does not select `instrument_type`/`contracts`/`premium_per_contract`. Suggested fix: reword to "by extending the SELECT columns of the list query (joining the active leg)," not "extending the active-leg subquery."

## Unverifiable (0)

None.

## Missing files (0)

None.
