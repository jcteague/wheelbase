# Data Model: US-2 — List All Positions

## No New DB Entities

All required data lives in the existing Phase 1 schema:

- `positions` table — ticker, phase, status, opened_date
- `legs` table — strike, expiration, contracts, premium_per_contract, action, fill_date
- `cost_basis_snapshots` table — basis_per_share, total_premium_collected

---

## New Response Schema: `PositionListItemResponse`

Lives in `backend/app/api/schemas.py`.

| Field                  | Type                    | Source                                             | Notes                          |
| ---------------------- | ----------------------- | -------------------------------------------------- | ------------------------------ |
| `id`                   | `uuid.UUID`             | `positions.id`                                     |                                |
| `ticker`               | `str`                   | `positions.ticker`                                 |                                |
| `phase`                | `WheelPhase`            | `positions.phase`                                  | Used for badge display         |
| `status`               | `WheelStatus`           | `positions.status`                                 |                                |
| `strike`               | `Decimal \| None`       | active `Leg.strike`                                | None when no active option leg |
| `expiration`           | `datetime.date \| None` | active `Leg.expiration`                            | None when no active option leg |
| `dte`                  | `int \| None`           | computed: `(expiration − today).days`              | None when `expiration` is None |
| `premium_collected`    | `Decimal`               | latest `CostBasisSnapshot.total_premium_collected` |                                |
| `effective_cost_basis` | `Decimal`               | latest `CostBasisSnapshot.basis_per_share`         |                                |

### Validation Rules (from Acceptance Criteria)

- DTE is computed as `(leg.expiration - date.today()).days` where `leg` is the most recent `Leg` with `action == 'open'`.
- If no such leg exists, `dte`, `strike`, and `expiration` are all `None`.
- Response is sorted by `dte` ascending; `None` values sort last.
- All positions are returned regardless of phase or status (no filtering).

---

## Active Leg Selection Logic (Python)

```
active_leg = max(
    (leg for leg in position.legs if leg.action == LegAction.open),
    key=lambda l: l.fill_date,
    default=None
)
```

## Latest Snapshot Selection Logic (Python)

```
latest_snapshot = max(
    position.cost_basis_snapshots,
    key=lambda s: s.snapshot_at,
    default=None
)
```

If `latest_snapshot` is None (data integrity issue), the position is skipped or raises a server error — this should never happen given the POST /positions invariant.
