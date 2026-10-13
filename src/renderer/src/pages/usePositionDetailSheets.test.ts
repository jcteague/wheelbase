// usePositionDetailSheets — which action sheet is open on the position detail page, and the
// context each one is opened with. Each opener reads the position; with nothing to act on it
// leaves its sheet closed.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LegDetail, PositionDetail, RollPmccLeapsResponse } from '../api/positions'
import { OPEN_LEAPS, UP_OUT_RESPONSE } from '../test-fixtures/pmcc-roll'
import { legRecord, snapshotRecord } from '../test-fixtures/position-records'
import { usePositionDetailSheets } from './usePositionDetailSheets'

const leg = (overrides: Partial<LegDetail>): LegDetail => ({
  id: 'leg-1',
  positionId: 'pos-1',
  legRole: 'CSP_OPEN',
  action: 'SELL',
  instrumentType: 'PUT',
  strike: '180.0000',
  expiration: '2026-04-17',
  contracts: 1,
  premiumPerContract: '2.5000',
  fillPrice: null,
  fillDate: '2026-03-01',
  rollChainId: null,
  fees: '0.0000',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  ...overrides
})

const CSP_LEG = leg({})
const ROLL_TO_LEG = leg({ id: 'leg-2', legRole: 'ROLL_TO', premiumPerContract: '1.8000' })
const ASSIGN_LEG = leg({
  id: 'leg-3',
  legRole: 'ASSIGN',
  action: 'ASSIGN',
  instrumentType: 'STOCK',
  contracts: 2,
  premiumPerContract: '0.0000',
  fillDate: '2026-04-17'
})
const CC_LEG = leg({
  id: 'leg-4',
  legRole: 'CC_OPEN',
  instrumentType: 'CALL',
  strike: '182.0000',
  expiration: '2026-05-15',
  contracts: 2,
  premiumPerContract: '2.3000',
  fillDate: '2026-04-20'
})

const SNAPSHOT: NonNullable<PositionDetail['costBasisSnapshot']> = {
  id: 'cbs-1',
  positionId: 'pos-1',
  basisPerShare: '177.5000',
  totalPremiumCollected: '250.0000',
  finalPnl: null,
  triggerEvent: 'CSP_OPEN',
  snapshotAt: '2026-03-01T00:00:00.000Z',
  createdAt: '2026-03-01T00:00:00.000Z'
}

const CSP_DETAIL: PositionDetail = {
  position: {
    id: 'pos-1',
    ticker: 'AAPL',
    phase: 'CSP_OPEN',
    status: 'ACTIVE',
    strategyType: 'WHEEL',
    openedDate: '2026-03-01',
    closedDate: null,
    accountId: null,
    notes: null,
    thesis: null,
    tags: [],
    profitTargetPercent: null,
    managementWindowDteOverride: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z'
  },
  activeLeg: CSP_LEG,
  costBasisSnapshot: SNAPSHOT,
  legs: [CSP_LEG],
  allSnapshots: [SNAPSHOT],
  initialNetDebit: null,
  pmccLedger: null,
  pmccOpenLegs: null
}

const HOLDING_DETAIL: PositionDetail = {
  ...CSP_DETAIL,
  position: { ...CSP_DETAIL.position, phase: 'HOLDING_SHARES' },
  activeLeg: null,
  legs: [CSP_LEG, ASSIGN_LEG]
}

const CC_DETAIL: PositionDetail = {
  ...HOLDING_DETAIL,
  position: { ...CSP_DETAIL.position, phase: 'CC_OPEN' },
  activeLeg: CC_LEG,
  legs: [CSP_LEG, ASSIGN_LEG, CC_LEG]
}

const render = (data: PositionDetail | undefined): ReturnType<typeof usePositionDetailSheets> =>
  renderHook(() => usePositionDetailSheets(data)).result.current

function hookFor(data: PositionDetail | undefined): {
  current: ReturnType<typeof usePositionDetailSheets>
} {
  return renderHook(() => usePositionDetailSheets(data)).result
}

describe('usePositionDetailSheets — assignment waterfall', () => {
  it('is empty with no active leg', () => {
    expect(render(HOLDING_DETAIL).assignmentWaterfall).toEqual([])
  })

  it('lists the CSP premium, then each roll credit', () => {
    expect(render({ ...CSP_DETAIL, legs: [CSP_LEG, ROLL_TO_LEG] }).assignmentWaterfall).toEqual([
      { label: 'CSP premium', amount: '2.5000' },
      { label: 'Roll credit', amount: '1.8000' }
    ])
  })

  it("falls back to the active leg's premium when no premium legs are recorded", () => {
    expect(render({ ...CSP_DETAIL, legs: [] }).assignmentWaterfall).toEqual([
      { label: 'CSP premium', amount: '2.5000' }
    ])
  })
})

describe('usePositionDetailSheets — active-leg sheets', () => {
  it.each([
    ['handleRecordAssignment', 'assignmentCtx', 'handleCloseAssignment'],
    ['handleRecordExpiration', 'expirationCtx', 'handleCloseExpiration'],
    ['handleRecordCcExpiration', 'ccExpirationCtx', 'handleCloseCcExpiration']
  ] as const)(
    '%s opens %s with the active leg and snapshot, and its close handler clears it',
    (open, ctx, close) => {
      const result = hookFor(CSP_DETAIL)

      act(() => result.current[open]())
      expect(result.current[ctx]).toEqual({ activeLeg: CSP_LEG, snapshot: SNAPSHOT })
      expect(result.current.overlayOpen).toBe(true)

      act(() => result.current[close]())
      expect(result.current[ctx]).toBeNull()
      expect(result.current.overlayOpen).toBe(false)
    }
  )

  it.each([
    ['handleRecordAssignment', 'assignmentCtx'],
    ['handleRecordExpiration', 'expirationCtx'],
    ['handleRecordCcExpiration', 'ccExpirationCtx']
  ] as const)('%s leaves %s closed when there is no active leg', (open, ctx) => {
    const result = hookFor(HOLDING_DETAIL)

    act(() => result.current[open]())

    expect(result.current[ctx]).toBeNull()
    expect(result.current.overlayOpen).toBe(false)
  })
})

describe('usePositionDetailSheets — open covered call', () => {
  it('opens with the snapshot basis and the assignment leg', () => {
    const result = hookFor(HOLDING_DETAIL)

    act(() => result.current.handleOpenCc())
    expect(result.current.openCcCtx).toEqual({
      basisPerShare: '177.5000',
      totalPremiumCollected: '250.0000',
      contracts: 2,
      assignmentDate: '2026-04-17'
    })

    act(() => result.current.handleCloseOpenCc())
    expect(result.current.openCcCtx).toBeNull()
  })

  it('stays closed without an assignment leg', () => {
    const result = hookFor(CSP_DETAIL)
    act(() => result.current.handleOpenCc())
    expect(result.current.openCcCtx).toBeNull()
  })

  it('stays closed without a cost-basis snapshot', () => {
    const result = hookFor({ ...HOLDING_DETAIL, costBasisSnapshot: null })
    act(() => result.current.handleOpenCc())
    expect(result.current.openCcCtx).toBeNull()
  })

  it('hands off from the assignment sheet to the covered-call sheet', () => {
    const result = hookFor(CSP_DETAIL)
    const next = {
      basisPerShare: '177.5000',
      totalPremiumCollected: '250.0000',
      contracts: 1,
      assignmentDate: '2026-04-17'
    }

    act(() => result.current.handleRecordAssignment())
    act(() => result.current.handleOpenCoveredCallFromAssignment(next))

    expect(result.current.assignmentCtx).toBeNull()
    expect(result.current.openCcCtx).toEqual(next)
  })
})

describe('usePositionDetailSheets — covered-call sheets', () => {
  it('close-early and call-away read the open CC leg, and their close handlers clear them', () => {
    const result = hookFor(CC_DETAIL)

    act(() => result.current.handleCloseCcEarly())
    expect(result.current.closeCcCtx).toEqual({
      contracts: 2,
      openPremium: '2.3000',
      ccOpenFillDate: '2026-04-20',
      ccExpiration: '2026-05-15',
      strike: '182.0000',
      basisPerShare: '177.5000'
    })
    act(() => result.current.handleCloseCloseCcEarly())
    expect(result.current.closeCcCtx).toBeNull()

    act(() => result.current.handleRecordCallAway())
    expect(result.current.callAwayCtx).toEqual({
      ccStrike: '182.0000',
      ccExpiration: '2026-05-15',
      contracts: 2,
      basisPerShare: '177.5000',
      positionOpenedDate: '2026-03-01'
    })
    act(() => result.current.handleCloseCallAway())
    expect(result.current.callAwayCtx).toBeNull()
  })

  it('falls back to an active CC_OPEN leg missing from the leg list', () => {
    const result = hookFor({ ...CC_DETAIL, legs: [CSP_LEG, ASSIGN_LEG] })
    act(() => result.current.handleCloseCcEarly())
    expect(result.current.closeCcCtx).toMatchObject({ strike: '182.0000', contracts: 2 })
  })

  it('leaves both closed when the position holds no covered call', () => {
    const result = hookFor(HOLDING_DETAIL)

    act(() => result.current.handleCloseCcEarly())
    act(() => result.current.handleRecordCallAway())

    expect(result.current.closeCcCtx).toBeNull()
    expect(result.current.callAwayCtx).toBeNull()
  })

  it('leaves both closed while the position is still loading', () => {
    const result = hookFor(undefined)

    act(() => result.current.handleCloseCcEarly())
    act(() => result.current.handleRecordCallAway())

    expect(result.current.closeCcCtx).toBeNull()
    expect(result.current.callAwayCtx).toBeNull()
  })
})

/** Sell the $80 LEAPS at $26.00, buy the $85 · 2028-01-21 at $23.50 — a $2.50 credit. */
const LEAPS_ROLL_RESPONSE: RollPmccLeapsResponse = {
  position: UP_OUT_RESPONSE.position,
  ledger: {
    ...UP_OUT_RESPONSE.ledger,
    basisPerShare: '19.3000',
    leapsCostPerShare: '22.5000',
    effectiveShareCost: '104.3000'
  },
  rollFromLeg: legRecord({
    ...OPEN_LEAPS,
    id: 'leg-leaps-roll-from',
    legRole: 'ROLL_FROM',
    action: 'SELL',
    premiumPerContract: '26.0000',
    fillPrice: '26.0000',
    fillDate: '2026-11-06',
    rollChainId: 'chain-leaps'
  }),
  rollToLeg: legRecord({
    ...OPEN_LEAPS,
    id: 'leg-leaps-roll-to',
    legRole: 'ROLL_TO',
    action: 'BUY',
    strike: '85.0000',
    expiration: '2028-01-21',
    premiumPerContract: '23.5000',
    fillPrice: '23.5000',
    fillDate: '2026-11-06',
    rollChainId: 'chain-leaps'
  }),
  rollChainId: 'chain-leaps',
  costBasisSnapshot: snapshotRecord({
    positionId: UP_OUT_RESPONSE.position.id,
    basisPerShare: '19.3000',
    totalPremiumCollected: '320.0000',
    finalPnl: null,
    triggerEvent: 'PMCC_LEAPS_ROLL'
  }),
  leapsRollNumber: 1
}

describe('usePositionDetailSheets — roll sheets', () => {
  it.each([
    ['handleRollCsp', 'rollCspOpen', 'handleCloseRollCsp'],
    ['handleRollCc', 'rollCcOpen', 'handleCloseRollCc'],
    ['handleRollPmccShort', 'rollPmccShortOpen', 'handleCloseRollPmccShort'],
    ['handleRollPmccLeaps', 'rollPmccLeapsOpen', 'handleCloseRollPmccLeaps']
  ] as const)('%s opens %s over the content; %s closes it', (open, flag, close) => {
    const result = hookFor(CSP_DETAIL)

    act(() => result.current[open]())
    expect(result.current[flag]).toBe(true)
    expect(result.current.overlayOpen).toBe(true)

    act(() => result.current[close]())
    expect(result.current[flag]).toBe(false)
    expect(result.current.overlayOpen).toBe(false)
  })

  it('a recorded short-call roll closes its sheet and keeps the response as the short banner', () => {
    const result = hookFor(CSP_DETAIL)

    act(() => result.current.handleRollPmccShort())
    act(() => result.current.handlePmccShortRollRecorded(UP_OUT_RESPONSE))

    expect(result.current.rollPmccShortOpen).toBe(false)
    expect(result.current.pmccRollRecorded).toEqual({ kind: 'short', result: UP_OUT_RESPONSE })
  })

  // [US-105] The LEAPS roll shares the one banner slot with the short-call roll.
  it('a recorded LEAPS roll closes its sheet and keeps the response as the leaps banner', () => {
    const result = hookFor(CSP_DETAIL)

    act(() => result.current.handleRollPmccLeaps())
    act(() => result.current.handlePmccLeapsRollRecorded(LEAPS_ROLL_RESPONSE))

    expect(result.current.rollPmccLeapsOpen).toBe(false)
    expect(result.current.overlayOpen).toBe(false)
    expect(result.current.pmccRollRecorded).toEqual({ kind: 'leaps', result: LEAPS_ROLL_RESPONSE })
  })

  it.each(['handleRollPmccShort', 'handleRollPmccLeaps'] as const)(
    '%s clears a recorded banner of either kind',
    (open) => {
      const result = hookFor(CSP_DETAIL)

      act(() => result.current.handlePmccShortRollRecorded(UP_OUT_RESPONSE))
      act(() => result.current[open]())
      expect(result.current.pmccRollRecorded).toBeNull()

      act(() => result.current.handlePmccLeapsRollRecorded(LEAPS_ROLL_RESPONSE))
      act(() => result.current[open]())
      expect(result.current.pmccRollRecorded).toBeNull()
    }
  )

  it('recording one roll kind after the other keeps only the latter banner', () => {
    const result = hookFor(CSP_DETAIL)

    act(() => result.current.handlePmccShortRollRecorded(UP_OUT_RESPONSE))
    act(() => result.current.handlePmccLeapsRollRecorded(LEAPS_ROLL_RESPONSE))
    expect(result.current.pmccRollRecorded).toEqual({ kind: 'leaps', result: LEAPS_ROLL_RESPONSE })

    act(() => result.current.handlePmccShortRollRecorded(UP_OUT_RESPONSE))
    expect(result.current.pmccRollRecorded).toEqual({ kind: 'short', result: UP_OUT_RESPONSE })
  })
})
