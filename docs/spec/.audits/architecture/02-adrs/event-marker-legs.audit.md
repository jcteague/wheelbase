---
page: docs/spec/architecture/02-adrs/event-marker-legs.md
audited_at: 2026-09-28
findings: 9
---

# Audit: docs/spec/architecture/02-adrs/event-marker-legs.md

## Verified (6)

- ✓ CSP EXPIRE leg: `leg_role='EXPIRE'`, `action='EXPIRE'`, premium `'0.0000'`, `fill_price NULL`, `fill_date` = expiration (or override) — `src/main/services/expire-csp-position.ts:37,62,69-70`.
- ✓ ASSIGN leg: `leg_role='ASSIGN'`, `action='ASSIGN'`, `instrument_type='STOCK'`, premium `'0.0000'`, `fill_price NULL`, `fill_date` = assignment date — `src/main/services/assign-csp-position.ts:106,113-114`.
- ✓ `activeLeg` is `null` outside `CSP_OPEN`/`CC_OPEN` (so `null` for `HOLDING_SHARES`) — `src/main/services/active-leg-sql.ts:6-14`, used by `src/main/services/get-position.ts:203,242`.
- ✓ `LegAction` enum is `SELL | BUY | EXPIRE | ASSIGN | EXERCISE` — `src/main/core/types.ts:3,31`.
- ✓ `LegRole` includes `EXPIRE` and `ASSIGN` — `src/main/core/types.ts:19-30`.
- ✓ CC-expire flow writes only the leg (no new `cost_basis_snapshots` insert) — `src/main/services/expire-cc-position.ts:45-67`.

## Drift (2)

- ✗ Line 9 says EXPIRE legs "(CSP or CC expiring worthless)" use `leg_role = 'EXPIRE'`. The CC path writes `leg_role = 'CC_EXPIRED'` with `action = 'EXPIRE'` — `src/main/services/expire-cc-position.ts:51,84-85`; `CC_EXPIRED` is a distinct `LegRole` value (`src/main/core/types.ts:24`). Suggested fix: note that the CC event marker uses role `CC_EXPIRED`.
- ✗ Line 33: "The expiration snapshot uses `snapshot_at = now + 1ms`". The code uses `makeSnapshotAt(recordedDate)` — the event date plus the current wall-clock time — `src/main/services/expire-csp-position.ts:55`, `src/main/dates.ts:24-27`. No `+ 1ms` offset exists. Suggested fix: describe the `makeSnapshotAt` rule.

## Unverifiable (1)

- ? "the renderer already guards `activeLeg && ...` before rendering the open-leg card" — not traced; narrative.

## Missing files (0)

None.
