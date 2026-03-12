// Cost basis math.
// Pure engine — no database or broker imports allowed here.
//
// Formula: assignment_strike - CSP_premiums - CC_premiums + roll_debits - roll_credits

import Decimal from 'decimal.js'

Decimal.set({ rounding: Decimal.ROUND_HALF_UP })

export interface CspLegInput {
  strike: string
  premiumPerContract: string
  contracts: number
}

export interface CostBasisResult {
  basisPerShare: string
  totalPremiumCollected: string
}

function round4(value: Decimal): Decimal {
  return value.toDecimalPlaces(4)
}

export function calculateInitialCspBasis(leg: CspLegInput): CostBasisResult {
  const strike = new Decimal(leg.strike)
  const premium = new Decimal(leg.premiumPerContract)

  const basisPerShare = round4(strike.minus(premium))
  const totalPremiumCollected = round4(premium.times(leg.contracts).times(100))

  return {
    basisPerShare: basisPerShare.toString(),
    totalPremiumCollected: totalPremiumCollected.toString()
  }
}
