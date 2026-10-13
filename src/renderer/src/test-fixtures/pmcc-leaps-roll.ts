// [US-105] Renderer fixtures for the PMCC LEAPS roll on 2027-07-09: the open $80 LEAPS at 70 DTE,
// cycle 8's $112 short at 7 DTE, the ledger on that day, and the recorded Roll Up & Out response
// (sell the $80 at $26.00, buy the $85 · 2028-01-21 at $23.50 — a $2.50 credit).
import type { LegDetail, RollPmccLeapsResponse } from '../api/positions'
import { legRecord, snapshotRecord } from './position-records'

export const LEAPS_PMCC_ID = 'pmcc-xyz'

export const LEAPS_TODAY = '2027-07-09'

export const LEAPS_LEG: LegDetail = legRecord({
  id: 'leg-leaps',
  positionId: LEAPS_PMCC_ID,
  legRole: 'LEAPS_OPEN',
  action: 'BUY',
  instrumentType: 'CALL',
  strike: '80.0000',
  expiration: '2027-09-17',
  contracts: 1,
  premiumPerContract: '25.0000',
  fillDate: '2026-09-14'
})

export const LEAPS_OPEN_SHORT: LegDetail = legRecord({
  id: 'leg-short-8',
  positionId: LEAPS_PMCC_ID,
  legRole: 'SHORT_CALL_OPEN',
  action: 'SELL',
  instrumentType: 'CALL',
  strike: '112.0000',
  expiration: '2027-07-16',
  contracts: 1,
  premiumPerContract: '2.4000',
  fillDate: '2027-06-18'
})

/** The position's latest leg fill: the open short's sale. A LEAPS roll cannot be dated before it. */
export const LEAPS_LAST_EVENT_DATE = LEAPS_OPEN_SHORT.fillDate

export const LEAPS_LEDGER = {
  basisPerShare: '21.8000',
  leapsCostPerShare: '25.0000',
  effectiveShareCost: '101.8000'
}

export const LEAPS_UP_OUT_RESPONSE: RollPmccLeapsResponse = {
  position: { id: LEAPS_PMCC_ID, ticker: 'XYZ', phase: 'PMCC_OPEN', status: 'ACTIVE' },
  rollFromLeg: legRecord({
    ...LEAPS_LEG,
    id: 'leg-leaps-roll-from',
    legRole: 'ROLL_FROM',
    action: 'SELL',
    premiumPerContract: '26.0000',
    fillPrice: '26.0000',
    fillDate: LEAPS_TODAY,
    rollChainId: 'chain-leaps'
  }),
  rollToLeg: legRecord({
    ...LEAPS_LEG,
    id: 'leg-leaps-roll-to',
    legRole: 'ROLL_TO',
    action: 'BUY',
    strike: '85.0000',
    expiration: '2028-01-21',
    premiumPerContract: '23.5000',
    fillPrice: '23.5000',
    fillDate: LEAPS_TODAY,
    rollChainId: 'chain-leaps'
  }),
  rollChainId: 'chain-leaps',
  costBasisSnapshot: snapshotRecord({
    positionId: LEAPS_PMCC_ID,
    basisPerShare: '19.3000',
    totalPremiumCollected: '320.0000',
    finalPnl: null,
    triggerEvent: 'PMCC_LEAPS_ROLL'
  }),
  ledger: {
    basisPerShare: '19.3000',
    basisTotal: '1930.0000',
    leapsCostPerShare: '22.5000',
    leapsCostTotal: '2250.0000',
    shortCreditsPerShare: '3.2000',
    shortCreditsTotal: '320.0000',
    effectiveShareCost: '104.3000',
    premiumRecoveredPercent: '12.8000'
  },
  leapsRollNumber: 1
}
