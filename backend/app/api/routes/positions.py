"""POST /positions — open a new wheel (sell a CSP)."""

import datetime
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import (
    CreatePositionRequest,
    CreatePositionResponse,
    FieldError,
    ValidationErrorResponse,
)
from app.core.costbasis import CspLegInput, calculate_initial_csp_basis
from app.core.lifecycle import OpenWheelInput, ValidationError, open_wheel
from app.core.types import LegAction, LegRole, OptionType, StrategyType, WheelStatus
from app.db import get_session
from app.models import CostBasisSnapshot, Leg, Position

router = APIRouter()


@router.post(
    "/positions",
    response_model=CreatePositionResponse,
    status_code=201,
    responses={400: {"model": ValidationErrorResponse}},
)
async def create_position(
    body: CreatePositionRequest,
    session: AsyncSession = Depends(get_session),
) -> CreatePositionResponse | JSONResponse:
    fill_date = body.fill_date or datetime.date.today()
    now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)

    try:
        lifecycle_result = open_wheel(
            OpenWheelInput(
                ticker=body.ticker,
                strike=body.strike,
                expiration=body.expiration,
                contracts=body.contracts,
                premium_per_contract=body.premium_per_contract,
                fill_date=fill_date,
                reference_date=datetime.date.today(),
            )
        )
    except ValidationError as exc:
        return JSONResponse(
            status_code=400,
            content=ValidationErrorResponse(
                detail=[FieldError(field=exc.field, code=exc.code, message=exc.message)]
            ).model_dump(),
        )

    basis_result = calculate_initial_csp_basis(
        CspLegInput(
            strike=body.strike,
            premium_per_contract=body.premium_per_contract,
            contracts=body.contracts,
        )
    )

    position_id = uuid.uuid4()
    leg_id = uuid.uuid4()
    snapshot_id = uuid.uuid4()

    async with session.begin():
        position = Position(
            id=position_id,
            ticker=body.ticker,
            strategy_type=StrategyType.WHEEL,
            status=WheelStatus.active,
            phase=lifecycle_result.phase,
            opened_date=fill_date,
            account_id=body.account_id,
            thesis=body.thesis,
            notes=body.notes,
            tags=[],
            created_at=now,
            updated_at=now,
        )
        leg = Leg(
            id=leg_id,
            position_id=position_id,
            leg_role=LegRole.csp,
            action=LegAction.open,
            option_type=OptionType.put,
            strike=body.strike,
            expiration=body.expiration,
            contracts=body.contracts,
            premium_per_contract=body.premium_per_contract,
            fill_date=fill_date,
            created_at=now,
            updated_at=now,
        )
        snapshot = CostBasisSnapshot(
            id=snapshot_id,
            position_id=position_id,
            basis_per_share=basis_result.basis_per_share,
            total_premium_collected=basis_result.total_premium_collected,
            snapshot_at=now,
            created_at=now,
        )
        session.add_all([position, leg, snapshot])
        await session.flush()
        await session.refresh(position)
        await session.refresh(leg)
        await session.refresh(snapshot)

    return CreatePositionResponse(
        position=position,
        leg=leg,
        cost_basis_snapshot=snapshot,
    )
