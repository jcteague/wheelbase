// [US-18] The story's Background wheels on 2027-08-13: MSFT CC_OPEN, AAPL CSP_OPEN, NVDA
// HOLDING_SHARES and the closed TSLA, the XYZ PMCC, plus a snapshot builder for the option
// quotes.
// [US-108] The OPT-16 PMCC states on 2026-11-06 (XYZ_BACKGROUND and its variants), with
// per-leg snapshot and stock-quote builders.
import type { OptionSnapshot, OptionSnapshotsBySymbol, StockQuote } from '../api/market-data'
import type {
  PmccListItem,
  PmccLongLegSummary,
  PmccShortLegSummary,
  WheelListItem
} from '../api/positions'
import { occSymbolForLeg } from '../../../shared/option-symbol'

export const AAPL: WheelListItem = {
  id: 'pos-aapl',
  ticker: 'AAPL',
  phase: 'CSP_OPEN',
  status: 'ACTIVE',
  strategyType: 'WHEEL',
  pmcc: null,
  strike: '180.0000',
  expiration: '2027-09-12',
  dte: 30,
  instrumentType: 'PUT',
  contracts: 1,
  entryPremiumPerContract: '3.5000',
  premiumCollected: '350.0000',
  effectiveCostBasis: '176.5000',
  profitTargetPercent: null,
  nextEarnings: null
}

export const MSFT: WheelListItem = {
  ...AAPL,
  id: 'pos-msft',
  ticker: 'MSFT',
  phase: 'CC_OPEN',
  strike: '430.0000',
  expiration: '2027-08-23',
  dte: 10,
  instrumentType: 'CALL',
  entryPremiumPerContract: '2.8000',
  premiumCollected: '280.0000',
  effectiveCostBasis: '402.4000'
}

export const NVDA: WheelListItem = {
  ...AAPL,
  id: 'pos-nvda',
  ticker: 'NVDA',
  phase: 'HOLDING_SHARES',
  strike: null,
  expiration: null,
  dte: null,
  instrumentType: null,
  contracts: null,
  entryPremiumPerContract: null,
  premiumCollected: '640.0000',
  effectiveCostBasis: '118.6000'
}

export const TSLA: WheelListItem = {
  ...NVDA,
  id: 'pos-tsla',
  ticker: 'TSLA',
  phase: 'WHEEL_COMPLETE',
  status: 'CLOSED',
  premiumCollected: '1240.0000',
  effectiveCostBasis: '236.4000'
}

export const XYZ: PmccListItem = {
  id: 'pmcc-xyz',
  ticker: 'XYZ',
  phase: 'PMCC_OPEN',
  status: 'ACTIVE',
  strategyType: 'PMCC',
  pmcc: {
    legs: [
      {
        legId: 'xyz-leaps',
        side: 'LONG',
        strike: '80.0000',
        expiration: '2028-01-21',
        dte: 161,
        contracts: 1,
        fillPerShare: '22.5000'
      },
      {
        legId: 'xyz-short',
        side: 'SHORT',
        strike: '118.0000',
        expiration: '2027-08-20',
        dte: 7,
        contracts: 1,
        fillPerShare: '1.4000'
      }
    ],
    cycles: 9,
    entryDebit: { perShare: '20.5000', total: '2050.0000' },
    openedAt: '2026-09-14',
    managementWindowDte: 21,
    basisPerShare: '6.5500',
    basisTotal: '655.0000',
    leapsCostPerShare: '22.5000',
    shortCreditsPerShare: '15.9500',
    shortCreditsTotal: '1595.0000',
    premiumRecoveredPercent: '70.8889'
  },
  strike: null,
  expiration: null,
  dte: null,
  instrumentType: null,
  contracts: null,
  entryPremiumPerContract: null,
  premiumCollected: '1595.0000',
  effectiveCostBasis: '655.0000',
  profitTargetPercent: null,
  nextEarnings: null
}

export const AAPL_QUOTE: StockQuote = {
  price: '182.45',
  bid: '182.44',
  ask: '182.46',
  prevClose: '181.00',
  volume: 0,
  timestamp: '2027-08-13T14:00:00Z'
}

/** An option quote; `delta` adds a full greeks block, as the provider sends all four or none. */
export function optionSnapshot(
  bid: string,
  ask: string,
  mid: string,
  delta?: string
): OptionSnapshot {
  return {
    bid,
    ask,
    mid,
    lastTrade: mid,
    openInterest: 1000,
    volume: 500,
    ...(delta === undefined
      ? {}
      : { greeks: { delta, gamma: '0.0100', theta: '-0.0200', vega: '0.1500' } }),
    timestamp: '2027-08-13T14:00:00Z'
  }
}

// ---------------------------------------------------------------------------
// [US-108] OPT-16 Background, valuation date 2026-11-06: one $80.00 LEAPS (exp 2027-09-17,
// 315 DTE, bought $25.00) and one $108.00 short call (exp 2026-11-20, 14 DTE, sold $1.80).
// Short history: entry short $1.80, two $0.10 shorts, then the open $108 @ $1.80 — 4 cycles,
// credits $3.80, basis $21.20, entry net debit $25.00 − $1.80 = $23.20.
// ---------------------------------------------------------------------------

export const XYZ_LEAPS_LEG: PmccLongLegSummary = {
  legId: 'xyz-leaps',
  side: 'LONG',
  strike: '80.0000',
  expiration: '2027-09-17',
  dte: 315,
  contracts: 1,
  fillPerShare: '25.0000'
}

export const XYZ_SHORT_LEG: PmccShortLegSummary = {
  legId: 'xyz-short',
  side: 'SHORT',
  strike: '108.0000',
  expiration: '2026-11-20',
  dte: 14,
  contracts: 1,
  fillPerShare: '1.8000'
}

export const XYZ_BACKGROUND: PmccListItem = {
  ...XYZ,
  pmcc: {
    legs: [XYZ_LEAPS_LEG, XYZ_SHORT_LEG],
    cycles: 4,
    entryDebit: { perShare: '23.2000', total: '2320.0000' },
    openedAt: '2026-04-17',
    managementWindowDte: 21,
    basisPerShare: '21.2000',
    basisTotal: '2120.0000',
    leapsCostPerShare: '25.0000',
    shortCreditsPerShare: '3.8000',
    shortCreditsTotal: '380.0000',
    premiumRecoveredPercent: '15.2000'
  },
  premiumCollected: '380.0000',
  effectiveCostBasis: '2120.0000'
}

/** 2026-10-19: the $110.00 short expired worthless; basis $23.00, credits $2.00, 2 cycles. */
export const XYZ_LEAPS_ONLY: PmccListItem = {
  ...XYZ_BACKGROUND,
  pmcc: {
    ...XYZ_BACKGROUND.pmcc,
    legs: [{ ...XYZ_LEAPS_LEG, dte: 333 }],
    cycles: 2,
    basisPerShare: '23.0000',
    basisTotal: '2300.0000',
    shortCreditsPerShare: '2.0000',
    shortCreditsTotal: '200.0000',
    premiumRecoveredPercent: '8.0000'
  },
  premiumCollected: '200.0000',
  effectiveCostBasis: '2300.0000'
}

/**
 * 2027-11-08: the LEAPS rolled to a $85.00 call exp 2028-01-21 (LEAPS cost to date $22.50),
 * credits $22.90, so the basis is -$0.40 a share; an open $120.00 short.
 */
export const XYZ_PAID_FOR: PmccListItem = {
  ...XYZ_BACKGROUND,
  pmcc: {
    ...XYZ_BACKGROUND.pmcc,
    legs: [
      {
        ...XYZ_LEAPS_LEG,
        legId: 'xyz-leaps-85',
        strike: '85.0000',
        expiration: '2028-01-21',
        dte: 74,
        fillPerShare: '30.0000'
      },
      {
        ...XYZ_SHORT_LEG,
        legId: 'xyz-short-120',
        strike: '120.0000',
        expiration: '2027-12-17',
        dte: 39,
        fillPerShare: '1.5000'
      }
    ],
    cycles: 12,
    basisPerShare: '-0.4000',
    basisTotal: '-40.0000',
    leapsCostPerShare: '22.5000',
    shortCreditsPerShare: '22.9000',
    shortCreditsTotal: '2290.0000',
    premiumRecoveredPercent: '101.7778'
  },
  premiumCollected: '2290.0000',
  effectiveCostBasis: '-40.0000'
}

/** The Background opened with 3 contracts on each leg at the same per-share fills. */
export const XYZ_THREE_CONTRACTS: PmccListItem = {
  ...XYZ_BACKGROUND,
  pmcc: {
    ...XYZ_BACKGROUND.pmcc,
    legs: [
      { ...XYZ_LEAPS_LEG, contracts: 3 },
      { ...XYZ_SHORT_LEG, contracts: 3 }
    ],
    entryDebit: { perShare: '23.2000', total: '6960.0000' },
    basisTotal: '6360.0000',
    shortCreditsTotal: '1140.0000'
  },
  premiumCollected: '1140.0000',
  effectiveCostBasis: '6360.0000'
}

export const XYZ_SHORT_112_LEG: PmccShortLegSummary = {
  ...XYZ_SHORT_LEG,
  legId: 'xyz-short-112',
  strike: '112.0000',
  expiration: '2026-12-18',
  dte: 42,
  fillPerShare: '1.3500'
}

/** 2 LEAPS contracts against a $108.00 (14 DTE) and a $112.00 (42 DTE) short, one each. */
export const XYZ_TWO_SHORTS: PmccListItem = {
  ...XYZ_BACKGROUND,
  pmcc: {
    ...XYZ_BACKGROUND.pmcc,
    legs: [{ ...XYZ_LEAPS_LEG, contracts: 2 }, XYZ_SHORT_LEG, XYZ_SHORT_112_LEG],
    basisTotal: '4240.0000',
    shortCreditsTotal: '760.0000'
  },
  premiumCollected: '760.0000',
  effectiveCostBasis: '4240.0000'
}

/** 3 LEAPS contracts covered by one $108.00 short. */
export const XYZ_PARTIAL_COVERAGE: PmccListItem = {
  ...XYZ_THREE_CONTRACTS,
  pmcc: {
    ...XYZ_THREE_CONTRACTS.pmcc,
    legs: [{ ...XYZ_LEAPS_LEG, contracts: 3 }, XYZ_SHORT_LEG]
  }
}

/** The Background quotes: LEAPS $25.70 × $26.50 (Δ 0.82), short $0.85 × $0.95 (Δ 0.24). */
export const XYZ_LEAPS_SNAPSHOT = optionSnapshot('25.70', '26.50', '26.10', '0.8200')
export const XYZ_SHORT_SNAPSHOT = optionSnapshot('0.85', '0.95', '0.90', '0.2400')

/** Keys each leg's snapshot by that leg's OCC call symbol, as the snapshots query does. */
export function pmccSnapshots(
  item: PmccListItem,
  byLegId: Record<string, OptionSnapshot>
): OptionSnapshotsBySymbol {
  return Object.fromEntries(
    item.pmcc.legs.flatMap((leg) => {
      const symbol = occSymbolForLeg({ ...leg, ticker: item.ticker, instrumentType: 'CALL' })
      const snapshot = byLegId[leg.legId]
      return symbol === null || snapshot === undefined ? [] : [[symbol, snapshot]]
    })
  )
}

export function xyzQuote(price: string): StockQuote {
  return {
    price,
    bid: price,
    ask: price,
    prevClose: price,
    volume: 0,
    timestamp: '2026-11-06T15:00:00Z'
  }
}
