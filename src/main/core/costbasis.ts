// Cost basis math.
// Pure engine — no database or broker imports allowed here.
//
// Formula: assignment_strike - CSP_premiums - CC_premiums + roll_debits - roll_credits

import Decimal from 'decimal.js'

Decimal.set({ rounding: Decimal.ROUND_HALF_UP })

const SHARES_PER_CONTRACT = 100

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

function sharesFromContracts(contracts: number): number {
  return contracts * SHARES_PER_CONTRACT
}

function calculateCycleDays(positionOpenedDate: string, fillDate: string): number {
  const openedMs = new Date(positionOpenedDate).getTime()
  const fillMs = new Date(fillDate).getTime()
  return Math.round((fillMs - openedMs) / (1000 * 60 * 60 * 24))
}

export function calculateInitialCspBasis(leg: CspLegInput): CostBasisResult {
  const strike = new Decimal(leg.strike)
  const premium = new Decimal(leg.premiumPerContract)

  const basisPerShare = round4(strike.minus(premium))
  const totalPremiumCollected = round4(premium.times(sharesFromContracts(leg.contracts)))

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

  const finalPnl = round4(netPnlPerContract.times(sharesFromContracts(input.contracts)))
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
  label?: string
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
    (sum, leg) =>
      sum.plus(new Decimal(leg.premiumPerContract).times(sharesFromContracts(leg.contracts))),
    new Decimal(0)
  )

  const premiumWaterfall: WaterfallEntry[] = input.premiumLegs.map((leg) => ({
    label: leg.label ?? LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole,
    amount: leg.premiumPerContract
  }))

  return {
    basisPerShare: round4(strike.minus(totalPremiumPerShare)).toFixed(4),
    sharesHeld: sharesFromContracts(input.contracts),
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
  const totalCcIncome = premium.times(sharesFromContracts(input.contracts))
  const totalShares = sharesFromContracts(input.positionContracts)
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
  const finalPnl = round4(openPremium.times(sharesFromContracts(input.contracts)))

  return {
    finalPnl: finalPnl.toFixed(4),
    pnlPercentage: '100.0000'
  }
}

export interface CcCloseInput {
  openPremiumPerContract: string
  closePricePerContract: string
  contracts: number
}

export interface CcCloseResult {
  ccLegPnl: string
}

export function calculateCcClose(input: CcCloseInput): CcCloseResult {
  const open = new Decimal(input.openPremiumPerContract)
  const close = new Decimal(input.closePricePerContract)
  const ccLegPnl = round4(open.minus(close).times(sharesFromContracts(input.contracts)))
  return { ccLegPnl: ccLegPnl.toFixed(4) }
}

export interface CallAwayInput {
  ccStrike: string
  basisPerShare: string
  contracts: number
  positionOpenedDate: string
  fillDate: string
}

export interface CallAwayResult {
  finalPnl: string
  capitalDeployed: string
  cycleDays: number
  annualizedReturn: string
}

export interface RollBasisInput {
  prevBasisPerShare: string
  prevTotalPremiumCollected: string
  costToClosePerContract: string
  newPremiumPerContract: string
  contracts: number
  legType: 'CSP' | 'CC'
  prevStrike?: string
  newStrike?: string
}

export interface RollBasisResult {
  basisPerShare: string
  totalPremiumCollected: string
}

export function calculateRollBasis(input: RollBasisInput): RollBasisResult {
  if (
    input.legType === 'CSP' &&
    (input.prevStrike === undefined || input.newStrike === undefined)
  ) {
    throw new Error('calculateRollBasis: prevStrike and newStrike are required for CSP rolls')
  }

  const net = new Decimal(input.newPremiumPerContract).minus(input.costToClosePerContract)
  const prev = new Decimal(input.prevBasisPerShare)

  const isCspDifferentStrike = input.legType === 'CSP' && input.newStrike !== input.prevStrike

  const basisPerShare = isCspDifferentStrike
    ? round4(prev.plus(new Decimal(input.newStrike!).minus(input.prevStrike!)).minus(net))
    : round4(prev.minus(net))

  const netTotal = net.times(sharesFromContracts(input.contracts))
  const totalPremiumCollected = round4(new Decimal(input.prevTotalPremiumCollected).plus(netTotal))

  return {
    basisPerShare: basisPerShare.toFixed(4),
    totalPremiumCollected: totalPremiumCollected.toFixed(4)
  }
}

export function calculateCallAway(input: CallAwayInput): CallAwayResult {
  const ccStrike = new Decimal(input.ccStrike)
  const basisPerShare = new Decimal(input.basisPerShare)
  const sharesHeld = sharesFromContracts(input.contracts)

  const finalPnl = round4(ccStrike.minus(basisPerShare).times(sharesHeld))
  const capitalDeployed = round4(basisPerShare.times(sharesHeld))
  const cycleDays = calculateCycleDays(input.positionOpenedDate, input.fillDate)

  const annualizedReturn =
    cycleDays <= 0
      ? new Decimal('0')
      : round4(
          finalPnl
            .dividedBy(capitalDeployed)
            .times(new Decimal(365).dividedBy(cycleDays))
            .times(100)
        )

  return {
    finalPnl: finalPnl.toFixed(4),
    capitalDeployed: capitalDeployed.toFixed(4),
    cycleDays,
    annualizedReturn: annualizedReturn.toFixed(4)
  }
}
