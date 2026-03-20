import { beforeEach, describe, expect, it, vi } from 'vitest'

const assignCspPosition = vi.fn()
const createPosition = vi.fn()
const closeCspPosition = vi.fn()
const expireCspPosition = vi.fn()
const getPosition = vi.fn()
const listPositions = vi.fn()
const openCoveredCallPosition = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}))

vi.mock('../logger', () => ({
  logger: {
    error: vi.fn()
  }
}))

vi.mock('../services/positions', () => ({
  assignCspPosition,
  createPosition,
  closeCspPosition,
  expireCspPosition,
  getPosition,
  listPositions,
  openCoveredCallPosition
}))

function getRegisteredHandler(
  calls: Array<[string, (...args: unknown[]) => unknown]>,
  channel: string
): ((...args: unknown[]) => unknown) | undefined {
  return calls.find(([registeredChannel]) => registeredChannel === channel)?.[1]
}

describe('registerPositionsHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assignCspPosition.mockReset()
    createPosition.mockReset()
    closeCspPosition.mockReset()
    expireCspPosition.mockReset()
    getPosition.mockReset()
    listPositions.mockReset()
    openCoveredCallPosition.mockReset()
  })

  it('registers a positions:assign-csp handler', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')

    registerPositionsHandlers({} as never)

    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith(
      'positions:assign-csp',
      expect.any(Function)
    )
  })

  it('positions:assign-csp returns ok:true and a HOLDING_SHARES position for valid payloads', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')
    const db = {} as never

    assignCspPosition.mockReturnValue({
      position: {
        id: 'position-1',
        ticker: 'AAPL',
        phase: 'HOLDING_SHARES',
        status: 'ACTIVE',
        closedDate: null
      }
    })

    registerPositionsHandlers(db)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:assign-csp'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111',
      assignmentDate: '2026-01-17'
    })

    expect(assignCspPosition).toHaveBeenCalledWith(db, '11111111-1111-4111-8111-111111111111', {
      positionId: '11111111-1111-4111-8111-111111111111',
      assignmentDate: '2026-01-17'
    })
    expect(result).toMatchObject({
      ok: true,
      position: { phase: 'HOLDING_SHARES' }
    })
  })

  it('positions:assign-csp returns ok:false when assignmentDate is missing', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')

    registerPositionsHandlers({} as never)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:assign-csp'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111'
    })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: 'assignmentDate' })]
    })
  })

  it('positions:assign-csp returns ok:false when positionId is not a UUID', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')

    registerPositionsHandlers({} as never)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:assign-csp'
    )

    const result = await handler?.(null, {
      positionId: 'not-a-uuid',
      assignmentDate: '2026-01-17'
    })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: 'positionId' })]
    })
  })

  it('registers a positions:open-cc handler', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')

    registerPositionsHandlers({} as never)

    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith(
      'positions:open-cc',
      expect.any(Function)
    )
  })

  it('positions:open-cc returns ok:true with position, leg, and snapshot on success', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')
    const db = {} as never

    openCoveredCallPosition.mockReturnValue({
      position: {
        id: 'position-1',
        ticker: 'AAPL',
        phase: 'CC_OPEN',
        status: 'ACTIVE',
        closedDate: null
      },
      leg: { legRole: 'CC_OPEN', action: 'SELL', instrumentType: 'CALL' },
      costBasisSnapshot: { basisPerShare: '174.2000', totalPremiumCollected: '580.0000' }
    })

    registerPositionsHandlers(db)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:open-cc'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111',
      strike: 182,
      expiration: '2026-02-21',
      contracts: 1,
      premiumPerContract: 2.3
    })

    expect(result).toMatchObject({
      ok: true,
      position: { phase: 'CC_OPEN' },
      leg: { legRole: 'CC_OPEN' },
      costBasisSnapshot: { basisPerShare: '174.2000' }
    })
  })

  it('positions:open-cc returns ok:false with validation errors on invalid payload', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')

    registerPositionsHandlers({} as never)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:open-cc'
    )

    // Missing required fields
    const result = await handler?.(null, {})

    expect(result).toMatchObject({ ok: false })
    expect((result as { errors: unknown[] }).errors).toBeDefined()
  })

  it('positions:open-cc returns ok:false when phase is wrong', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')
    const db = {} as never
    const { ValidationError } = await import('../core/lifecycle')

    openCoveredCallPosition.mockImplementation(() => {
      throw new ValidationError(
        '__phase__',
        'invalid_phase',
        'Position is not in HOLDING_SHARES phase'
      )
    })

    registerPositionsHandlers(db)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:open-cc'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111',
      strike: 182,
      expiration: '2026-02-21',
      contracts: 1,
      premiumPerContract: 2.3
    })

    expect(result).toMatchObject({ ok: false })
  })
})
