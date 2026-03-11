"""Pydantic v2 request/response schemas for the Wheelbase API."""

import datetime
import uuid
from decimal import Decimal

from pydantic import BaseModel

from app.core.types import LegAction, LegRole, OptionType, StrategyType, WheelPhase, WheelStatus

# -- Request ------------------------------------------------------------------


class CreatePositionRequest(BaseModel):
    ticker: str
    strike: Decimal
    expiration: datetime.date
    contracts: int
    premium_per_contract: Decimal
    fill_date: datetime.date | None = None
    account_id: str | None = None
    thesis: str | None = None
    notes: str | None = None


# -- Responses ----------------------------------------------------------------


class PositionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    ticker: str
    strategy_type: StrategyType
    status: WheelStatus
    phase: WheelPhase
    opened_date: datetime.date
    closed_date: datetime.date | None = None
    account_id: str | None = None
    notes: str | None = None
    thesis: str | None = None
    tags: list[str]
    created_at: datetime.datetime
    updated_at: datetime.datetime


class LegResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    position_id: uuid.UUID
    leg_role: LegRole
    action: LegAction
    option_type: OptionType
    strike: Decimal
    expiration: datetime.date
    contracts: int
    premium_per_contract: Decimal
    fill_price: Decimal | None = None
    fill_date: datetime.date
    order_id: str | None = None
    roll_chain_id: str | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class CostBasisSnapshotResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    position_id: uuid.UUID
    basis_per_share: Decimal
    total_premium_collected: Decimal
    final_pnl: Decimal | None = None
    annualized_return: Decimal | None = None
    snapshot_at: datetime.datetime
    created_at: datetime.datetime


class CreatePositionResponse(BaseModel):
    position: PositionResponse
    leg: LegResponse
    cost_basis_snapshot: CostBasisSnapshotResponse


class PositionListItemResponse(BaseModel):
    model_config = {"from_attributes": False}

    id: uuid.UUID
    ticker: str
    phase: WheelPhase
    status: WheelStatus
    strike: Decimal | None
    expiration: datetime.date | None
    dte: int | None
    premium_collected: Decimal
    effective_cost_basis: Decimal


# -- Errors -------------------------------------------------------------------


class FieldError(BaseModel):
    field: str
    code: str
    message: str


class ValidationErrorResponse(BaseModel):
    detail: list[FieldError]
