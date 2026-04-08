import { beforeEach, describe, expect, it, vi } from 'vitest'

const assignCspPosition = vi.fn()
const createPosition = vi.fn()
const closeCspPosition = vi.fn()
const closeCoveredCallPosition = vi.fn()
const expireCcPosition = vi.fn()
const expireCspPosition = vi.fn()
const getPosition = vi.fn()
const listPositions = vi.fn()
const openCoveredCallPosition = vi.fn()
const recordCallAwayPosition = vi.fn()
const rollCspPosition = vi.fn()

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
  expireCcPosition,
  expireCspPosition,
  getPosition,
  listPositions,
  openCoveredCallPosition
}))

vi.mock('../services/close-covered-call-position', () => ({
  closeCoveredCallPosition
}))

vi.mock('../services/record-call-away-position', () => ({
  recordCallAwayPosition
}))

vi.mock('../services/roll-csp-position', () => ({
  rollCspPosition
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
    closeCoveredCallPosition.mockReset()
    expireCcPosition.mockReset()
    expireCspPosition.mockReset()
    getPosition.mockReset()
    listPositions.mockReset()
    openCoveredCallPosition.mockReset()
    recordCallAwayPosition.mockReset()
    rollCspPosition.mockReset()
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

  it('registers a positions:close-cc-early handler', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')

    registerPositionsHandlers({} as never)

    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith(
      'positions:close-cc-early',
      expect.any(Function)
    )
  })

  it('positions:close-cc-early returns ok:true with HOLDING_SHARES position and ccLegPnl for valid payload', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')
    const db = {} as never

    closeCoveredCallPosition.mockReturnValue({
      position: {
        id: '11111111-1111-4111-8111-111111111111',
        ticker: 'AAPL',
        phase: 'HOLDING_SHARES',
        status: 'ACTIVE',
        closedDate: null
      },
      leg: { id: 'leg-1', legRole: 'CC_CLOSE', action: 'BUY' },
      ccLegPnl: '120.0000'
    })

    registerPositionsHandlers(db)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:close-cc-early'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111',
      closePricePerContract: 1.1,
      fillDate: '2026-02-01'
    })

    expect(result).toMatchObject({
      ok: true,
      position: { phase: 'HOLDING_SHARES' },
      ccLegPnl: '120.0000'
    })
  })

  it('positions:close-cc-early returns ok:false for invalid_phase (position not in CC_OPEN)', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')
    const db = {} as never
    const { ValidationError } = await import('../core/lifecycle')

    closeCoveredCallPosition.mockImplementation(() => {
      throw new ValidationError(
        '__phase__',
        'invalid_phase',
        'No open covered call on this position'
      )
    })

    registerPositionsHandlers(db)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:close-cc-early'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111',
      closePricePerContract: 1.1,
      fillDate: '2026-02-01'
    })

    expect(result).toMatchObject({ ok: false })
    expect((result as { errors: unknown[] }).errors).toBeDefined()
  })

  it('positions:close-cc-early returns ok:false for zero closePricePerContract (Zod validation)', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')

    registerPositionsHandlers({} as never)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:close-cc-early'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111',
      closePricePerContract: 0
    })

    expect(result).toMatchObject({ ok: false })
    expect((result as { errors: unknown[] }).errors).toBeDefined()
  })

  it('positions:close-cc-early returns ok:false for invalid positionId (Zod validation)', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')

    registerPositionsHandlers({} as never)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:close-cc-early'
    )

    const result = await handler?.(null, {
      positionId: 'not-a-uuid',
      closePricePerContract: 1.1
    })

    expect(result).toMatchObject({ ok: false })
    expect((result as { errors: unknown[] }).errors).toBeDefined()
  })

  it('registers a positions:record-call-away handler', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')

    registerPositionsHandlers({} as never)

    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith(
      'positions:record-call-away',
      expect.any(Function)
    )
  })

  it('positions:record-call-away returns ok:true with WHEEL_COMPLETE position and finalPnl for valid positionId', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')
    const db = {} as never

    recordCallAwayPosition.mockReturnValue({
      position: {
        id: '11111111-1111-4111-8111-111111111111',
        ticker: 'AAPL',
        phase: 'WHEEL_COMPLETE',
        status: 'CLOSED',
        closedDate: '2026-02-21'
      },
      leg: { legRole: 'CALLED_AWAY', action: 'EXERCISE', instrumentType: 'CALL' },
      costBasisSnapshot: {
        basisPerShare: '174.2000',
        totalPremiumCollected: '580.0000',
        finalPnl: '780.0000'
      },
      finalPnl: '780.0000',
      cycleDays: 99,
      annualizedReturn: '16.5084',
      basisPerShare: '174.2000'
    })

    registerPositionsHandlers(db)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:record-call-away'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111'
    })

    expect(result).toMatchObject({
      ok: true,
      position: { phase: 'WHEEL_COMPLETE' },
      finalPnl: '780.0000'
    })
  })

  it('positions:record-call-away returns ok:false when positionId is not a UUID', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')

    registerPositionsHandlers({} as never)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:record-call-away'
    )

    const result = await handler?.(null, { positionId: 'not-a-uuid' })

    expect(result).toMatchObject({ ok: false })
    expect((result as { errors: { field: string }[] }).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'positionId' })])
    )
  })

  it('positions:record-call-away returns ok:false for invalid_phase (not in CC_OPEN)', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')
    const db = {} as never
    const { ValidationError } = await import('../core/lifecycle')

    recordCallAwayPosition.mockImplementation(() => {
      throw new ValidationError(
        '__phase__',
        'invalid_phase',
        'No open covered call on this position'
      )
    })

    registerPositionsHandlers(db)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:record-call-away'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111'
    })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: '__phase__', code: 'invalid_phase' })]
    })
  })

  it('positions:record-call-away returns ok:false for multi_contract_unsupported', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')
    const db = {} as never
    const { ValidationError } = await import('../core/lifecycle')

    recordCallAwayPosition.mockImplementation(() => {
      throw new ValidationError(
        'contracts',
        'multi_contract_unsupported',
        'Multi-contract call-away is not yet supported'
      )
    })

    registerPositionsHandlers(db)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:record-call-away'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111'
    })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: 'contracts', code: 'multi_contract_unsupported' })]
    })
  })

  it('registers a positions:expire-cc handler', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')

    registerPositionsHandlers({} as never)

    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith(
      'positions:expire-cc',
      expect.any(Function)
    )
  })

  it('positions:expire-cc returns ok:true with position, leg, costBasisSnapshot, sharesHeld for valid payload', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')
    const db = {} as never

    expireCcPosition.mockReturnValue({
      position: {
        id: '11111111-1111-4111-8111-111111111111',
        ticker: 'AAPL',
        phase: 'HOLDING_SHARES',
        status: 'ACTIVE',
        closedDate: null
      },
      leg: { legRole: 'CC_EXPIRED', action: 'EXPIRE', instrumentType: 'CALL' },
      costBasisSnapshot: { basisPerShare: '174.2000', totalPremiumCollected: '580.0000' },
      sharesHeld: 100
    })

    registerPositionsHandlers(db)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:expire-cc'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111'
    })

    expect(expireCcPosition).toHaveBeenCalledWith(db, '11111111-1111-4111-8111-111111111111', {
      positionId: '11111111-1111-4111-8111-111111111111'
    })
    expect(result).toMatchObject({
      ok: true,
      position: { phase: 'HOLDING_SHARES' },
      leg: { legRole: 'CC_EXPIRED' },
      sharesHeld: 100
    })
  })

  it('positions:expire-cc returns ok:false with invalid_string error when positionId is not a UUID', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')

    registerPositionsHandlers({} as never)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:expire-cc'
    )

    const result = await handler?.(null, { positionId: 'not-a-uuid' })

    expect(result).toMatchObject({ ok: false })
    expect(
      (result as { errors: Array<{ code: string }> }).errors.some((e) => e.code.includes('invalid'))
    ).toBe(true)
  })

  it('positions:expire-cc returns ok:false with ValidationError errors when service throws', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')
    const db = {} as never
    const { ValidationError } = await import('../core/lifecycle')

    expireCcPosition.mockImplementation(() => {
      throw new ValidationError(
        '__phase__',
        'invalid_phase',
        'No open covered call on this position'
      )
    })

    registerPositionsHandlers(db)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:expire-cc'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111'
    })

    expect(result).toMatchObject({
      ok: false,
      errors: [
        {
          field: '__phase__',
          code: 'invalid_phase',
          message: 'No open covered call on this position'
        }
      ]
    })
  })

  it('positions:roll-csp returns ok:true with position, rollFromLeg, rollToLeg, rollChainId, costBasisSnapshot on success', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')
    const db = {} as never

    rollCspPosition.mockReturnValue({
      position: {
        id: '11111111-1111-4111-8111-111111111111',
        ticker: 'AAPL',
        phase: 'CSP_OPEN',
        status: 'ACTIVE'
      },
      rollFromLeg: {
        id: 'leg-from-1',
        legRole: 'ROLL_FROM',
        action: 'BUY',
        instrumentType: 'PUT',
        strike: '180.0000',
        expiration: '2026-04-18',
        contracts: 1,
        premiumPerContract: '1.2000'
      },
      rollToLeg: {
        id: 'leg-to-1',
        legRole: 'ROLL_TO',
        action: 'SELL',
        instrumentType: 'PUT',
        strike: '180.0000',
        expiration: '2026-05-16',
        contracts: 1,
        premiumPerContract: '2.8000'
      },
      rollChainId: 'chain-uuid-1',
      costBasisSnapshot: {
        id: 'snap-1',
        positionId: '11111111-1111-4111-8111-111111111111',
        basisPerShare: '176.9000',
        totalPremiumCollected: '510.0000',
        finalPnl: null,
        snapshotAt: '2026-04-06T00:00:00.000Z',
        createdAt: '2026-04-06T00:00:00.000Z'
      }
    })

    registerPositionsHandlers(db)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:roll-csp'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111',
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: '2026-05-16'
    })

    expect(rollCspPosition).toHaveBeenCalledWith(db, '11111111-1111-4111-8111-111111111111', {
      positionId: '11111111-1111-4111-8111-111111111111',
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: '2026-05-16'
    })
    expect(result).toMatchObject({
      ok: true,
      position: { phase: 'CSP_OPEN' },
      rollFromLeg: { legRole: 'ROLL_FROM', action: 'BUY' },
      rollToLeg: { legRole: 'ROLL_TO', action: 'SELL' },
      rollChainId: 'chain-uuid-1',
      costBasisSnapshot: { basisPerShare: '176.9000' }
    })
  })

  it('positions:roll-csp returns ok:false when service throws ValidationError', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')
    const db = {} as never
    const { ValidationError } = await import('../core/lifecycle')

    rollCspPosition.mockImplementation(() => {
      throw new ValidationError(
        'newExpiration',
        'must_be_after_current',
        'New expiration must be after current expiration'
      )
    })

    registerPositionsHandlers(db)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:roll-csp'
    )

    const result = await handler?.(null, {
      positionId: '11111111-1111-4111-8111-111111111111',
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: '2026-03-15'
    })

    expect(result).toMatchObject({
      ok: false,
      errors: [
        {
          field: 'newExpiration',
          code: 'must_be_after_current',
          message: 'New expiration must be after current expiration'
        }
      ]
    })
  })

  it('positions:roll-csp returns ok:false when Zod rejects malformed payload (missing positionId)', async () => {
    const { ipcMain } = await import('electron')
    const { registerPositionsHandlers } = await import('./positions')

    registerPositionsHandlers({} as never)

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'positions:roll-csp'
    )

    const result = await handler?.(null, {
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: '2026-05-16'
    })

    expect(result).toMatchObject({ ok: false })
    expect((result as { errors: unknown[] }).errors).toBeDefined()
    expect((result as { errors: Array<{ field: string }> }).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'positionId' })])
    )
  })
})
