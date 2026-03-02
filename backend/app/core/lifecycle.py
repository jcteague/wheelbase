# Wheel phase state machine
# Pure engine — no database or broker imports allowed here.
# Takes plain dataclasses, returns results.

import datetime
import re
from dataclasses import dataclass
from decimal import Decimal

from app.core.types import WheelPhase


class ValidationError(ValueError):
    def __init__(self, field: str, code: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.code = code
        self.message = message


@dataclass(frozen=True)
class OpenWheelInput:
    ticker: str
    strike: Decimal
    expiration: datetime.date
    contracts: int
    premium_per_contract: Decimal
    fill_date: datetime.date
    reference_date: datetime.date


@dataclass(frozen=True)
class OpenWheelResult:
    phase: WheelPhase


_TICKER_RE = re.compile(r"^[A-Z]{1,5}$")


def open_wheel(inp: OpenWheelInput) -> OpenWheelResult:
    if not _TICKER_RE.match(inp.ticker):
        raise ValidationError("ticker", "invalid_format", "Ticker must be 1–5 uppercase letters")

    if inp.strike <= 0:
        raise ValidationError("strike", "must_be_positive", "Strike must be positive")

    if not isinstance(inp.contracts, int) or inp.contracts <= 0:
        raise ValidationError(
            "contracts", "must_be_positive_integer", "Contracts must be a positive integer"
        )

    if inp.premium_per_contract <= 0:
        raise ValidationError(
            "premium_per_contract", "must_be_positive", "Premium per contract must be positive"
        )

    if inp.fill_date > inp.reference_date:
        raise ValidationError("fill_date", "cannot_be_future", "Fill date cannot be in the future")

    if inp.expiration <= inp.fill_date:
        raise ValidationError(
            "expiration", "must_be_after_fill_date", "Expiration must be strictly after fill date"
        )

    return OpenWheelResult(phase=WheelPhase.CSP_OPEN)
