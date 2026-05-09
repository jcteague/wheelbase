import Decimal from 'decimal.js'

export function fmtMoney(value: string): string {
  const amount = parseFloat(value)
  return amount < 0 ? `-$${Math.abs(amount).toFixed(2)}` : `$${amount.toFixed(2)}`
}

export function formatSignedMoney(value: string): string {
  const formatted = fmtMoney(value)
  return new Decimal(value).gte(0) ? `+${formatted}` : formatted
}

export function fmtPct(value: number): string {
  return `${Math.round(value)}%`
}

export function fmtDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

export function pnlColor(value: string): string {
  return parseFloat(value) >= 0 ? 'var(--wb-green)' : 'var(--wb-red)'
}

export function pnlClass(value: string): string {
  return parseFloat(value) >= 0 ? 'text-wb-green' : 'text-wb-red'
}

export function computeDte(expiration: string): number {
  const [year, month, day] = expiration.split('-').map(Number)
  const exp = Date.UTC(year, month - 1, day)
  const today = new Date()
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

  return Math.ceil((exp - todayUtc) / (1000 * 60 * 60 * 24))
}
