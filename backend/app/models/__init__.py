"""SQLAlchemy ORM models — Phase 1 entities."""

import datetime
import uuid
from decimal import Decimal

from sqlalchemy import (
    ARRAY,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.core.types import LegAction, LegRole, OptionType, StrategyType, WheelPhase, WheelStatus


def _utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker: Mapped[str] = mapped_column(String(10), nullable=False)
    strategy_type: Mapped[StrategyType] = mapped_column(nullable=False, default=StrategyType.WHEEL)
    status: Mapped[WheelStatus] = mapped_column(nullable=False, default=WheelStatus.active)
    phase: Mapped[WheelPhase] = mapped_column(nullable=False, default=WheelPhase.CSP_OPEN)
    opened_date: Mapped[datetime.date] = mapped_column(
        nullable=False,
        server_default=func.current_date(),
        default=datetime.date.today,
    )
    closed_date: Mapped[datetime.date | None] = mapped_column(nullable=True)
    account_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    thesis: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    created_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now(), default=_utc_now
    )

    legs: Mapped[list["Leg"]] = relationship(
        back_populates="position", cascade="all, delete-orphan"
    )
    cost_basis_snapshots: Mapped[list["CostBasisSnapshot"]] = relationship(
        back_populates="position", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_positions_status_phase", "status", "phase"),
        Index("ix_positions_ticker", "ticker"),
    )


class Leg(Base):
    __tablename__ = "legs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    position_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("positions.id"), nullable=False
    )
    leg_role: Mapped[LegRole] = mapped_column(nullable=False)
    action: Mapped[LegAction] = mapped_column(nullable=False)
    option_type: Mapped[OptionType] = mapped_column(nullable=False)
    strike: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    expiration: Mapped[datetime.date] = mapped_column(nullable=False)
    contracts: Mapped[int] = mapped_column(nullable=False)
    premium_per_contract: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    fill_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    fill_date: Mapped[datetime.date] = mapped_column(nullable=False)
    order_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    roll_chain_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now(), default=_utc_now
    )

    position: Mapped["Position"] = relationship(back_populates="legs")

    __table_args__ = (Index("ix_legs_position_id_fill_date", "position_id", "fill_date"),)


class CostBasisSnapshot(Base):
    __tablename__ = "cost_basis_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    position_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("positions.id"), nullable=False
    )
    basis_per_share: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    total_premium_collected: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    final_pnl: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    annualized_return: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    snapshot_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now(), default=_utc_now
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now(), default=_utc_now
    )

    position: Mapped["Position"] = relationship(back_populates="cost_basis_snapshots")
