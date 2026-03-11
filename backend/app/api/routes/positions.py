"""Positions routes — open a new wheel and list all positions."""

import datetime
import uuid
from decimal import Decimal

import structlog
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.schemas import (
    CreatePositionRequest,
    CreatePositionResponse,
    FieldError,
    PositionListItemResponse,
    ValidationErrorResponse,
)
from app.core.costbasis import CspLegInput, calculate_initial_csp_basis
from app.core.lifecycle import OpenWheelInput, ValidationError, open_wheel
from app.core.types import LegAction, LegRole, OptionType, StrategyType, WheelStatus
from app.db import get_session
from app.models import CostBasisSnapshot, Leg, Position

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.get("/positions", response_model=list[PositionListItemResponse])
async def list_positions(
    session: AsyncSession = Depends(get_session),
) -> list[PositionListItemResponse]:
    logger.debug("list_positions_query_start")

    stmt = select(Position).options(
        selectinload(Position.legs),
        selectinload(Position.cost_basis_snapshots),
    )
    result = await session.execute(stmt)
    positions = result.scalars().all()

    logger.debug("list_positions_query_complete", count=len(positions))

    items: list[PositionListItemResponse] = []
    for position in positions:
        active_leg = _active_leg(position)
        latest_snapshot = _latest_snapshot(position)

        strike = active_leg.strike if active_leg else None
        expiration = active_leg.expiration if active_leg else None
        dte = (expiration - datetime.date.today()).days if expiration else None

        items.append(
            PositionListItemResponse(
                id=position.id,
                ticker=position.ticker,
                phase=position.phase,
                status=position.status,
                strike=strike,
                expiration=expiration,
                dte=dte,
                premium_collected=(
                    latest_snapshot.total_premium_collected if latest_snapshot else Decimal(0)
                ),
                effective_cost_basis=(
                    latest_snapshot.basis_per_share if latest_snapshot else Decimal(0)
                ),
            )
        )

    # Positions with a known DTE sort ascending; null-DTE positions sort last.
    items.sort(key=_dte_sort_key)

    logger.info("positions_listed", count=len(items))
    return items


def _dte_sort_key(item: PositionListItemResponse) -> tuple[bool, int]:
    """Sort key: positions with DTE ascending first, null-DTE last."""
    return (item.dte is None, item.dte if item.dte is not None else 0)


def _active_leg(position: Position) -> Leg | None:
    open_legs = [leg for leg in position.legs if leg.action == LegAction.open]
    if not open_legs:
        return None
    return max(open_legs, key=lambda leg: leg.fill_date)


def _latest_snapshot(position: Position) -> CostBasisSnapshot | None:
    if not position.cost_basis_snapshots:
        return None
    return max(position.cost_basis_snapshots, key=lambda s: s.snapshot_at)


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

    logger.debug(
        "create_position_inputs",
        ticker=body.ticker,
        strike=str(body.strike),
        expiration=str(body.expiration),
        contracts=body.contracts,
        premium_per_contract=str(body.premium_per_contract),
        fill_date=str(fill_date),
    )

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
        logger.info(
            "position_validation_failed",
            field=exc.field,
            code=exc.code,
            ticker=body.ticker,
        )
        return JSONResponse(
            status_code=400,
            content=ValidationErrorResponse(
                detail=[FieldError(field=exc.field, code=exc.code, message=exc.message)]
            ).model_dump(),
        )

    logger.debug("lifecycle_validated", phase=lifecycle_result.phase.value)

    basis_result = calculate_initial_csp_basis(
        CspLegInput(
            strike=body.strike,
            premium_per_contract=body.premium_per_contract,
            contracts=body.contracts,
        )
    )
    logger.debug(
        "cost_basis_calculated",
        basis_per_share=str(basis_result.basis_per_share),
        total_premium_collected=str(basis_result.total_premium_collected),
    )

    position_id = uuid.uuid4()
    leg_id = uuid.uuid4()
    snapshot_id = uuid.uuid4()

    logger.debug(
        "db_write_start",
        position_id=str(position_id),
        leg_id=str(leg_id),
        snapshot_id=str(snapshot_id),
    )
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
        logger.debug("db_flush_ok", position_id=str(position_id))
        await session.refresh(position)
        await session.refresh(leg)
        await session.refresh(snapshot)

    logger.info(
        "position_created",
        position_id=str(position_id),
        ticker=body.ticker,
        phase=lifecycle_result.phase.value,
        contracts=body.contracts,
        strike=str(body.strike),
        basis_per_share=str(basis_result.basis_per_share),
        total_premium_collected=str(basis_result.total_premium_collected),
    )

    return CreatePositionResponse(
        position=position,
        leg=leg,
        cost_basis_snapshot=snapshot,
    )
