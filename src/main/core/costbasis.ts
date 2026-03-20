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

export interface CspCloseInput {
  openPremiumPerContract: string
  closePricePerContract: string
  contracts: number
}

export interface CspCloseResult {
  finalPnl: string
  pnlPercentage: string
}

export interface CspExpirationInput {
  openPremiumPerContract: string
  contracts: number
}

export interface CspExpirationResult {
  finalPnl: string
  pnlPercentage: string
}

export function calculateCspClose(input: CspCloseInput): CspCloseResult {
  const openPremium = new Decimal(input.openPremiumPerContract)
  const closePrice = new Decimal(input.closePricePerContract)
  const netPnlPerContract = openPremium.minus(closePrice)

  const finalPnl = round4(netPnlPerContract.times(input.contracts).times(100))
  const pnlPercentage = round4(netPnlPerContract.dividedBy(openPremium).times(100))

  return {
    finalPnl: finalPnl.toFixed(4),
    pnlPercentage: pnlPercentage.toFixed(4)
  }
}

export interface AssignmentBasisLeg {
  legRole: string
  premiumPerContract: string
  contracts: number
}

export interface AssignmentBasisInput {
  strike: string
  contracts: number
  premiumLegs: AssignmentBasisLeg[]
}

export interface WaterfallEntry {
  label: string
  amount: string
}

export interface AssignmentBasisResult {
  basisPerShare: string
  sharesHeld: number
  totalPremiumCollected: string
  premiumWaterfall: WaterfallEntry[]
}

const LEG_ROLE_LABEL: Record<string, string> = {
  CSP_OPEN: 'CSP premium',
  ROLL_TO: 'Roll credit'
}

export function calculateAssignmentBasis(input: AssignmentBasisInput): AssignmentBasisResult {
  const strike = new Decimal(input.strike)

  const totalPremiumPerShare = input.premiumLegs.reduce(
    (sum, leg) => sum.plus(new Decimal(leg.premiumPerContract)),
    new Decimal(0)
  )

  const totalPremiumCollected = input.premiumLegs.reduce(
    (sum, leg) => sum.plus(new Decimal(leg.premiumPerContract).times(leg.contracts).times(100)),
    new Decimal(0)
  )

  const premiumWaterfall: WaterfallEntry[] = input.premiumLegs.map((leg) => ({
    label: LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole,
    amount: leg.premiumPerContract
  }))

  return {
    basisPerShare: round4(strike.minus(totalPremiumPerShare)).toFixed(4),
    sharesHeld: input.contracts * 100,
    totalPremiumCollected: round4(totalPremiumCollected).toFixed(4),
    premiumWaterfall
  }
}

export interface CcOpenBasisInput {
  prevBasisPerShare: string
  prevTotalPremiumCollected: string
  ccPremiumPerContract: string
  contracts: number
  positionContracts: number
}

export interface CcOpenBasisResult {
  basisPerShare: string
  totalPremiumCollected: string
}

export function calculateCcOpenBasis(input: CcOpenBasisInput): CcOpenBasisResult {
  const prev = new Decimal(input.prevBasisPerShare)
  const premium = new Decimal(input.ccPremiumPerContract)
  const prevTotal = new Decimal(input.prevTotalPremiumCollected)

  // Prorate per-share basis reduction: total CC income spread across all shares held
  const totalCcIncome = premium.times(input.contracts).times(100)
  const totalShares = input.positionContracts * 100
  const basisReductionPerShare = totalCcIncome.dividedBy(totalShares)
  const basisPerShare = round4(prev.minus(basisReductionPerShare))
  const totalPremiumCollected = round4(prevTotal.plus(totalCcIncome))

  return {
    basisPerShare: basisPerShare.toFixed(4),
    totalPremiumCollected: totalPremiumCollected.toFixed(4)
  }
}

export function calculateCspExpiration(input: CspExpirationInput): CspExpirationResult {
  const openPremium = new Decimal(input.openPremiumPerContract)

  // CSP expires worthless: we keep 100% of the premium
  const finalPnl = round4(openPremium.times(input.contracts).times(100))

  return {
    finalPnl: finalPnl.toFixed(4),
    pnlPercentage: '100.0000'
  }
}
