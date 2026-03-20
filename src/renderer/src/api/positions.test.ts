import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as positionsApi from './positions'

type AssignPositionFn = (payload: {
  position_id: string
  assignment_date: string
}) => Promise<unknown>

type OpenCoveredCallFn = (payload: {
  position_id: string
  strike: number
  expiration: string
  contracts: number
  premium_per_contract: number
  fill_date?: string
}) => Promise<unknown>

type PositionsModuleWithAssign = typeof positionsApi & {
  assignPosition?: AssignPositionFn
  openCoveredCall?: OpenCoveredCallFn
}

const apiModule = positionsApi as PositionsModuleWithAssign
const mockAssignPosition = vi.fn()
const mockOpenCoveredCall = vi.fn()

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

  it('calls window.api.assignPosition with camelCase payload when given snake_case payload', async () => {
    expect(apiModule.assignPosition).toEqual(expect.any(Function))
    mockAssignPosition.mockResolvedValue(SUCCESS_RESPONSE)

    await apiModule.assignPosition?.({
      position_id: 'pos-123',
      assignment_date: '2026-04-17'
    })

    expect(mockAssignPosition).toHaveBeenCalledWith({
      positionId: 'pos-123',
      assignmentDate: '2026-04-17'
    })
  })

  it('throws apiError(400) and maps assignmentDate onto assignment_date when the IPC request fails', async () => {
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
        position_id: 'pos-123',
        assignment_date: '2026-02-28'
      })
    ).rejects.toMatchObject({
      status: 400,
      body: {
        detail: [
          {
            field: 'assignment_date',
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

  it('calls window.api.openCoveredCall with camelCase payload when given snake_case payload', async () => {
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
      position_id: 'pos-1',
      strike: 182,
      expiration: '2026-02-21',
      contracts: 1,
      premium_per_contract: 2.3,
      fill_date: '2026-01-20'
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

  it('throws apiError(400) and maps field names when the IPC request fails', async () => {
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
        position_id: 'pos-1',
        strike: 182,
        expiration: '2026-02-21',
        contracts: 1,
        premium_per_contract: 2.3,
        fill_date: '2026-01-16'
      })
    ).rejects.toMatchObject({
      status: 400,
      body: {
        detail: [
          {
            field: 'fill_date',
            code: 'before_assignment',
            message: 'Fill date cannot be before the assignment date'
          }
        ]
      }
    })
  })
})
