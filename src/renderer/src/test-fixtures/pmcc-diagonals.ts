// [US-110] Renderer fixtures for ranked PMCC diagonals, valued Fri 2026-09-18 (short expiry
// 2026-10-23 = 35 DTE). XLF carries the data-model table's numbers verbatim; strikes arrive
// as the provider's 4-dp strings so a formatter that prints them raw is caught.
import type { PmccScreenerCandidate } from '../api/pmcc-screener'

export const XLF_DIAGONAL: PmccScreenerCandidate = {
  ticker: 'XLF',
  long: {
    contractId: 'XLF280121C00042000',
    strike: '42.0000',
    expiration: '2028-01-21',
    dte: 490,
    bid: '10.15',
    ask: '10.45',
    mark: '10.30',
    spreadAbsolute: '0.30',
    spreadPercent: '2.91',
    delta: '0.8100',
    openInterest: 640,
    volume: 12,
    timestamp: '2026-09-18T19:59:58.000Z'
  },
  short: {
    contractId: 'XLF261023C00053000',
    strike: '53.0000',
    expiration: '2026-10-23',
    dte: 35,
    bid: '0.62',
    ask: '0.66',
    mark: '0.64',
    spreadAbsolute: '0.04',
    spreadPercent: '6.25',
    delta: '0.2900',
    openInterest: 2140,
    volume: 310,
    timestamp: '2026-09-18T20:00:00.000Z'
  },
  netDebit: '9.66',
  capitalAtRisk: '966.00',
  strikeWidth: '11.00',
  debitToWidthPercent: '87.82',
  cycleYield: '0.0663',
  annualizedYield: '0.6909',
  returnPerDelta: '2.3824',
  longExtrinsic: '1.10',
  extrinsicCoverage: '0.5818',
  earnings: { status: 'clear' },
  timestamp: '2026-09-18T20:00:00.000Z',
  ivRank: {
    value: '32',
    percentile: '55',
    low: '0.1400',
    high: '0.2600',
    observedAt: '2026-09-17T20:00:00.000Z',
    ageTradingDays: 1,
    state: 'fresh'
  },
  ivRankAbsence: null
}

/** AAPL's diagonal from the data-model table: a qualifying pair its price condition holds
 *  back, and a per-spread debit large enough to need a thousands separator. */
export const AAPL_DIAGONAL: PmccScreenerCandidate = {
  ...XLF_DIAGONAL,
  ticker: 'AAPL',
  long: {
    ...XLF_DIAGONAL.long,
    contractId: 'AAPL270917C00140000',
    strike: '140.0000',
    expiration: '2027-09-17',
    dte: 364,
    bid: '45.68',
    ask: '46.13',
    mark: '45.90',
    spreadAbsolute: '0.45',
    spreadPercent: '0.98',
    delta: '0.8100',
    openInterest: 1120
  },
  short: {
    ...XLF_DIAGONAL.short,
    contractId: 'AAPL261023C00190000',
    strike: '190.0000',
    bid: '2.43',
    ask: '2.48',
    mark: '2.45',
    spreadAbsolute: '0.05',
    spreadPercent: '2.04',
    delta: '0.2700',
    openInterest: 6300
  },
  netDebit: '43.45',
  capitalAtRisk: '4345.00',
  strikeWidth: '50.00',
  debitToWidthPercent: '86.90',
  cycleYield: '0.0564',
  annualizedYield: '0.5880',
  returnPerDelta: '2.1778',
  longExtrinsic: '7.50',
  extrinsicCoverage: '0.3267'
}

/** Another ticker's diagonal — the XLF numbers under a different name, for tests that only
 *  care which ticker ranked where. */
export function diagonal(ticker: string): PmccScreenerCandidate {
  return { ...XLF_DIAGONAL, ticker }
}
