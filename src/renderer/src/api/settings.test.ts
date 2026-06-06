import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCredentialStatus,
  removeAlpacaCredentials,
  saveAlpacaCredentials,
  setActiveBrokerEnvironment,
  testStoredAlpacaConnection,
  testSettingsConnection
} from './settings'

const mockSettingsStatus = vi.fn()
const mockSettingsSaveAlpaca = vi.fn()
const mockSettingsRemoveAlpaca = vi.fn()
const mockSettingsSetActiveBrokerEnvironment = vi.fn()
const mockSettingsTestConnection = vi.fn()
const mockSettingsTestStoredAlpacaConnection = vi.fn()

const STATUS_FIXTURE = {
  massive: 'configured' as const,
  alpacaPaper: 'configured' as const,
  alpacaLive: 'missing' as const,
  activeBrokerEnv: 'paper' as const,
  massiveLastCheckedAt: null,
  alpacaPaperAccountNumberMasked: 'PA…ABC',
  alpacaLiveAccountNumberMasked: null
}

beforeEach(() => {
  mockSettingsStatus.mockReset()
  mockSettingsSaveAlpaca.mockReset()
  mockSettingsRemoveAlpaca.mockReset()
  mockSettingsSetActiveBrokerEnvironment.mockReset()
  mockSettingsTestConnection.mockReset()
  mockSettingsTestStoredAlpacaConnection.mockReset()

  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      settings: {
        status: mockSettingsStatus,
        saveAlpaca: mockSettingsSaveAlpaca,
        removeAlpaca: mockSettingsRemoveAlpaca,
        setActiveBrokerEnvironment: mockSettingsSetActiveBrokerEnvironment,
        testConnection: mockSettingsTestConnection,
        testStoredAlpacaConnection: mockSettingsTestStoredAlpacaConnection
      }
    }
  })
})

describe('getCredentialStatus', () => {
  it('calls window.api.settings.status and unwraps status', async () => {
    mockSettingsStatus.mockResolvedValue({ ok: true, status: STATUS_FIXTURE })

    await expect(getCredentialStatus()).resolves.toEqual(STATUS_FIXTURE)
    expect(mockSettingsStatus).toHaveBeenCalledOnce()
  })
})

describe('settings mutations', () => {
  it('saveAlpacaCredentials returns the refreshed status and verified account', async () => {
    mockSettingsSaveAlpaca.mockResolvedValue({
      ok: true,
      status: STATUS_FIXTURE,
      test: {
        ok: true,
        vendor: 'alpaca',
        environment: 'paper',
        accountNumberMasked: 'PA…FRESH'
      }
    })

    await expect(
      saveAlpacaCredentials({
        environment: 'paper',
        keyId: 'KEY123',
        secret: 'SECRET123'
      })
    ).resolves.toEqual({
      status: STATUS_FIXTURE,
      test: {
        ok: true,
        vendor: 'alpaca',
        environment: 'paper',
        accountNumberMasked: 'PA…FRESH'
      }
    })
  })

  it('removeAlpacaCredentials returns the refreshed status', async () => {
    mockSettingsRemoveAlpaca.mockResolvedValue({ ok: true, status: STATUS_FIXTURE })

    await expect(removeAlpacaCredentials({ environment: 'paper' })).resolves.toEqual(STATUS_FIXTURE)
  })

  it('setActiveBrokerEnvironment returns the refreshed status', async () => {
    mockSettingsSetActiveBrokerEnvironment.mockResolvedValue({ ok: true, status: STATUS_FIXTURE })

    await expect(setActiveBrokerEnvironment({ environment: 'paper' })).resolves.toEqual(
      STATUS_FIXTURE
    )
  })
})

describe('testSettingsConnection', () => {
  it('returns the typed test result', async () => {
    const testResult = {
      ok: true as const,
      vendor: 'alpaca' as const,
      environment: 'paper' as const,
      accountNumberMasked: 'PA…ABC'
    }
    mockSettingsTestConnection.mockResolvedValue({ ok: true, test: testResult })

    await expect(
      testSettingsConnection({
        vendor: 'alpaca',
        environment: 'paper',
        keyId: 'KEY123',
        secret: 'SECRET123'
      })
    ).resolves.toEqual(testResult)
  })
})

describe('testStoredAlpacaConnection', () => {
  it('returns the typed stored-credential test result', async () => {
    const testResult = {
      ok: true as const,
      vendor: 'alpaca' as const,
      environment: 'paper' as const,
      accountNumberMasked: 'PA…ABC'
    }
    mockSettingsTestStoredAlpacaConnection.mockResolvedValue({ ok: true, test: testResult })

    await expect(testStoredAlpacaConnection({ environment: 'paper' })).resolves.toEqual(testResult)
  })
})
