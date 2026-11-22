// [US-115] Renderer fixtures for the Sell Short Call sheet: US-109's XYZ Background with cycle 9
// removed — the live $85.00 · 2028-01-21 LEAPS (rolled to 2027-07-09), cycle 8 expired worthless
// 2027-07-16, the ledger at $8.50 / share — and the response for selling cycle 9's $118 call.
import type { PmccLedgerResult } from '../../../main/core/costbasis'
import type { SellPmccShortResponse } from '../api/positions'
import { xyzCycle } from '../components/position-cockpit/PmccLegTimeline.fixture'
import type { PmccEndedCycle } from '../lib/pmcc-sell-short'
import { legRecord, snapshotRecord } from './position-records'

export const SELL_PMCC_ID = 'pmcc-xyz'

/** The live LEAPS: the $85.00 · 2028-01-21 `ROLL_TO` leg of the 2027-07-09 LEAPS roll. */
export const XYZ_LEAPS = legRecord({
  id: 'leg-leaps-85',
  positionId: SELL_PMCC_ID,
  legRole: 'ROLL_TO',
  action: 'BUY',
  instrumentType: 'CALL',
  strike: '85.0000',
  expiration: '2028-01-21',
  contracts: 1,
  premiumPerContract: '23.5000',
  fillPrice: '23.5000',
  fillDate: '2027-07-09',
  rollChainId: 'leaps-chain-1'
})

/** The same LEAPS held as 3 contracts. */
export const XYZ_LEAPS_3 = legRecord({ ...XYZ_LEAPS, contracts: 3 })

/** LEAPS cost $22.50 and short credits $14.00 per share: basis $8.50, effective $93.50. */
export const XYZ_LEDGER: PmccLedgerResult = {
  basisPerShare: '8.5000',
  basisTotal: '850.0000',
  leapsCostPerShare: '22.5000',
  leapsCostTotal: '2250.0000',
  shortCreditsPerShare: '14.0000',
  shortCreditsTotal: '1400.0000',
  effectiveShareCost: '93.5000',
  premiumRecoveredPercent: '62.2222'
}

/** The same per-share ledger on 3 LEAPS contracts. */
export const XYZ_LEDGER_3: PmccLedgerResult = {
  ...XYZ_LEDGER,
  basisTotal: '2550.0000',
  leapsCostTotal: '6750.0000',
  shortCreditsTotal: '4200.0000'
}

/** Cycle 8: the $112 call sold 2027-06-22, expired worthless 2027-07-16. */
export function xyzCycle8(): PmccEndedCycle {
  const cycle = xyzCycle(8)
  if (cycle.status !== 'ENDED') throw new Error('XYZ cycle 8 has not ended')
  return cycle
}

/** Cycle 9 sold: $118.00 · 2027-08-20 at $1.95, 1 contract; basis $8.50 → $6.55. */
export const SOLD_RESPONSE: SellPmccShortResponse = {
  position: { id: SELL_PMCC_ID, ticker: 'XYZ', phase: 'PMCC_OPEN', status: 'ACTIVE' },
  shortLeg: legRecord({
    id: 'leg-short-9',
    positionId: SELL_PMCC_ID,
    legRole: 'SHORT_CALL_OPEN',
    action: 'SELL',
    instrumentType: 'CALL',
    strike: '118.0000',
    expiration: '2027-08-20',
    contracts: 1,
    premiumPerContract: '1.9500',
    fillPrice: '1.9500',
    fillDate: '2027-07-23'
  }),
  cycleNumber: 9,
  ledger: {
    basisPerShare: '6.5500',
    basisTotal: '655.0000',
    leapsCostPerShare: '22.5000',
    leapsCostTotal: '2250.0000',
    shortCreditsPerShare: '15.9500',
    shortCreditsTotal: '1595.0000',
    effectiveShareCost: '91.5500',
    premiumRecoveredPercent: '70.8889'
  },
  snapshot: snapshotRecord({
    id: 'snap-short-9',
    positionId: SELL_PMCC_ID,
    basisPerShare: '6.5500',
    totalPremiumCollected: '1595.0000',
    finalPnl: null,
    triggerEvent: 'PMCC_SHORT_OPEN',
    snapshotAt: '2027-07-23T12:00:00.000Z'
  })
}
