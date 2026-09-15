import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrokerError, type AccountInfo } from '../integrations/broker-provider'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() }
}))

const provider = {
  getAccountInfo: vi.fn(),
  getActivities: vi.fn()
}

function getHandler(
  calls: Array<[string, (...args: unknown[]) => unknown]>,
  channel: string
): (...args: unknown[]) => unknown {
  const entry = calls.find(([c]) => c === channel)
  if (!entry) throw new Error(`Handler not registered for channel: ${channel}`)
  return entry[1]
}

const ACCOUNT_FIXTURE: AccountInfo = {
  buyingPower: '10000.00',
  portfolioValue: '50000.00',
  cash: '10000.00',
  environment: 'paper',
  accountNumberMasked: 'PA…ABC'
}

describe('registerBrokerHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // The registrar accepts a provider or a getter; the getter form is what index.ts uses,
  // so that credentials changed at runtime take effect without a restart.
  it('resolves a provider getter on every call', async () => {
    const { ipcMain } = await import('electron')
    const { registerBrokerHandlers } = await import('./broker')

    provider.getAccountInfo.mockResolvedValue(ACCOUNT_FIXTURE)
    const getProvider = vi.fn(() => provider)
    registerBrokerHandlers(getProvider)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'broker:account'
    )

    await handler(null, undefined)

    expect(getProvider).toHaveBeenCalled()
  })

  it('registers the broker:account and broker:activities channels', async () => {
    const { ipcMain } = await import('electron')
    const { registerBrokerHandlers } = await import('./broker')

    registerBrokerHandlers(provider)

    const channels = vi.mocked(ipcMain.handle).mock.calls.map(([c]) => c as string)
    expect(channels).toContain('broker:account')
    expect(channels).toContain('broker:activities')
  })

  it('broker:account returns { ok: true, account } on success', async () => {
    const { ipcMain } = await import('electron')
    const { registerBrokerHandlers } = await import('./broker')

    provider.getAccountInfo.mockResolvedValue(ACCOUNT_FIXTURE)

    registerBrokerHandlers(provider)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'broker:account'
    )

    const result = await handler(null, undefined)

    expect(result).toMatchObject({
      ok: true,
      account: expect.objectContaining({ environment: 'paper', accountNumberMasked: 'PA…ABC' })
    })
  })

  it('broker:activities passes since filter through to provider and returns { ok: true, activities }', async () => {
    const { ipcMain } = await import('electron')
    const { registerBrokerHandlers } = await import('./broker')

    provider.getActivities.mockResolvedValue([])

    registerBrokerHandlers(provider)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'broker:activities'
    )

    const result = await handler(null, { type: 'OPASN', since: '2024-01-01T00:00:00Z' })

    expect(provider.getActivities).toHaveBeenCalledWith({
      type: 'OPASN',
      since: '2024-01-01T00:00:00Z'
    })
    expect(result).toMatchObject({ ok: true, activities: [] })
  })

  // [US-116] The session is a market fact; it is served by market-data:market-status.
  it('does not register broker:market-status', async () => {
    const { ipcMain } = await import('electron')
    const { registerBrokerHandlers } = await import('./broker')

    registerBrokerHandlers(provider)

    const channels = vi.mocked(ipcMain.handle).mock.calls.map(([c]) => c as string)
    expect(channels).toContain('broker:account')
    expect(channels).toContain('broker:activities')
    expect(channels).not.toContain('broker:market-status')
  })

  it('broker:account returns { ok: false, errors, code } on BrokerError', async () => {
    const { ipcMain } = await import('electron')
    const { registerBrokerHandlers } = await import('./broker')

    provider.getAccountInfo.mockRejectedValue(new BrokerError('auth_failed', 'bad creds'))

    registerBrokerHandlers(provider)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'broker:account'
    )

    const result = await handler(null, undefined)

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: '__root__', code: 'auth_failed' })]
    })
  })

  it('broker:account IPC includes deeplink when BrokerError carries one', async () => {
    const { ipcMain } = await import('electron')
    const { registerBrokerHandlers } = await import('./broker')

    provider.getAccountInfo.mockRejectedValue(
      new BrokerError(
        'auth_failed',
        'Alpaca credentials not configured',
        'settings/credentials/alpaca'
      )
    )

    registerBrokerHandlers(provider)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'broker:account'
    )

    const result = await handler(null, undefined)

    expect(result).toMatchObject({
      ok: false,
      deeplink: 'settings/credentials/alpaca',
      errors: [
        { field: '__root__', code: 'auth_failed', message: 'Alpaca credentials not configured' }
      ]
    })
  })
})
