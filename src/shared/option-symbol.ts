// OCC option symbol builder.
// Pure engine — no database or broker imports allowed here.
//
// Format: <TICKER><YY><MM><DD><C|P><STRIKE * 1000, zero-padded to 8 digits>
// Example: AAPL260516P00180000 = AAPL 2026-05-16 PUT @ $180.00

import Decimal from 'decimal.js'

const EXPIRATION_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const STRIKE_SCALE = 1000
const STRIKE_WIDTH = 8

export interface BuildOccSymbolInput {
  ticker: string
  expiration: string // YYYY-MM-DD
  strike: string | number
  instrumentType: 'PUT' | 'CALL' | 'STOCK'
}

/**
 * Builds an OCC-standard option symbol string.
 *
 * Format: `<TICKER><YY><MM><DD><C|P><STRIKE * 1000, zero-padded to 8 digits>`
 *
 * @example
 * buildOccSymbol({ ticker: 'AAPL', expiration: '2026-05-16', strike: 180, instrumentType: 'PUT' })
 * // → 'AAPL260516P00180000'
 *
 * @throws if ticker is empty, expiration is not YYYY-MM-DD, strike is ≤ 0, or instrumentType is 'STOCK'
 */
export function buildOccSymbol(input: BuildOccSymbolInput): string {
  const ticker = input.ticker.trim().toUpperCase()
  if (ticker.length === 0) {
    throw new Error('Invalid ticker')
  }

  const expirationMatch = EXPIRATION_RE.exec(input.expiration)
  if (!expirationMatch) {
    throw new Error('Invalid expiration')
  }
  const [, yyyy, mm, dd] = expirationMatch
  const yy = yyyy.slice(2)

  const strikeDecimal = new Decimal(input.strike)
  if (!strikeDecimal.isFinite() || strikeDecimal.lte(0)) {
    throw new Error('Invalid strike')
  }
  const strikeInt = strikeDecimal.times(STRIKE_SCALE).toFixed(0).padStart(STRIKE_WIDTH, '0')

  const optionLetter = optionLetterFor(input.instrumentType)

  return `${ticker}${yy}${mm}${dd}${optionLetter}${strikeInt}`
}

function optionLetterFor(instrumentType: BuildOccSymbolInput['instrumentType']): 'P' | 'C' {
  switch (instrumentType) {
    case 'PUT':
      return 'P'
    case 'CALL':
      return 'C'
    default:
      throw new Error('Invalid instrumentType')
  }
}

// OCC symbol: <root><YY><MM><DD><P|C><strike × 1000, 8 digits> — e.g. AAPL260620P00180000.
const OCC_SYMBOL = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([PC])(\d{8})$/

export type OccIdentity = {
  underlying: string
  contractId: string
  strike: string
  expiration: string
  contractType: 'put' | 'call'
}

/**
 * Parses an OCC-standard option symbol into its identity fields.
 *
 * @example
 * parseOccSymbol('AAPL261009P00320000')
 * // → { underlying: 'AAPL', contractId: 'AAPL261009P00320000', strike: '320.0000',
 * //     expiration: '2026-10-09', contractType: 'put' }
 *
 * @returns `null` when the symbol does not match the OCC format
 */
export function parseOccSymbol(symbol: string): OccIdentity | null {
  const match = OCC_SYMBOL.exec(symbol)
  if (!match) return null
  const [, underlying, year, month, day, type, strikeThousandths] = match
  return {
    underlying,
    contractId: symbol,
    strike: (Number(strikeThousandths) / STRIKE_SCALE).toFixed(4),
    expiration: `20${year}-${month}-${day}`,
    contractType: type === 'P' ? 'put' : 'call'
  }
}
