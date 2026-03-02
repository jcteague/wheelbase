"""Tests for POST /api/positions endpoint."""

import datetime

VALID_BODY = {
    "ticker": "AAPL",
    "strike": "150.00",
    "expiration": "2026-04-17",
    "contracts": 1,
    "premium_per_contract": "3.50",
}

TOMORROW = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()


# ---------------------------------------------------------------------------
# Happy path — 201 structure
# ---------------------------------------------------------------------------


async def test_create_position_returns_201(client):
    response = await client.post("/api/positions", json=VALID_BODY)
    assert response.status_code == 201


async def test_create_position_response_has_top_level_keys(client):
    response = await client.post("/api/positions", json=VALID_BODY)
    body = response.json()
    assert "position" in body
    assert "leg" in body
    assert "cost_basis_snapshot" in body


async def test_create_position_response_position_fields(client):
    response = await client.post("/api/positions", json=VALID_BODY)
    position = response.json()["position"]
    assert "id" in position
    assert "ticker" in position
    assert "phase" in position
    assert "status" in position
    assert position["ticker"] == "AAPL"
    assert position["phase"] == "CSP_OPEN"
    assert position["status"] == "active"


async def test_create_position_response_leg_fields(client):
    response = await client.post("/api/positions", json=VALID_BODY)
    leg = response.json()["leg"]
    assert "strike" in leg
    assert "premium_per_contract" in leg
    assert "contracts" in leg
    assert "expiration" in leg


async def test_create_position_response_cost_basis_fields(client):
    response = await client.post("/api/positions", json=VALID_BODY)
    snapshot = response.json()["cost_basis_snapshot"]
    assert "basis_per_share" in snapshot
    assert "total_premium_collected" in snapshot


async def test_create_position_without_fill_date_returns_201(client):
    """fill_date is optional — should default to today."""
    body = {k: v for k, v in VALID_BODY.items() if k != "fill_date"}
    response = await client.post("/api/positions", json=body)
    assert response.status_code == 201


# ---------------------------------------------------------------------------
# 400 — domain validation errors
# ---------------------------------------------------------------------------


async def test_create_position_invalid_ticker_returns_400(client):
    body = {**VALID_BODY, "ticker": "123"}
    response = await client.post("/api/positions", json=body)
    assert response.status_code == 400
    errors = response.json()["detail"]
    fields = [e["field"] for e in errors]
    assert "ticker" in fields


async def test_create_position_zero_strike_returns_400(client):
    body = {**VALID_BODY, "strike": "0"}
    response = await client.post("/api/positions", json=body)
    assert response.status_code == 400
    errors = response.json()["detail"]
    fields = [e["field"] for e in errors]
    assert "strike" in fields


async def test_create_position_future_fill_date_returns_400(client):
    body = {**VALID_BODY, "fill_date": TOMORROW}
    response = await client.post("/api/positions", json=body)
    assert response.status_code == 400
    errors = response.json()["detail"]
    fields = [e["field"] for e in errors]
    assert "fill_date" in fields


# ---------------------------------------------------------------------------
# 422 — FastAPI request validation (missing required fields)
# ---------------------------------------------------------------------------


async def test_create_position_missing_ticker_returns_422(client):
    body = {k: v for k, v in VALID_BODY.items() if k != "ticker"}
    response = await client.post("/api/positions", json=body)
    assert response.status_code == 422


async def test_create_position_missing_strike_returns_422(client):
    body = {k: v for k, v in VALID_BODY.items() if k != "strike"}
    response = await client.post("/api/positions", json=body)
    assert response.status_code == 422
