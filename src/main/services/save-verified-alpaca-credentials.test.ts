import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { saveVerifiedAlpacaCredentials } from './save-verified-alpaca-credentials'
import type { AlpacaCredentials, CredentialStatus } from './settings'
import type { TestConnectionResult } from './settings-connections'

const STATUS: CredentialStatus = {
  marketData: 'missing',
  alpacaPaper: 'configured',
  alpacaLive: 'missing',
  activeBrokerEnv: 'none',
  alpacaPaperAccountNumberMasked: 'PA…ABC',
  alpacaLiveAccountNumberMasked: null
}

function createDependencies(
  overrides: Partial<{
    previousStatus: CredentialStatus
    nextStatus: CredentialStatus
    testResult: TestConnectionResult
  }> = {}
): {
  getCredentialStatus: () => CredentialStatus
  saveAlpacaCredentials: (input: {
    environment: 'paper' | 'live'
    keyId: string
    secret: string
    accountNumberMasked?: string | null
  }) => CredentialStatus
  testAlpacaConnection: (input: AlpacaCredentials) => Promise<TestConnectionResult>
} {
  const previousStatus = overrides.previousStatus ?? STATUS
  const nextStatus = overrides.nextStatus ?? STATUS
  const testResult =
    overrides.testResult ??
    ({
      ok: true,
      vendor: 'alpaca',
      environment: 'paper',
      accountNumberMasked: 'PA…ABC'
    } satisfies TestConnectionResult)

  const getCredentialStatus = vi.fn<() => CredentialStatus>(() => previousStatus)
  const saveAlpacaCredentials = vi.fn<
    (input: {
      environment: 'paper' | 'live'
      keyId: string
      secret: string
      accountNumberMasked?: string | null
    }) => CredentialStatus
  >(() => nextStatus)
  const testAlpacaConnection = vi.fn<(input: AlpacaCredentials) => Promise<TestConnectionResult>>(
    () => Promise.resolve(testResult)
  )

  return { getCredentialStatus, saveAlpacaCredentials, testAlpacaConnection }
}

describe('saveVerifiedAlpacaCredentials', () => {
  it('verifies first, saves the masked account, and returns refreshBroker=false by default', async () => {
    const deps = createDependencies()

    const result = await saveVerifiedAlpacaCredentials(deps, {
      environment: 'paper',
      keyId: '  PKPAPER123  ',
      secret: ' paper-secret '
    })

    expect(deps.testAlpacaConnection).toHaveBeenCalledWith({
      environment: 'paper',
      keyId: 'PKPAPER123',
      secret: 'paper-secret'
    })
    expect(deps.saveAlpacaCredentials).toHaveBeenCalledWith({
      environment: 'paper',
      keyId: 'PKPAPER123',
      secret: 'paper-secret',
      accountNumberMasked: 'PA…ABC'
    })
    expect(result).toEqual({
      status: STATUS,
      test: {
        ok: true,
        vendor: 'alpaca',
        environment: 'paper',
        accountNumberMasked: 'PA…ABC'
      },
      refreshBroker: false
    })
  })

  it('returns refreshBroker=true when the changed environment is active before save', async () => {
    const deps = createDependencies({
      previousStatus: { ...STATUS, activeBrokerEnv: 'paper' }
    })

    const result = await saveVerifiedAlpacaCredentials(deps, {
      environment: 'paper',
      keyId: 'PKPAPER123',
      secret: 'paper-secret'
    })

    expect(result.refreshBroker).toBe(true)
  })

  it('throws ValidationError when verification fails', async () => {
    const deps = createDependencies({
      testResult: {
        ok: false,
        errorCode: 'auth_failed',
        message: 'Authentication failed (401)'
      }
    })

    await expect(
      saveVerifiedAlpacaCredentials(deps, {
        environment: 'paper',
        keyId: 'PKPAPER123',
        secret: 'paper-secret'
      })
    ).rejects.toMatchObject({
      field: '__root__',
      code: 'auth_failed',
      message: 'Authentication failed (401)'
    })
  })

  it('throws ValidationError when keyId is blank', async () => {
    const deps = createDependencies()

    await expect(
      saveVerifiedAlpacaCredentials(deps, {
        environment: 'paper',
        keyId: '   ',
        secret: 'paper-secret'
      })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(deps.testAlpacaConnection).not.toHaveBeenCalled()
    expect(deps.saveAlpacaCredentials).not.toHaveBeenCalled()
  })
})
