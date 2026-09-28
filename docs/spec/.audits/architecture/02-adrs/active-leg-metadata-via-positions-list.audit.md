---
page: docs/spec/architecture/02-adrs/active-leg-metadata-via-positions-list.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/architecture/02-adrs/active-leg-metadata-via-positions-list.md

## Verified (5)

- ✓ `PositionListItem` has `instrumentType: 'PUT' | 'CALL' | null`, `contracts: number | null`, `entryPremiumPerContract: string | null`, `profitTargetPercent: number | null` — `src/renderer/src/api/positions.ts:61-75`.
- ✓ `LIST_QUERY` exists and selects `p.profit_target_percent` and `l.instrument_type, l.contracts, l.premium_per_contract` — `src/main/services/list-positions.ts:36-41`.
- ✓ The active leg is joined via `activeLegSubquery()` — `list-positions.ts:45`.
- ✓ `activeLegSubquery()` itself still returns only `SELECT id FROM legs ...` — `src/main/services/active-leg-sql.ts:7`.
- ✓ Row mapping to the four fields — `list-positions.ts:79-86`.

## Drift (0)

## Unverifiable (1)

- ? "`instrumentType` is the authoritative 'has an open option leg' signal — more durable than coupling on `phase`" — design rationale.

## Missing files (2)

- ✗ Source `plans/us-33/research.md` does not exist (no `plans/us-33/` directory).
- ✗ Source `plans/us-33/contracts/positions-list.md` does not exist.
