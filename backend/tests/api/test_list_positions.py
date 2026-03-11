"""Tests for GET /api/positions endpoint."""

import datetime
import uuid
from decimal import Decimal

VALID_BODY = {
    "ticker": "AAPL",
    "strike": "180.00",
    "expiration": "2026-04-17",
    "contracts": 1,
    "premium_per_contract": "2.50",
}


# ---------------------------------------------------------------------------
# T001 — Schema + basic response shape
# ---------------------------------------------------------------------------


async def test_list_positions_empty_returns_200_with_empty_array(client):
    response = await client.get("/api/positions")
    assert response.status_code == 200
    assert response.json() == []


async def test_list_positions_single_csp_open_response_shape(client):
    await client.post("/api/positions", json=VALID_BODY)
    response = await client.get("/api/positions")
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    item = items[0]
    expected_keys = (
        "id",
        "ticker",
        "phase",
        "status",
        "strike",
        "expiration",
        "dte",
        "premium_collected",
        "effective_cost_basis",
    )
    for key in expected_keys:
        assert key in item, f"Missing key: {key}"


async def test_list_positions_dte_computed_correctly(client):
    await client.post("/api/positions", json=VALID_BODY)
    response = await client.get("/api/positions")
    item = response.json()[0]
    expected_dte = (datetime.date(2026, 4, 17) - datetime.date.today()).days
    assert isinstance(item["dte"], int)
    assert item["dte"] == expected_dte


async def test_list_positions_values_match_created_position(client):
    await client.post("/api/positions", json=VALID_BODY)
    response = await client.get("/api/positions")
    item = response.json()[0]
    assert item["strike"] == "180.0000"
    assert item["premium_collected"] == "250.0000"
    assert item["effective_cost_basis"] == "177.5000"


# ---------------------------------------------------------------------------
# T004 — Sort order, null DTE, all-positions inclusion
# ---------------------------------------------------------------------------


async def test_list_positions_sorted_by_dte_ascending(client):
    for body in [
        {**VALID_BODY, "ticker": "TSLA", "expiration": "2026-05-16"},
        {**VALID_BODY, "ticker": "AAPL", "expiration": "2026-04-17"},
        {**VALID_BODY, "ticker": "MSFT", "expiration": "2026-04-04"},
    ]:
        await client.post("/api/positions", json=body)

    response = await client.get("/api/positions")
    tickers = [item["ticker"] for item in response.json()]
    assert tickers == ["MSFT", "AAPL", "TSLA"]


async def test_list_positions_includes_all_positions(client):
    await client.post("/api/positions", json=VALID_BODY)
    await client.post("/api/positions", json={**VALID_BODY, "ticker": "MSFT"})
    response = await client.get("/api/positions")
    assert len(response.json()) == 2


async def test_list_positions_null_dte_for_no_active_leg(client, db_session):
    from app.core.types import StrategyType, WheelPhase, WheelStatus
    from app.models import CostBasisSnapshot, Position

    now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
    position_id = uuid.uuid4()
    position = Position(
        id=position_id,
        ticker="SPY",
        strategy_type=StrategyType.WHEEL,
        status=WheelStatus.closed,
        phase=WheelPhase.WHEEL_COMPLETE,
        opened_date=datetime.date(2026, 1, 1),
        tags=[],
        created_at=now,
        updated_at=now,
    )
    snapshot = CostBasisSnapshot(
        id=uuid.uuid4(),
        position_id=position_id,
        basis_per_share=Decimal("400.0000"),
        total_premium_collected=Decimal("540.0000"),
        snapshot_at=now,
        created_at=now,
    )
    db_session.add_all([position, snapshot])
    await db_session.commit()

    response = await client.get("/api/positions")
    items = response.json()
    spy = next(i for i in items if i["ticker"] == "SPY")
    assert spy["dte"] is None
    assert spy["strike"] is None
    assert spy["expiration"] is None


async def test_list_positions_null_dte_sorted_last(client, db_session):
    from app.core.types import StrategyType, WheelPhase, WheelStatus
    from app.models import CostBasisSnapshot, Position

    await client.post("/api/positions", json=VALID_BODY)

    now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
    position_id = uuid.uuid4()
    position = Position(
        id=position_id,
        ticker="SPY",
        strategy_type=StrategyType.WHEEL,
        status=WheelStatus.closed,
        phase=WheelPhase.WHEEL_COMPLETE,
        opened_date=datetime.date(2026, 1, 1),
        tags=[],
        created_at=now,
        updated_at=now,
    )
    snapshot = CostBasisSnapshot(
        id=uuid.uuid4(),
        position_id=position_id,
        basis_per_share=Decimal("400.0000"),
        total_premium_collected=Decimal("540.0000"),
        snapshot_at=now,
        created_at=now,
    )
    db_session.add_all([position, snapshot])
    await db_session.commit()

    response = await client.get("/api/positions")
    items = response.json()
    assert items[-1]["dte"] is None
    assert isinstance(items[0]["dte"], int)
