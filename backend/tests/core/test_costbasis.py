"""Tests for cost basis engine calculate_initial_csp_basis function."""

from decimal import Decimal

from app.core.costbasis import CostBasisResult, CspLegInput, calculate_initial_csp_basis


def test_basic_calculation_basis_per_share():
    leg = CspLegInput(
        strike=Decimal("150.00"),
        premium_per_contract=Decimal("3.50"),
        contracts=1,
    )
    result = calculate_initial_csp_basis(leg)
    assert result.basis_per_share == Decimal("146.5000")


def test_basic_calculation_total_premium_collected():
    leg = CspLegInput(
        strike=Decimal("150.00"),
        premium_per_contract=Decimal("3.50"),
        contracts=1,
    )
    result = calculate_initial_csp_basis(leg)
    assert result.total_premium_collected == Decimal("350.0000")


def test_multiple_contracts_total_premium():
    leg = CspLegInput(
        strike=Decimal("100.00"),
        premium_per_contract=Decimal("2.00"),
        contracts=5,
    )
    result = calculate_initial_csp_basis(leg)
    assert result.basis_per_share == Decimal("98.0000")
    assert result.total_premium_collected == Decimal("1000.0000")


def test_premium_larger_than_strike_produces_negative_basis():
    """Deep ITM edge case — premium exceeds strike; negative basis is valid."""
    leg = CspLegInput(
        strike=Decimal("10.00"),
        premium_per_contract=Decimal("12.00"),
        contracts=1,
    )
    result = calculate_initial_csp_basis(leg)
    assert result.basis_per_share == Decimal("-2.0000")
    assert result.total_premium_collected == Decimal("1200.0000")


def test_basis_per_share_rounds_half_up_to_4_places():
    # 100.00 - 0.33333 = 99.66667 → ROUND_HALF_UP to 4 places → 99.6667
    leg = CspLegInput(
        strike=Decimal("100.00"),
        premium_per_contract=Decimal("0.33333"),
        contracts=1,
    )
    result = calculate_initial_csp_basis(leg)
    assert result.basis_per_share == Decimal("99.6667")


def test_total_premium_collected_rounds_half_up_to_4_places():
    # 1.33335 * 3 * 100 = 400.005 → ROUND_HALF_UP to 4 places → 400.0050
    leg = CspLegInput(
        strike=Decimal("50.00"),
        premium_per_contract=Decimal("1.33335"),
        contracts=3,
    )
    result = calculate_initial_csp_basis(leg)
    assert result.total_premium_collected == Decimal("400.0050")


def test_high_precision_inputs():
    leg = CspLegInput(
        strike=Decimal("245.6789"),
        premium_per_contract=Decimal("4.1234"),
        contracts=2,
    )
    result = calculate_initial_csp_basis(leg)
    assert result.basis_per_share == Decimal("241.5555")
    assert result.total_premium_collected == Decimal("824.6800")


def test_returns_cost_basis_result_instance():
    leg = CspLegInput(
        strike=Decimal("100.00"),
        premium_per_contract=Decimal("2.00"),
        contracts=1,
    )
    result = calculate_initial_csp_basis(leg)
    assert isinstance(result, CostBasisResult)
