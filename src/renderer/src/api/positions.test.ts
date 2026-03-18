import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as positionsApi from './positions'

type AssignPositionFn = (payload: {
  position_id: string
  assignment_date: string
}) => Promise<unknown>

type PositionsModuleWithAssign = typeof positionsApi & {
  assignPosition?: AssignPositionFn
}

const apiModule = positionsApi as PositionsModuleWithAssign
const mockAssignPosition = vi.fn()

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
