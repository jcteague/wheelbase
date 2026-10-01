import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as positionsApi from './positions'

type AssignPositionFn = (payload: {
  positionId: string
  assignmentDate: string
}) => Promise<unknown>

type OpenCoveredCallFn = (payload: {
  positionId: string
  strike: number
  expiration: string
  contracts: number
  premiumPerContract: number
  fill_date?: string
}) => Promise<unknown>

type ExpireCcFn = (payload: {
  positionId: string
  expiration_date_override?: string
}) => Promise<unknown>

type RollCcFn = (payload: {
  positionId: string
  costToClosePerContract: number
  newPremiumPerContract: number
  newExpiration: string
  newStrike: number
  fillDate: string
}) => Promise<unknown>

type PositionsModuleWithAssign = typeof positionsApi & {
  assignPosition?: AssignPositionFn
  openCoveredCall?: OpenCoveredCallFn
  expireCc?: ExpireCcFn
  rollCc?: RollCcFn
}

const apiModule = positionsApi as PositionsModuleWithAssign
const mockAssignPosition = vi.fn()
const mockOpenCoveredCall = vi.fn()
const mockExpireCc = vi.fn()
const mockRollCc = vi.fn()

const SUCCESS_RESPONSE = {
  ok: true,
  position: {
    id: 'pos-123',
    ticker: 'AAPL',
    phase: 'HOLDING_SHARES',
    status: 'ACTIVE'
  },
  leg: {
    id: 'leg-123',
    positionId: 'pos-123',
    legRole: 'ASSIGN',
    action: 'ASSIGN',
    instrumentType: 'STOCK',
    strike: '180.0000',
    expiration: '2026-04-17',
    contracts: 1,
    premiumPerContract: '0.0000',
    fillPrice: null,
    fillDate: '2026-04-17',
    createdAt: '2026-04-17T00:00:00.000Z',
    updatedAt: '2026-04-17T00:00:00.000Z'
  },
  costBasisSnapshot: {
    id: 'cbs-123',
    positionId: 'pos-123',
    basisPerShare: '177.5000',
    totalPremiumCollected: '250.0000',
    finalPnl: null,
    snapshotAt: '2026-04-17T00:00:00.000Z',
    createdAt: '2026-04-17T00:00:00.000Z'
  },
  premiumWaterfall: [{ label: 'CSP premium', amount: '2.5000' }]
}

describe('assignPosition', () => {
  beforeEach(() => {
    mockAssignPosition.mockReset()
    Object.assign(window, {
      api: {
        ...(window.api ?? {}),
        assignPosition: mockAssignPosition
      }
    })
  })

  it('exports assignPosition from the renderer positions API module', () => {
    expect(apiModule.assignPosition).toEqual(expect.any(Function))
  })

  it('passes the payload through to window.api.assignPosition unchanged', async () => {
    expect(apiModule.assignPosition).toEqual(expect.any(Function))
    mockAssignPosition.mockResolvedValue(SUCCESS_RESPONSE)

    await apiModule.assignPosition?.({
      positionId: 'pos-123',
      assignmentDate: '2026-04-17'
    })

    expect(mockAssignPosition).toHaveBeenCalledWith({
      positionId: 'pos-123',
      assignmentDate: '2026-04-17'
    })
  })

  it('throws apiError(400) carrying the handler field errors unchanged when the IPC request fails', async () => {
    expect(apiModule.assignPosition).toEqual(expect.any(Function))
    mockAssignPosition.mockResolvedValue({
      ok: false,
      errors: [
        {
          field: 'assignmentDate',
          code: 'date_before_open',
          message: 'Assignment date cannot be before the CSP open date'
        }
      ]
    })

    await expect(
      apiModule.assignPosition?.({
        positionId: 'pos-123',
        assignmentDate: '2026-02-28'
      })
    ).rejects.toMatchObject({
      status: 400,
      body: {
        detail: [
          {
            field: 'assignmentDate',
            code: 'date_before_open',
            message: 'Assignment date cannot be before the CSP open date'
          }
        ]
      }
    })
  })
})

describe('openCoveredCall', () => {
  beforeEach(() => {
    mockOpenCoveredCall.mockReset()
    Object.assign(window, {
      api: {
        ...(window.api ?? {}),
        openCoveredCall: mockOpenCoveredCall
      }
    })
  })

  it('exports openCoveredCall from the renderer positions API module', () => {
    expect(apiModule.openCoveredCall).toEqual(expect.any(Function))
  })

  it('passes the payload through to window.api.openCoveredCall unchanged', async () => {
    expect(apiModule.openCoveredCall).toEqual(expect.any(Function))
    mockOpenCoveredCall.mockResolvedValue({
      ok: true,
      position: {
        id: 'pos-1',
        ticker: 'AAPL',
        phase: 'CC_OPEN',
        status: 'ACTIVE',
        closedDate: null
      },
      leg: { legRole: 'CC_OPEN' },
      costBasisSnapshot: { basisPerShare: '174.2000', totalPremiumCollected: '580.0000' }
    })

    await apiModule.openCoveredCall?.({
      positionId: 'pos-1',
      strike: 182,
      expiration: '2026-02-21',
      contracts: 1,
      premiumPerContract: 2.3,
      fillDate: '2026-01-20'
    })

    expect(mockOpenCoveredCall).toHaveBeenCalledWith({
      positionId: 'pos-1',
      strike: 182,
      expiration: '2026-02-21',
      contracts: 1,
      premiumPerContract: 2.3,
      fillDate: '2026-01-20'
    })
  })

  it('throws apiError(400) carrying the handler field names unchanged when the IPC request fails', async () => {
    expect(apiModule.openCoveredCall).toEqual(expect.any(Function))
    mockOpenCoveredCall.mockResolvedValue({
      ok: false,
      errors: [
        {
          field: 'fillDate',
          code: 'before_assignment',
          message: 'Fill date cannot be before the assignment date'
        }
      ]
    })

    await expect(
      apiModule.openCoveredCall?.({
        positionId: 'pos-1',
        strike: 182,
        expiration: '2026-02-21',
        contracts: 1,
        premiumPerContract: 2.3,
        fillDate: '2026-01-16'
      })
    ).rejects.toMatchObject({
      status: 400,
      body: {
        detail: [
          {
            field: 'fillDate',
            code: 'before_assignment',
            message: 'Fill date cannot be before the assignment date'
          }
        ]
      }
    })
  })
})

describe('expireCc', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111'

  beforeEach(() => {
    mockExpireCc.mockReset()
    Object.assign(window, {
      api: {
        ...(window.api ?? {}),
        expireCc: mockExpireCc
      }
    })
  })

  it('passes positionId through to window.api.expireCc', async () => {
    mockExpireCc.mockResolvedValue({
      ok: true,
      position: {
        id: VALID_UUID,
        ticker: 'AAPL',
        phase: 'HOLDING_SHARES',
        status: 'ACTIVE',
        closedDate: null
      },
      leg: { legRole: 'CC_EXPIRED', action: 'EXPIRE', instrumentType: 'CALL' },
      costBasisSnapshot: { basisPerShare: '174.2000', totalPremiumCollected: '580.0000' },
      sharesHeld: 100
    })

    await apiModule.expireCc?.({ positionId: VALID_UUID })

    expect(mockExpireCc).toHaveBeenCalledWith({
      positionId: VALID_UUID,
      expirationDateOverride: undefined
    })
  })

  it('passes expirationDateOverride through to window.api.expireCc', async () => {
    mockExpireCc.mockResolvedValue({
      ok: true,
      position: {
        id: VALID_UUID,
        ticker: 'AAPL',
        phase: 'HOLDING_SHARES',
        status: 'ACTIVE',
        closedDate: null
      },
      leg: { legRole: 'CC_EXPIRED' },
      costBasisSnapshot: {},
      sharesHeld: 100
    })

    await apiModule.expireCc?.({ positionId: VALID_UUID, expirationDateOverride: '2026-02-21' })

    expect(mockExpireCc).toHaveBeenCalledWith({
      positionId: VALID_UUID,
      expirationDateOverride: '2026-02-21'
    })
  })

  it('throws ApiError with status 400 when window.api.expireCc returns ok:false', async () => {
    mockExpireCc.mockResolvedValue({
      ok: false,
      errors: [
        {
          field: '__phase__',
          code: 'invalid_phase',
          message: 'No open covered call on this position'
        }
      ]
    })

    await expect(apiModule.expireCc?.({ positionId: VALID_UUID })).rejects.toMatchObject({
      status: 400,
      body: {
        detail: [
          {
            field: '__phase__',
            code: 'invalid_phase',
            message: 'No open covered call on this position'
          }
        ]
      }
    })
  })

  it('resolves with result when window.api.expireCc returns ok:true', async () => {
    const successPayload = {
      ok: true,
      position: {
        id: VALID_UUID,
        ticker: 'AAPL',
        phase: 'HOLDING_SHARES',
        status: 'ACTIVE',
        closedDate: null
      },
      leg: { legRole: 'CC_EXPIRED', action: 'EXPIRE', instrumentType: 'CALL' },
      costBasisSnapshot: { basisPerShare: '174.2000', totalPremiumCollected: '580.0000' },
      sharesHeld: 100
    }
    mockExpireCc.mockResolvedValue(successPayload)

    const result = await apiModule.expireCc?.({ positionId: VALID_UUID })

    expect(result).toMatchObject({
      position: { phase: 'HOLDING_SHARES' },
      leg: { legRole: 'CC_EXPIRED' },
      sharesHeld: 100
    })
  })
})

describe('saveAlertOverrides', () => {
  const mockSaveAlertOverrides = vi.fn()

  beforeEach(() => {
    mockSaveAlertOverrides.mockReset()
    Object.assign(window, {
      api: {
        ...(window.api ?? {}),
        saveAlertOverrides: mockSaveAlertOverrides
      }
    })
  })

  it('exports saveAlertOverrides from the renderer positions API module', () => {
    expect(positionsApi.saveAlertOverrides).toEqual(expect.any(Function))
  })

  it('calls window.api.saveAlertOverrides with the given payload and returns the position', async () => {
    mockSaveAlertOverrides.mockResolvedValue({
      ok: true,
      position: { id: 'pos-123', profitTargetPercent: 25, managementWindowDteOverride: 14 }
    })

    const result = await positionsApi.saveAlertOverrides({
      positionId: 'pos-123',
      profitTargetPercent: 25,
      managementWindowDte: 14
    })

    expect(mockSaveAlertOverrides).toHaveBeenCalledWith({
      positionId: 'pos-123',
      profitTargetPercent: 25,
      managementWindowDte: 14
    })
    expect(result).toMatchObject({
      position: { id: 'pos-123', profitTargetPercent: 25, managementWindowDteOverride: 14 }
    })
  })

  it('calls window.api.saveAlertOverrides with null values when clearing overrides', async () => {
    mockSaveAlertOverrides.mockResolvedValue({
      ok: true,
      position: { id: 'pos-123', profitTargetPercent: null, managementWindowDteOverride: null }
    })

    await positionsApi.saveAlertOverrides({
      positionId: 'pos-123',
      profitTargetPercent: null,
      managementWindowDte: null
    })

    expect(mockSaveAlertOverrides).toHaveBeenCalledWith({
      positionId: 'pos-123',
      profitTargetPercent: null,
      managementWindowDte: null
    })
  })

  it('throws apiError(400) with field errors when the IPC request fails', async () => {
    mockSaveAlertOverrides.mockResolvedValue({
      ok: false,
      errors: [
        {
          field: 'managementWindowDte',
          code: 'out_of_range',
          message: 'Management window must be between 6 and 45 DTE'
        }
      ]
    })

    await expect(
      positionsApi.saveAlertOverrides({
        positionId: 'pos-123',
        profitTargetPercent: 25,
        managementWindowDte: 60
      })
    ).rejects.toMatchObject({
      status: 400,
      body: {
        detail: [
          {
            field: 'managementWindowDte',
            code: 'out_of_range',
            message: 'Management window must be between 6 and 45 DTE'
          }
        ]
      }
    })
  })
})

describe('rollCc', () => {
  beforeEach(() => {
    mockRollCc.mockReset()
    Object.assign(window, {
      api: {
        ...(window.api ?? {}),
        rollCc: mockRollCc
      }
    })
  })

  it('passes the payload through to window.api.rollCc and returns RollCcResponse', async () => {
    const mockResponse = {
      ok: true,
      position: { id: 'pos-1', ticker: 'AAPL', phase: 'CC_OPEN', status: 'ACTIVE' },
      rollFromLeg: {
        id: 'leg-from',
        legRole: 'ROLL_FROM',
        action: 'BUY',
        strike: '182.0000',
        expiration: '2026-04-18',
        contracts: 1,
        premiumPerContract: '1.5000',
        fillDate: '2026-04-13'
      },
      rollToLeg: {
        id: 'leg-to',
        legRole: 'ROLL_TO',
        action: 'SELL',
        strike: '185.0000',
        expiration: '2026-05-16',
        contracts: 1,
        premiumPerContract: '2.0000',
        fillDate: '2026-04-13'
      },
      rollChainId: 'chain-abc123',
      costBasisSnapshot: {
        id: 'cbs-1',
        positionId: 'pos-1',
        basisPerShare: '175.8000',
        totalPremiumCollected: '350.0000',
        finalPnl: null,
        snapshotAt: '2026-04-13T00:00:00.000Z',
        createdAt: '2026-04-13T00:00:00.000Z'
      }
    }
    mockRollCc.mockResolvedValue(mockResponse)

    const result = await apiModule.rollCc?.({
      positionId: 'pos-1',
      costToClosePerContract: 1.5,
      newPremiumPerContract: 2.0,
      newExpiration: '2026-05-16',
      newStrike: 185,
      fillDate: '2026-04-13'
    })

    expect(mockRollCc).toHaveBeenCalledWith({
      positionId: 'pos-1',
      costToClosePerContract: 1.5,
      newPremiumPerContract: 2.0,
      newExpiration: '2026-05-16',
      newStrike: 185,
      fillDate: '2026-04-13'
    })

    expect(result).toMatchObject(mockResponse)
  })
})

describe('createPmccPosition', () => {
  const mockCreatePmccPosition = vi.fn()
  const pmccLeg = {
    underlying: 'XYZ',
    instrumentType: 'CALL' as const,
    deliverableShares: 100,
    contracts: 1,
    fillDate: '2026-09-14',
    fees: 0
  }
  const payload: positionsApi.CreatePmccPositionPayload = {
    strategy: 'PMCC',
    ticker: 'XYZ',
    long: { ...pmccLeg, strike: 80, expiration: '2027-09-17', fillPrice: 25 },
    short: { ...pmccLeg, strike: 110, expiration: '2026-10-16', fillPrice: 2 },
    thesis: 'Bullish on XYZ'
  }

  beforeEach(() => {
    mockCreatePmccPosition.mockReset()
    Object.assign(window, {
      api: {
        ...(window.api ?? {}),
        createPmccPosition: mockCreatePmccPosition
      }
    })
  })

  it('passes the camelCase payload through to window.api.createPmccPosition unchanged', async () => {
    mockCreatePmccPosition.mockResolvedValue({ ok: true, position: { id: 'p1' } })

    await positionsApi.createPmccPosition(payload)

    expect(mockCreatePmccPosition).toHaveBeenCalledWith(payload)
  })

  it('throws ApiError with status 400 carrying the dotted field errors on ok:false', async () => {
    const errors = [
      {
        field: 'short.strike',
        code: 'strike_not_above_long',
        message: 'Short-call strike must be above the LEAPS strike.'
      }
    ]
    mockCreatePmccPosition.mockResolvedValue({ ok: false, errors })

    await expect(positionsApi.createPmccPosition(payload)).rejects.toEqual({
      status: 400,
      body: { detail: errors }
    })
  })

  it('returns the result on success', async () => {
    const success = {
      position: { id: 'p1', ticker: 'XYZ', phase: 'PMCC_OPEN' },
      openingDebit: { initialNetDebit: '2300.0000' }
    }
    mockCreatePmccPosition.mockResolvedValue({ ok: true, ...success })

    await expect(positionsApi.createPmccPosition(payload)).resolves.toMatchObject(success)
  })
})

describe('listPositions', () => {
  const mockListPositions = vi.fn()
  const base = {
    phase: 'CSP_OPEN',
    status: 'ACTIVE',
    premiumCollected: '250.0000',
    effectiveCostBasis: '177.5000',
    profitTargetPercent: 50
  }
  const wheelItem = {
    ...base,
    id: 'wheel-1',
    ticker: 'AAPL',
    strategyType: 'WHEEL' as const,
    pmcc: null,
    strike: '180.0000',
    expiration: '2026-10-16',
    dte: 17,
    instrumentType: 'PUT' as const,
    contracts: 1,
    entryPremiumPerContract: '2.5000'
  }
  const pmccSummary = {
    long: { strike: '80.0000', expiration: '2027-09-17', dte: 353, contracts: 1 },
    short: { strike: '110.0000', expiration: '2026-10-16', dte: 17, contracts: 1 },
    initialNetDebit: '2300.0000'
  }
  const pmccItem = {
    ...base,
    id: 'pmcc-1',
    ticker: 'XYZ',
    phase: 'PMCC_OPEN',
    premiumCollected: '200.0000',
    effectiveCostBasis: '23.0000',
    profitTargetPercent: null,
    strategyType: 'PMCC' as const,
    pmcc: pmccSummary,
    strike: null,
    expiration: null,
    dte: null,
    instrumentType: null,
    contracts: null,
    entryPremiumPerContract: null
  }

  beforeEach(() => {
    mockListPositions.mockReset()
    Object.assign(window, {
      api: {
        ...(window.api ?? {}),
        listPositions: mockListPositions
      }
    })
  })

  it("returns the handler's WHEEL and PMCC rows unchanged — the list row has one shape end to end", async () => {
    mockListPositions.mockResolvedValue([wheelItem, pmccItem])

    expect(await positionsApi.listPositions()).toEqual([wheelItem, pmccItem])
  })
})
