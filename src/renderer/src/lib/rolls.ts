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
