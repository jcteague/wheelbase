import { ipcMain } from 'electron'
import {
  RemoveAlpacaCredentialsPayloadSchema,
  SaveAlpacaCredentialsPayloadSchema,
  SetActiveBrokerEnvironmentPayloadSchema,
  TestConnectionPayloadSchema,
  TestStoredAlpacaConnectionPayloadSchema,
  type TestConnectionPayload
} from '../schemas'
import { ValidationError } from '../core/lifecycle'
import { logger } from '../logger'
import type { CredentialStatus, SettingsService } from '../services/settings'
import type { TestConnectionResult } from '../services/settings-connections'
import { handleIpcCall } from './utils'

type SettingsHandlersDependencies = {
  settings: Pick<
    SettingsService,
    | 'getCredentialStatus'
    | 'saveVerifiedAlpacaCredentials'
    | 'removeAlpacaCredentials'
    | 'setActiveBrokerEnvironment'
    | 'loadAlpacaCredentials'
  >
  testConnection: (payload: TestConnectionPayload) => Promise<TestConnectionResult>
  onBrokerProviderChanged: () => void
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

  ipcMain.handle('settings:save-alpaca-credentials', (_, payload: unknown) =>
    handleIpcCall('settings_save_alpaca_credentials_unhandled_error', async () => {
      const parsed = SaveAlpacaCredentialsPayloadSchema.parse(payload)
      logger.debug(
        { environment: parsed.environment },
        'settings_save_alpaca_credentials_requested'
      )
      const result = await settings.saveVerifiedAlpacaCredentials(parsed)
      if (result.refreshBroker) {
        onBrokerProviderChanged()
      }
      return { status: result.status, test: result.test }
    })
  )

  ipcMain.handle('settings:remove-alpaca-credentials', (_, payload: unknown) =>
    handleIpcCall('settings_remove_alpaca_credentials_unhandled_error', () => {
      const parsed = RemoveAlpacaCredentialsPayloadSchema.parse(payload)
      logger.debug(
        { environment: parsed.environment },
        'settings_remove_alpaca_credentials_requested'
      )
      const previous = settings.getCredentialStatus()
      const status = settings.removeAlpacaCredentials(parsed)
      refreshBrokerIfActive(previous, status, parsed.environment, onBrokerProviderChanged)
      return { status }
    })
  )

  ipcMain.handle('settings:set-active-broker-environment', (_, payload: unknown) =>
    handleIpcCall('settings_set_active_broker_environment_unhandled_error', () => {
      const parsed = SetActiveBrokerEnvironmentPayloadSchema.parse(payload)
      logger.debug(
        { environment: parsed.environment },
        'settings_set_active_broker_environment_requested'
      )
      const status = settings.setActiveBrokerEnvironment(parsed)
      onBrokerProviderChanged()
      return { status }
    })
  )

  ipcMain.handle('settings:test-connection', (_, payload: unknown) =>
    handleIpcCall('settings_test_connection_unhandled_error', async () => {
      const parsed = TestConnectionPayloadSchema.parse(payload)
      logger.debug(
        parsed.vendor === 'alpaca'
          ? { vendor: parsed.vendor, environment: parsed.environment }
          : { vendor: parsed.vendor },
        'settings_test_connection_requested'
      )
      return { test: await testConnection(parsed) }
    })
  )

  ipcMain.handle('settings:test-stored-alpaca-connection', async (_, payload: unknown) =>
    handleIpcCall('settings_test_stored_alpaca_connection_unhandled_error', async () => {
      const parsed = TestStoredAlpacaConnectionPayloadSchema.parse(payload)
      logger.debug(
        { environment: parsed.environment },
        'settings_test_stored_alpaca_connection_requested'
      )
      const credentials = settings.loadAlpacaCredentials(parsed.environment)
      if (!credentials) {
        throw new ValidationError(
          'environment',
          'missing_credentials',
          `Alpaca ${parsed.environment} credentials are not configured`
        )
      }

      return {
        test: await testConnection({
          vendor: 'alpaca',
          environment: parsed.environment,
          keyId: credentials.keyId,
          secret: credentials.secret
        })
      }
    })
  )
}
