// [US-104] Renderer fixtures for the PMCC short-call roll: the Background's open legs (cycle 2's
// $108 short, the $80 LEAPS) and the recorded responses for the up-&-out debit and the credit roll.
import type { PmccOpenLegs, RollPmccShortCallResponse } from '../api/positions'
import { legRecord, snapshotRecord } from './position-records'

export const PMCC_ID = 'pmcc-1'

export const OPEN_SHORT = legRecord({
  id: 'leg-short-2',
  positionId: PMCC_ID,
  legRole: 'SHORT_CALL_OPEN',
  action: 'SELL',
  instrumentType: 'CALL',
  strike: '108.0000',
  expiration: '2026-11-20',
  contracts: 1,
  premiumPerContract: '1.8000',
  fillDate: '2026-10-19'
})

export const OPEN_LEAPS = legRecord({
  id: 'leg-leaps',
  positionId: PMCC_ID,
  legRole: 'LEAPS_OPEN',
  action: 'BUY',
  instrumentType: 'CALL',
  strike: '80.0000',
  expiration: '2027-09-17',
  contracts: 1,
  premiumPerContract: '25.0000',
  fillDate: '2026-09-14'
})

export const OPEN_LEGS: PmccOpenLegs = { long: OPEN_LEAPS, short: OPEN_SHORT }

function rollResponse(cost: string, strike: string, premium: string): RollPmccShortCallResponse {
  return {
    position: { id: PMCC_ID, ticker: 'XYZ', phase: 'PMCC_OPEN', status: 'ACTIVE' },
    rollFromLeg: legRecord({
      ...OPEN_SHORT,
      id: 'leg-roll-from',
      legRole: 'ROLL_FROM',
      action: 'BUY',
      premiumPerContract: cost,
      fillPrice: cost,
      fillDate: '2026-11-06',
      rollChainId: 'chain-1'
    }),
    rollToLeg: legRecord({
      ...OPEN_SHORT,
      id: 'leg-roll-to',
      legRole: 'ROLL_TO',
      action: 'SELL',
      strike,
      expiration: '2026-12-18',
      premiumPerContract: premium,
      fillPrice: premium,
      fillDate: '2026-11-06',
      rollChainId: 'chain-1'
    }),
    rollChainId: 'chain-1',
    costBasisSnapshot: snapshotRecord({
      positionId: PMCC_ID,
      basisPerShare: '21.8000',
      totalPremiumCollected: '320.0000',
      finalPnl: null,
      triggerEvent: 'PMCC_SHORT_ROLL'
    }),
    ledger: {
      basisPerShare: '21.8000',
      basisTotal: '2180.0000',
      leapsCostPerShare: '25.0000',
      leapsCostTotal: '2500.0000',
      shortCreditsPerShare: '3.2000',
      shortCreditsTotal: '320.0000',
      effectiveShareCost: '101.8000',
      premiumRecoveredPercent: '12.8000'
    },
    shortCallRollNumber: 1
  }
}

/** Buy back the $108 at $3.00, sell the $112 · 2026-12-18 at $2.40 — a $0.60 debit. */
export const UP_OUT_RESPONSE = rollResponse('3.0000', '112.0000', '2.4000')

/** Buy back the $108 at $1.10, sell the $108 · 2026-12-18 at $2.30 — a $1.20 credit. */
export const OUT_CREDIT_RESPONSE = rollResponse('1.1000', '108.0000', '2.3000')
