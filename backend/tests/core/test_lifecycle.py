"""Tests for lifecycle engine open_wheel function."""

import datetime
from decimal import Decimal

import pytest

from app.core.lifecycle import OpenWheelInput, OpenWheelResult, ValidationError, open_wheel
from app.core.types import WheelPhase

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TODAY = datetime.date.today()
TOMORROW = TODAY + datetime.timedelta(days=1)
YESTERDAY = TODAY - datetime.timedelta(days=1)
NEXT_MONTH = TODAY + datetime.timedelta(days=30)


def valid_input(**overrides) -> OpenWheelInput:
    defaults = dict(
        ticker="AAPL",
        strike=Decimal("150.00"),
        expiration=NEXT_MONTH,
        contracts=1,
        premium_per_contract=Decimal("3.50"),
        fill_date=TODAY,
        reference_date=TODAY,
    )
    defaults.update(overrides)
    return OpenWheelInput(**defaults)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_open_wheel_returns_csp_open_phase():
    result = open_wheel(valid_input())
    assert isinstance(result, OpenWheelResult)
    assert result.phase == WheelPhase.CSP_OPEN


# ---------------------------------------------------------------------------
# Ticker validation
# ---------------------------------------------------------------------------


def test_open_wheel_rejects_empty_ticker():
    with pytest.raises(ValidationError) as exc_info:
        open_wheel(valid_input(ticker=""))
    err = exc_info.value
    assert err.field == "ticker"
    assert err.code == "invalid_format"


def test_open_wheel_rejects_lowercase_ticker():
    with pytest.raises(ValidationError) as exc_info:
        open_wheel(valid_input(ticker="aapl"))
    err = exc_info.value
    assert err.field == "ticker"
    assert err.code == "invalid_format"


def test_open_wheel_rejects_ticker_too_long():
    with pytest.raises(ValidationError) as exc_info:
        open_wheel(valid_input(ticker="TOOLNG"))
    err = exc_info.value
    assert err.field == "ticker"
    assert err.code == "invalid_format"


def test_open_wheel_rejects_ticker_with_digits():
    with pytest.raises(ValidationError) as exc_info:
        open_wheel(valid_input(ticker="AA1"))
    err = exc_info.value
    assert err.field == "ticker"
    assert err.code == "invalid_format"


# ---------------------------------------------------------------------------
# Strike validation
# ---------------------------------------------------------------------------


def test_open_wheel_rejects_zero_strike():
    with pytest.raises(ValidationError) as exc_info:
        open_wheel(valid_input(strike=Decimal("0")))
    err = exc_info.value
    assert err.field == "strike"
    assert err.code == "must_be_positive"


def test_open_wheel_rejects_negative_strike():
    with pytest.raises(ValidationError) as exc_info:
        open_wheel(valid_input(strike=Decimal("-10.00")))
    err = exc_info.value
    assert err.field == "strike"
    assert err.code == "must_be_positive"


# ---------------------------------------------------------------------------
# Contracts validation
# ---------------------------------------------------------------------------


def test_open_wheel_rejects_zero_contracts():
    with pytest.raises(ValidationError) as exc_info:
        open_wheel(valid_input(contracts=0))
    err = exc_info.value
    assert err.field == "contracts"
    assert err.code == "must_be_positive_integer"


def test_open_wheel_rejects_negative_contracts():
    with pytest.raises(ValidationError) as exc_info:
        open_wheel(valid_input(contracts=-1))
    err = exc_info.value
    assert err.field == "contracts"
    assert err.code == "must_be_positive_integer"


# ---------------------------------------------------------------------------
# Premium validation
# ---------------------------------------------------------------------------


def test_open_wheel_rejects_zero_premium():
    with pytest.raises(ValidationError) as exc_info:
        open_wheel(valid_input(premium_per_contract=Decimal("0")))
    err = exc_info.value
    assert err.field == "premium_per_contract"
    assert err.code == "must_be_positive"


def test_open_wheel_rejects_negative_premium():
    with pytest.raises(ValidationError) as exc_info:
        open_wheel(valid_input(premium_per_contract=Decimal("-1.00")))
    err = exc_info.value
    assert err.field == "premium_per_contract"
    assert err.code == "must_be_positive"


# ---------------------------------------------------------------------------
# fill_date validation
# ---------------------------------------------------------------------------


def test_open_wheel_rejects_future_fill_date():
    with pytest.raises(ValidationError) as exc_info:
        open_wheel(valid_input(fill_date=TOMORROW))
    err = exc_info.value
    assert err.field == "fill_date"
    assert err.code == "cannot_be_future"


# ---------------------------------------------------------------------------
# Expiration validation
# ---------------------------------------------------------------------------


def test_open_wheel_rejects_expiration_same_as_fill_date():
    with pytest.raises(ValidationError) as exc_info:
        open_wheel(valid_input(fill_date=YESTERDAY, expiration=YESTERDAY))
    err = exc_info.value
    assert err.field == "expiration"
    assert err.code == "must_be_after_fill_date"


def test_open_wheel_rejects_expiration_before_fill_date():
    with pytest.raises(ValidationError) as exc_info:
        # fill_date=today, expiration=yesterday
        open_wheel(valid_input(fill_date=TODAY, expiration=YESTERDAY))
    err = exc_info.value
    assert err.field == "expiration"
    assert err.code == "must_be_after_fill_date"
