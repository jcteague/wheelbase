import { ipcMain } from 'electron'
import {
  RemoveAlpacaCredentialsPayloadSchema,
  SaveAlpacaCredentialsPayloadSchema,
  SetActiveBrokerEnvironmentPayloadSchema,
  TestConnectionPayloadSchema,
  type TestConnectionPayload
} from '../schemas'
import type { CredentialStatus, SettingsService } from '../services/settings'
import type { TestConnectionResult } from '../services/settings-connections'
import { handleIpcCall, type IpcFieldError } from './utils'

type SettingsHandlersDependencies = {
  settings: Pick<
    SettingsService,
    | 'getCredentialStatus'
    | 'saveAlpacaCredentials'
    | 'removeAlpacaCredentials'
    | 'setActiveBrokerEnvironment'
  >
  testConnection: (payload: TestConnectionPayload) => Promise<TestConnectionResult>
  onBrokerProviderChanged: () => void
}

type IpcFailure = { ok: false; errors: IpcFieldError[] }

function toFailure(test: Extract<TestConnectionResult, { ok: false }>): IpcFailure {
  return {
    ok: false,
    errors: [{ field: '__root__', code: test.errorCode, message: test.message }]
  }
}

function refreshBrokerIfActive(
  previous: CredentialStatus,
  next: CredentialStatus,
  changedEnvironment: 'paper' | 'live',
  onBrokerProviderChanged: () => void
): void {
  if (
    previous.activeBrokerEnv === changedEnvironment ||
    next.activeBrokerEnv === changedEnvironment
  ) {
    onBrokerProviderChanged()
  }
}

export function registerSettingsHandlers({
  settings,
  testConnection,
  onBrokerProviderChanged
}: SettingsHandlersDependencies): void {
  ipcMain.handle('settings:get-credential-status', () =>
    handleIpcCall('settings_get_credential_status_unhandled_error', () => ({
      status: settings.getCredentialStatus()
    }))
  )

  ipcMain.handle('settings:save-alpaca-credentials', async (_, payload: unknown) => {
    const parsed = SaveAlpacaCredentialsPayloadSchema.safeParse(payload)
    if (!parsed.success) {
      return handleIpcCall('settings_save_alpaca_credentials_validation_error', () => {
        throw parsed.error
      })
    }

    const test = await testConnection({
      vendor: 'alpaca',
      environment: parsed.data.environment,
      keyId: parsed.data.keyId,
      secret: parsed.data.secret
    })

    if (!test.ok) return toFailure(test)
    if (test.vendor !== 'alpaca') {
      return toFailure({
        ok: false,
        errorCode: 'unknown',
        message: 'Unexpected connection result'
      })
    }

    return handleIpcCall('settings_save_alpaca_credentials_unhandled_error', () => {
      const previous = settings.getCredentialStatus()
      const status = settings.saveAlpacaCredentials({
        environment: parsed.data.environment,
        keyId: parsed.data.keyId,
        secret: parsed.data.secret,
        accountNumberMasked: test.accountNumberMasked
      })
      refreshBrokerIfActive(previous, status, parsed.data.environment, onBrokerProviderChanged)
      return { status }
    })
  })

  ipcMain.handle('settings:remove-alpaca-credentials', (_, payload: unknown) =>
    handleIpcCall('settings_remove_alpaca_credentials_unhandled_error', () => {
      const parsed = RemoveAlpacaCredentialsPayloadSchema.parse(payload)
      const previous = settings.getCredentialStatus()
      const status = settings.removeAlpacaCredentials(parsed)
      refreshBrokerIfActive(previous, status, parsed.environment, onBrokerProviderChanged)
      return { status }
    })
  )

  ipcMain.handle('settings:set-active-broker-environment', (_, payload: unknown) =>
    handleIpcCall('settings_set_active_broker_environment_unhandled_error', () => {
      const parsed = SetActiveBrokerEnvironmentPayloadSchema.parse(payload)
      const status = settings.setActiveBrokerEnvironment(parsed)
      onBrokerProviderChanged()
      return { status }
    })
  )

  ipcMain.handle('settings:test-connection', async (_, payload: unknown) => {
    const parsed = TestConnectionPayloadSchema.parse(payload)
    return { ok: true, test: await testConnection(parsed) }
  })
}
