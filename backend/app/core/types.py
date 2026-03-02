"""Shared enums used across engines, models, and API.
Lives in core/ so pure engines can import without touching SQLAlchemy.
"""

from enum import Enum


class StrategyType(str, Enum):
    WHEEL = "WHEEL"


class WheelStatus(str, Enum):
    active = "active"
    paused = "paused"
    closed = "closed"


class WheelPhase(str, Enum):
    CSP_OPEN = "CSP_OPEN"
    CSP_EXPIRED = "CSP_EXPIRED"
    CSP_CLOSED_PROFIT = "CSP_CLOSED_PROFIT"
    CSP_CLOSED_LOSS = "CSP_CLOSED_LOSS"
    HOLDING_SHARES = "HOLDING_SHARES"
    CC_OPEN = "CC_OPEN"
    CC_EXPIRED = "CC_EXPIRED"
    CC_CLOSED_PROFIT = "CC_CLOSED_PROFIT"
    CC_CLOSED_LOSS = "CC_CLOSED_LOSS"
    WHEEL_COMPLETE = "WHEEL_COMPLETE"


class LegRole(str, Enum):
    csp = "csp"
    short_cc = "short_cc"
    stock_assignment = "stock_assignment"


class LegAction(str, Enum):
    open = "open"
    close = "close"
    expire = "expire"
    assign = "assign"
    exercise = "exercise"
    roll_from = "roll_from"
    roll_to = "roll_to"


class OptionType(str, Enum):
    put = "put"
    call = "call"
    stock = "stock"
