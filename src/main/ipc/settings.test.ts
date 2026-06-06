import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AlpacaCredentials, CredentialStatus } from '../services/settings'
import type { TestConnectionResult } from '../services/settings-connections'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

const STATUS: CredentialStatus = {
  massive: 'configured',
  alpacaPaper: 'configured',
  alpacaLive: 'missing',
  activeBrokerEnv: 'paper',
  massiveLastCheckedAt: null,
  alpacaPaperAccountNumberMasked: 'PA…ABC',
  alpacaLiveAccountNumberMasked: null
}

const DEFAULT_ALPACA_CREDENTIALS: AlpacaCredentials = {
  environment: 'paper',
  keyId: 'PK123',
  secret: 'SECRET123'
}

const settings = {
  getCredentialStatus: vi.fn(() => STATUS),
  saveAlpacaCredentials: vi.fn(() => STATUS),
  saveVerifiedAlpacaCredentials: vi.fn().mockResolvedValue({
    status: STATUS,
    test: {
      ok: true,
      vendor: 'alpaca' as const,
      environment: 'paper' as const,
      accountNumberMasked: 'PA…ABC'
    },
    refreshBroker: false
  }),
  removeAlpacaCredentials: vi.fn(() => STATUS),
  setActiveBrokerEnvironment: vi.fn(() => STATUS),
  loadAlpacaCredentials: vi.fn<(_: 'paper' | 'live') => AlpacaCredentials | null>(
    () => DEFAULT_ALPACA_CREDENTIALS
  )
}

const testConnection = vi.fn<(_: unknown) => Promise<TestConnectionResult>>()
const onBrokerProviderChanged = vi.fn()

function getHandler(
  calls: Array<[string, (...args: unknown[]) => unknown]>,
  channel: string
): (...args: unknown[]) => unknown {
  const entry = calls.find(([name]) => name === channel)
  if (!entry) throw new Error(`Handler not registered for channel: ${channel}`)
  return entry[1]
}

describe('registerSettingsHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settings.getCredentialStatus.mockReturnValue(STATUS)
    settings.saveAlpacaCredentials.mockReturnValue(STATUS)
    settings.saveVerifiedAlpacaCredentials.mockResolvedValue({
      status: STATUS,
      test: {
        ok: true,
        vendor: 'alpaca',
        environment: 'paper',
        accountNumberMasked: 'PA…ABC'
      },
      refreshBroker: false
    })
    settings.removeAlpacaCredentials.mockReturnValue(STATUS)
    settings.setActiveBrokerEnvironment.mockReturnValue(STATUS)
    testConnection.mockResolvedValue({
      ok: true,
      vendor: 'massive',
      status: 'connected'
    })
  })

  it('registers settings IPC channels', async () => {
    const { ipcMain } = await import('electron')
    const { registerSettingsHandlers } = await import('./settings')

    registerSettingsHandlers({ settings, testConnection, onBrokerProviderChanged })

    const channels = vi.mocked(ipcMain.handle).mock.calls.map(([channel]) => channel as string)
    expect(channels).toEqual(
      expect.arrayContaining([
        'settings:get-credential-status',
        'settings:save-alpaca-credentials',
        'settings:remove-alpaca-credentials',
        'settings:set-active-broker-environment',
        'settings:test-connection',
        'settings:test-stored-alpaca-connection'
      ])
    )
  })

  it('settings:get-credential-status returns the current credential status', async () => {
    const { ipcMain } = await import('electron')
    const { registerSettingsHandlers } = await import('./settings')

    registerSettingsHandlers({ settings, testConnection, onBrokerProviderChanged })
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'settings:get-credential-status'
    )

    const result = await handler(null, undefined)

    expect(result).toEqual({ ok: true, status: STATUS })
  })

  it('settings:save-alpaca-credentials validates environment, keyId, and secret', async () => {
    const { ipcMain } = await import('electron')
    const { registerSettingsHandlers } = await import('./settings')

    registerSettingsHandlers({ settings, testConnection, onBrokerProviderChanged })
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'settings:save-alpaca-credentials'
    )

    const result = await handler(null, {
      environment: 'demo',
      keyId: '   ',
      secret: ''
    })

    expect(result).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ field: 'environment' }),
        expect.objectContaining({ field: 'keyId' }),
        expect.objectContaining({ field: 'secret' })
      ])
    })
  })

  it('settings:set-active-broker-environment rejects switching to live when live credentials are missing', async () => {
    const { ipcMain } = await import('electron')
    const { registerSettingsHandlers } = await import('./settings')

    settings.setActiveBrokerEnvironment.mockImplementation(() => {
      throw new Error('Alpaca live credentials are not configured')
    })

    registerSettingsHandlers({ settings, testConnection, onBrokerProviderChanged })
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'settings:set-active-broker-environment'
    )

    const result = await handler(null, { environment: 'live' })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'internal_error' })]
    })
  })

  it('settings:test-connection returns a typed failure result without throwing', async () => {
    const { ipcMain } = await import('electron')
    const { registerSettingsHandlers } = await import('./settings')

    testConnection.mockResolvedValue({
      ok: false,
      errorCode: 'environment_mismatch',
      message: 'Environment mismatch — these are LIVE keys, not paper keys'
    })

    registerSettingsHandlers({ settings, testConnection, onBrokerProviderChanged })
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'settings:test-connection'
    )

    const result = await handler(null, {
      vendor: 'alpaca',
      environment: 'paper',
      keyId: 'AKLIVE123',
      secret: 'secret'
    })

    expect(result).toEqual({
      ok: true,
      test: {
        ok: false,
        errorCode: 'environment_mismatch',
        message: 'Environment mismatch — these are LIVE keys, not paper keys'
      }
    })
  })

  it('settings:test-connection converts invalid payloads into ok:false errors', async () => {
    const { ipcMain } = await import('electron')
    const { registerSettingsHandlers } = await import('./settings')

    registerSettingsHandlers({ settings, testConnection, onBrokerProviderChanged })
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'settings:test-connection'
    )

    const result = await handler(null, {
      vendor: 'alpaca',
      environment: 'paper',
      keyId: '   ',
      secret: ''
    })

    expect(result).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ field: 'keyId' }),
        expect.objectContaining({ field: 'secret' })
      ])
    })
  })

  it('settings:save-alpaca-credentials converts probe exceptions into ok:false errors', async () => {
    const { ipcMain } = await import('electron')
    const { registerSettingsHandlers } = await import('./settings')

    settings.saveVerifiedAlpacaCredentials.mockRejectedValueOnce(new Error('keyId is required'))

    registerSettingsHandlers({ settings, testConnection, onBrokerProviderChanged })
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'settings:save-alpaca-credentials'
    )

    const result = await handler(null, {
      environment: 'paper',
      keyId: 'PK123',
      secret: 'SECRET123'
    })

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: '__root__',
          code: 'internal_error',
          message: 'An unexpected error occurred'
        }
      ]
    })
  })

  it('settings:save-alpaca-credentials returns the verified Alpaca test result with status', async () => {
    const { ipcMain } = await import('electron')
    const { registerSettingsHandlers } = await import('./settings')

    settings.saveVerifiedAlpacaCredentials.mockResolvedValueOnce({
      status: STATUS,
      test: {
        ok: true,
        vendor: 'alpaca',
        environment: 'paper',
        accountNumberMasked: 'PA…FRESH'
      },
      refreshBroker: true
    })

    registerSettingsHandlers({ settings, testConnection, onBrokerProviderChanged })
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'settings:save-alpaca-credentials'
    )

    const result = await handler(null, {
      environment: 'paper',
      keyId: 'PK123',
      secret: 'SECRET123'
    })

    expect(settings.saveVerifiedAlpacaCredentials).toHaveBeenCalledWith({
      environment: 'paper',
      keyId: 'PK123',
      secret: 'SECRET123'
    })
    expect(result).toEqual({
      ok: true,
      status: STATUS,
      test: {
        ok: true,
        vendor: 'alpaca',
        environment: 'paper',
        accountNumberMasked: 'PA…FRESH'
      }
    })
    expect(onBrokerProviderChanged).toHaveBeenCalledOnce()
  })

  it('settings:test-stored-alpaca-connection loads saved credentials before probing Alpaca', async () => {
    const { ipcMain } = await import('electron')
    const { registerSettingsHandlers } = await import('./settings')

    testConnection.mockResolvedValue({
      ok: true,
      vendor: 'alpaca',
      environment: 'paper',
      accountNumberMasked: 'PA…ABC'
    })

    registerSettingsHandlers({ settings, testConnection, onBrokerProviderChanged })
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'settings:test-stored-alpaca-connection'
    )

    const result = await handler(null, { environment: 'paper' })

    expect(settings.loadAlpacaCredentials).toHaveBeenCalledWith('paper')
    expect(testConnection).toHaveBeenCalledWith({
      vendor: 'alpaca',
      environment: 'paper',
      keyId: 'PK123',
      secret: 'SECRET123'
    })
    expect(result).toEqual({
      ok: true,
      test: {
        ok: true,
        vendor: 'alpaca',
        environment: 'paper',
        accountNumberMasked: 'PA…ABC'
      }
    })
  })

  it('settings:test-stored-alpaca-connection returns validation errors when saved credentials are missing', async () => {
    const { ipcMain } = await import('electron')
    const { registerSettingsHandlers } = await import('./settings')

    settings.loadAlpacaCredentials.mockReturnValueOnce(null)

    registerSettingsHandlers({ settings, testConnection, onBrokerProviderChanged })
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'settings:test-stored-alpaca-connection'
    )

    const result = await handler(null, { environment: 'live' })

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: 'environment',
          code: 'missing_credentials',
          message: 'Alpaca live credentials are not configured'
        }
      ]
    })
    expect(testConnection).not.toHaveBeenCalled()
  })
})
