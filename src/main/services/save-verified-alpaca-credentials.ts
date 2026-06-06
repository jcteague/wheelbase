import { ValidationError } from '../core/lifecycle'
import type {
  AlpacaCredentials,
  CredentialStatus,
  SaveAlpacaCredentialsInput,
  SaveVerifiedAlpacaCredentialsResult
} from './settings'
import type { TestConnectionResult } from './settings-connections'

type SaveVerifiedAlpacaCredentialsDependencies = {
  getCredentialStatus: () => CredentialStatus
  saveAlpacaCredentials: (input: SaveAlpacaCredentialsInput) => CredentialStatus
  testAlpacaConnection: (input: AlpacaCredentials) => Promise<TestConnectionResult>
}

type SaveVerifiedAlpacaCredentialsInput = Omit<SaveAlpacaCredentialsInput, 'accountNumberMasked'>

function trimRequired(value: string, field: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new ValidationError(field, 'required', `${field} is required`)
  }
  return trimmed
}

function shouldRefreshBroker(
  previous: CredentialStatus,
  next: CredentialStatus,
  changedEnvironment: 'paper' | 'live'
): boolean {
  return (
    previous.activeBrokerEnv === changedEnvironment || next.activeBrokerEnv === changedEnvironment
  )
}

export async function saveVerifiedAlpacaCredentials(
  {
    getCredentialStatus,
    saveAlpacaCredentials,
    testAlpacaConnection
  }: SaveVerifiedAlpacaCredentialsDependencies,
  input: SaveVerifiedAlpacaCredentialsInput
): Promise<SaveVerifiedAlpacaCredentialsResult> {
  const keyId = trimRequired(input.keyId, 'keyId')
  const secret = trimRequired(input.secret, 'secret')
  const previous = getCredentialStatus()
  const test = await testAlpacaConnection({
    environment: input.environment,
    keyId,
    secret
  })

  if (!test.ok) {
    throw new ValidationError('__root__', test.errorCode, test.message)
  }
  if (test.vendor !== 'alpaca') {
    throw new ValidationError('__root__', 'unknown', 'Unexpected connection result')
  }

  const status = saveAlpacaCredentials({
    environment: input.environment,
    keyId,
    secret,
    accountNumberMasked: test.accountNumberMasked
  })

  return {
    status,
    test,
    refreshBroker: shouldRefreshBroker(previous, status, input.environment)
  }
}
