import { apiError, type ApiError } from './error'

export type { ApiError }

export type CredentialState = 'configured' | 'missing'
export type ActiveBrokerEnvironment = 'paper' | 'live' | 'none'

export type CredentialStatus = {
  massive: CredentialState
  alpacaPaper: CredentialState
  alpacaLive: CredentialState
  activeBrokerEnv: ActiveBrokerEnvironment
  massiveLastCheckedAt: string | null
  alpacaPaperAccountNumberMasked: string | null
  alpacaLiveAccountNumberMasked: string | null
}

export type SaveAlpacaCredentialsPayload = {
  environment: 'paper' | 'live'
  keyId: string
  secret: string
}

export type RemoveAlpacaCredentialsPayload = {
  environment: 'paper' | 'live'
}

export type SetActiveBrokerEnvironmentPayload = {
  environment: 'paper' | 'live'
}

export type TestSettingsConnectionPayload =
  | { vendor: 'massive' }
  | { vendor: 'alpaca'; environment: 'paper' | 'live'; keyId: string; secret: string }

export type TestSettingsConnectionResult =
  | { ok: true; vendor: 'massive'; status: 'connected' }
  | {
      ok: true
      vendor: 'alpaca'
      environment: 'paper' | 'live'
      accountNumberMasked: string
    }
  | { ok: false; errorCode: string; message: string }

type IpcFieldError = {
  field: string
  code: string
  message: string
}

type IpcResult<T> = ({ ok: true } & T) | { ok: false; errors: IpcFieldError[] }

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
): Promise<CredentialStatus> {
  return unwrapStatus(
    (await window.api.settings.saveAlpaca(payload)) as IpcResult<{ status: CredentialStatus }>
  )
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
