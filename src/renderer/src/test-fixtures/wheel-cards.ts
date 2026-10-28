// [US-18] The story's Background wheels on 2027-08-13: MSFT CC_OPEN, AAPL CSP_OPEN, NVDA
// HOLDING_SHARES and the closed TSLA, the XYZ PMCC, plus a snapshot builder for the option
// quotes.
import type { OptionSnapshot, StockQuote } from '../api/market-data'
import type { PmccListItem, WheelListItem } from '../api/positions'

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
  profitTargetPercent: null
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
    long: { strike: '80.0000', expiration: '2028-01-21', dte: 161, contracts: 1 },
    short: { strike: '118.0000', expiration: '2027-08-20', dte: 7, contracts: 1 },
    basisPerShare: '6.5500',
    basisTotal: '655.0000'
  },
  strike: null,
  expiration: null,
  dte: null,
  instrumentType: null,
  contracts: null,
  entryPremiumPerContract: null,
  premiumCollected: '1595.0000',
  effectiveCostBasis: '655.0000',
  profitTargetPercent: null
}

export const AAPL_QUOTE: StockQuote = {
  price: '182.45',
  bid: '182.44',
  ask: '182.46',
  prevClose: '181.00',
  volume: 0,
  timestamp: '2027-08-13T14:00:00Z'
}

export function optionSnapshot(bid: string, ask: string, mid: string): OptionSnapshot {
  return {
    bid,
    ask,
    mid,
    lastTrade: mid,
    openInterest: 1000,
    volume: 500,
    timestamp: '2027-08-13T14:00:00Z'
  }
}
