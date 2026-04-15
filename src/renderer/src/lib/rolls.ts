export type RollPreview = {
  projectedBasis: string
  hasNetValues: boolean
}

export function getRollPreview({
  currentBasis,
  costToClose,
  newPremium
}: {
  currentBasis: string
  costToClose: string
  newPremium: string
}): RollPreview {
  const close = parseFloat(costToClose)
  const prem = parseFloat(newPremium)
  const hasNetValues = !isNaN(close) && !isNaN(prem) && close > 0 && prem > 0
  const netPerShare = hasNetValues ? prem - close : 0
  const projectedBasis = (parseFloat(currentBasis) - netPerShare).toFixed(2)
  return { projectedBasis, hasNetValues }
}

export type RollType = 'Roll Down & Out' | 'Roll Up & Out' | 'Roll Out'

export function getRollTypeLabel(currentStrike: string, newStrike: string): RollType {
  const current = parseFloat(currentStrike)
  const next = parseFloat(newStrike)
  if (next < current) return 'Roll Down & Out'
  if (next > current) return 'Roll Up & Out'
  return 'Roll Out'
}

export type NetCreditDebit = {
  net: number
  isCredit: boolean
  perContract: number
  total: number
}

export function computeNetCreditDebit(
  costToClose: number,
  newPremium: number,
  contracts: number
): NetCreditDebit {
  const net = newPremium - costToClose
  const isCredit = net >= 0
  return {
    net,
    isCredit,
    perContract: Math.abs(net),
    total: Math.abs(net) * contracts * 100
  }
}

export type RollCreditDebitColors = {
  color: string
  bg: string
  border: string
}

export function rollCreditDebitColors(isCredit: boolean): RollCreditDebitColors {
  return isCredit
    ? { color: 'var(--wb-green)', bg: 'var(--wb-green-dim)', border: 'var(--wb-green-border)' }
    : { color: 'var(--wb-gold)', bg: 'var(--wb-gold-dim)', border: 'var(--wb-gold-border)' }
}

export type CcRollType =
  | 'Roll Up & Out'
  | 'Roll Down & Out'
  | 'Roll Up'
  | 'Roll Down'
  | 'Roll Out'
  | 'No Change'

export interface CcRollTypeLabelInput {
  currentStrike: string
  newStrike: string
  currentExpiration: string
  newExpiration: string
}

export function getCcRollTypeLabel(input: CcRollTypeLabelInput): CcRollType {
  const current = parseFloat(input.currentStrike)
  const next = parseFloat(input.newStrike)
  const strikeChanged = next !== current
  const expirationChanged = input.newExpiration !== input.currentExpiration
  const strikeUp = next > current

  if (!strikeChanged && !expirationChanged) return 'No Change'
  if (!expirationChanged) return strikeUp ? 'Roll Up' : 'Roll Down'
  if (!strikeChanged) return 'Roll Out'
  return strikeUp ? 'Roll Up & Out' : 'Roll Down & Out'
}

export function getCcRollTypeColor(rollType: CcRollType): string {
  if (rollType === 'Roll Up & Out' || rollType === 'Roll Up') return 'var(--wb-purple)'
  if (rollType === 'Roll Out') return 'var(--wb-gold)'
  return 'var(--wb-red)'
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
] as const

function toMonthAbbr(dateStr: string): string {
  const idx = parseInt(dateStr.split('-')[1] ?? '0', 10) - 1
  return MONTHS[idx] ?? ''
}

export function getCcRollTypeDetail(input: CcRollTypeLabelInput): string {
  const currentS = parseFloat(input.currentStrike)
  const newS = parseFloat(input.newStrike)
  const strikeChanged = newS !== currentS
  const expirationChanged = input.newExpiration !== input.currentExpiration

  const strikePart = strikeChanged ? `$${currentS} → $${newS} strike` : `same $${currentS} strike`

  const expirationPart = expirationChanged
    ? `${toMonthAbbr(input.currentExpiration)} → ${toMonthAbbr(input.newExpiration)} expiration`
    : `same ${toMonthAbbr(input.currentExpiration)} expiration`

  return `${strikePart}, ${expirationPart}`
}
