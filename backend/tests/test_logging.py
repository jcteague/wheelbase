"""Tests for structured logging behaviour."""

from unittest.mock import patch

import pytest
import structlog
import structlog.testing  # noqa: F401 - used implicitly via structlog.testing.capture_logs

VALID_BODY = {
    "ticker": "AAPL",
    "strike": "150.00",
    "expiration": "2026-04-17",
    "contracts": 1,
    "premium_per_contract": "3.50",
}

INVALID_BODY = {
    **VALID_BODY,
    "ticker": "123",  # fails lifecycle validation
}


async def test_position_created_log_emitted(client):
    with structlog.testing.capture_logs() as logs:
        response = await client.post("/api/positions", json=VALID_BODY)

    assert response.status_code == 201
    events = [r["event"] for r in logs]
    assert "position_created" in events

    record = next(r for r in logs if r["event"] == "position_created")
    assert record["ticker"] == "AAPL"
    assert "position_id" in record
    assert "basis_per_share" in record


async def test_validation_failure_log_emitted(client):
    with structlog.testing.capture_logs() as logs:
        response = await client.post("/api/positions", json=INVALID_BODY)

    assert response.status_code == 400
    events = [r["event"] for r in logs]
    assert "position_validation_failed" in events

    record = next(r for r in logs if r["event"] == "position_validation_failed")
    assert record["log_level"] == "info"
    assert record["ticker"] == "123"


async def test_http_request_and_response_logged(client):
    with structlog.testing.capture_logs() as logs:
        await client.post("/api/positions", json=VALID_BODY)

    events = [r["event"] for r in logs]
    assert "http_request_received" in events
    assert "http_response" in events

    response_record = next(r for r in logs if r["event"] == "http_response")
    assert "http_status" in response_record
    assert "duration_ms" in response_record


async def test_request_id_consistent_within_request(client):
    # Pass merge_contextvars so context-bound fields (request_id, etc.) appear in records
    with structlog.testing.capture_logs(
        processors=[structlog.contextvars.merge_contextvars]
    ) as logs:
        await client.post("/api/positions", json=VALID_BODY)

    request_ids = {r.get("request_id") for r in logs if "request_id" in r}
    # All records within one request should share the same request_id
    assert len(request_ids) == 1
    assert None not in request_ids


async def test_unhandled_exception_logged_as_error(client):
    # Starlette's ServerErrorMiddleware always re-raises after handling, so the
    # exception propagates to the test client. Wrap with pytest.raises and verify
    # that an error-level log record was emitted before the re-raise.
    with patch(
        "app.api.routes.positions.calculate_initial_csp_basis",
        side_effect=RuntimeError("boom"),
    ):
        with structlog.testing.capture_logs() as logs:
            with pytest.raises(RuntimeError, match="boom"):
                await client.post("/api/positions", json=VALID_BODY)

    error_records = [r for r in logs if r.get("log_level") == "error"]
    assert any(
        "unhandled_exception" in r["event"] or "exception" in r["event"].lower()
        for r in error_records
    )
