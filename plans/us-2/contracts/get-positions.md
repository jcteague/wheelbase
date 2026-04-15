# API Contract: GET /api/positions

## Endpoint

```
GET /api/positions
```

No query parameters, authentication, or request body.

---

## Success Response — 200 OK

Returns a JSON array of position list items, sorted by `dte` ascending (nulls last).

```json
[
  {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "ticker": "AAPL",
    "phase": "CSP_OPEN",
    "status": "active",
    "strike": "180.0000",
    "expiration": "2026-04-17",
    "dte": 42,
    "premium_collected": "250.0000",
    "effective_cost_basis": "177.5000"
  },
  {
    "id": "7ba12e88-1234-4abc-9def-1a2b3c4d5e6f",
    "ticker": "SPY",
    "phase": "WHEEL_COMPLETE",
    "status": "closed",
    "strike": null,
    "expiration": null,
    "dte": null,
    "premium_collected": "540.0000",
    "effective_cost_basis": "418.6000"
  }
]
```

### Field Notes

| Field                  | Type                    | Nullable | Description                                                                              |
| ---------------------- | ----------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `id`                   | string (UUID)           | No       | Position UUID                                                                            |
| `ticker`               | string                  | No       | Equity symbol, uppercase                                                                 |
| `phase`                | string (enum)           | No       | Current `WheelPhase` value                                                               |
| `status`               | string (enum)           | No       | `active`, `paused`, or `closed`                                                          |
| `strike`               | string (Decimal)        | Yes      | Strike price from latest open leg; null if no active option                              |
| `expiration`           | string (date, ISO 8601) | Yes      | Expiration date from latest open leg; null if no active option                           |
| `dte`                  | integer                 | Yes      | Days to expiration computed as `(expiration − today).days`; null if `expiration` is null |
| `premium_collected`    | string (Decimal)        | No       | `total_premium_collected` from latest cost basis snapshot                                |
| `effective_cost_basis` | string (Decimal)        | No       | `basis_per_share` from latest cost basis snapshot                                        |

---

## Empty State — 200 OK

When no positions exist, returns an empty JSON array:

```json
[]
```

---

## No Error Responses Defined

This endpoint has no domain validation (read-only, no input). Standard FastAPI 500 applies for unexpected server errors.

---

## Pydantic Response Model

`list[PositionListItemResponse]` — new model to be added to `backend/app/api/schemas.py`.

## Route Registration

Add to the existing `router` in `backend/app/api/routes/positions.py`:

```python
@router.get("/positions", response_model=list[PositionListItemResponse], status_code=200)
async def list_positions(session: AsyncSession = Depends(get_session)) -> list[PositionListItemResponse]:
    ...
```
