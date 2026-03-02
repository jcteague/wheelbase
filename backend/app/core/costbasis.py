# Cost basis math
# Pure engine — no database or broker imports allowed here.
# Takes plain dataclasses, returns results.
#
# Formula: assignment_strike - CSP_premiums - CC_premiums + roll_debits - roll_credits

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal


@dataclass(frozen=True)
class CspLegInput:
    strike: Decimal
    premium_per_contract: Decimal
    contracts: int


@dataclass(frozen=True)
class CostBasisResult:
    basis_per_share: Decimal
    total_premium_collected: Decimal


def _round4(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def calculate_initial_csp_basis(leg: CspLegInput) -> CostBasisResult:
    basis_per_share = _round4(leg.strike - leg.premium_per_contract)
    total_premium_collected = _round4(leg.premium_per_contract * leg.contracts * 100)
    return CostBasisResult(
        basis_per_share=basis_per_share,
        total_premium_collected=total_premium_collected,
    )
