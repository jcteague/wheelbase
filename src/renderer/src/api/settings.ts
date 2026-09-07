import { apiError, type ApiError, type IpcResult } from './error'

export type { ApiError }

export type CredentialState = 'configured' | 'missing'
export type ActiveBrokerEnvironment = 'paper' | 'live' | 'none'

export type CredentialStatus = {
  marketData: CredentialState
  alpacaPaper: CredentialState
  alpacaLive: CredentialState
  activeBrokerEnv: ActiveBrokerEnvironment
  alpacaPaperAccountNumberMasked: string | null
  alpacaLiveAccountNumberMasked: string | null
}

export type SaveAlpacaCredentialsPayload = {
  environment: 'paper' | 'live'
  keyId: string
  secret: string
}

export type SaveAlpacaCredentialsResult = {
  status: CredentialStatus
  test: Extract<TestSettingsConnectionResult, { ok: true; vendor: 'alpaca' }>
}

export type RemoveAlpacaCredentialsPayload = {
  environment: 'paper' | 'live'
}

export type SetActiveBrokerEnvironmentPayload = {
  environment: 'paper' | 'live'
}

export type TestStoredAlpacaConnectionPayload = {
  environment: 'paper' | 'live'
}

export type TestSettingsConnectionPayload = {
  vendor: 'alpaca'
  environment: 'paper' | 'live'
  keyId: string
  secret: string
}

export type TestSettingsConnectionResult =
  | {
      ok: true
      vendor: 'alpaca'
      environment: 'paper' | 'live'
      accountNumberMasked: string
    }
  | { ok: false; errorCode: string; message: string }

function unwrapStatus(result: IpcResult<{ status: CredentialStatus }>): CredentialStatus {
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return result.status
}

export async function getCredentialStatus(): Promise<CredentialStatus> {
  return unwrapStatus(
    (await window.api.settings.status()) as IpcResult<{ status: CredentialStatus }>
  )
}

export async function saveAlpacaCredentials(
  payload: SaveAlpacaCredentialsPayload
): Promise<SaveAlpacaCredentialsResult> {
  const result = (await window.api.settings.saveAlpaca(
    payload
  )) as IpcResult<SaveAlpacaCredentialsResult>
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return { status: result.status, test: result.test }
}

export async function removeAlpacaCredentials(
  payload: RemoveAlpacaCredentialsPayload
): Promise<CredentialStatus> {
  return unwrapStatus(
    (await window.api.settings.removeAlpaca(payload)) as IpcResult<{ status: CredentialStatus }>
  )
}

export async function setActiveBrokerEnvironment(
  payload: SetActiveBrokerEnvironmentPayload
): Promise<CredentialStatus> {
  return unwrapStatus(
    (await window.api.settings.setActiveBrokerEnvironment(payload)) as IpcResult<{
      status: CredentialStatus
    }>
  )
}

export async function testSettingsConnection(
  payload: TestSettingsConnectionPayload
): Promise<TestSettingsConnectionResult> {
  const result = (await window.api.settings.testConnection(payload)) as IpcResult<{
    test: TestSettingsConnectionResult
  }>
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return result.test
}

export async function testStoredAlpacaConnection(
  payload: TestStoredAlpacaConnectionPayload
): Promise<TestSettingsConnectionResult> {
  const result = (await window.api.settings.testStoredAlpacaConnection(payload)) as IpcResult<{
    test: TestSettingsConnectionResult
  }>
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return result.test
}

export type AlertDefaults = {
  profitTargetPercent: number
  managementWindowDte: number
}

export type SaveAlertDefaultsPayload = AlertDefaults

// Alert defaults are validation-style errors (like positions.ts), so failures
// surface as 400 rather than the 502 used for broker/credential operations above.
function unwrapAlertDefaults(result: IpcResult<{ defaults: AlertDefaults }>): AlertDefaults {
  if (!result.ok) {
    throw apiError(400, { detail: result.errors })
  }
  return result.defaults
}

export async function getAlertDefaults(): Promise<AlertDefaults> {
  return unwrapAlertDefaults(
    (await window.api.settings.getAlertDefaults()) as IpcResult<{ defaults: AlertDefaults }>
  )
}

export async function saveAlertDefaults(payload: SaveAlertDefaultsPayload): Promise<AlertDefaults> {
  return unwrapAlertDefaults(
    (await window.api.settings.saveAlertDefaults(payload)) as IpcResult<{ defaults: AlertDefaults }>
  )
}
