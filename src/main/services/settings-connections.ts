import { logger } from '../logger'
import { ALPACA_TRADING_BASE_URLS } from '../integrations/alpaca-hosts'

export type BrokerEnvironment = 'paper' | 'live'

export type ConnectionErrorCode =
  | 'auth_failed'
  | 'rate_limited'
  | 'environment_mismatch'
  | 'network_error'
  | 'unknown'

export type TestConnectionResult =
  | {
      ok: true
      vendor: 'alpaca'
      environment: BrokerEnvironment
      accountNumberMasked: string
    }
  | {
      ok: false
      errorCode: ConnectionErrorCode
      message: string
    }

type ConnectionFailure = Extract<TestConnectionResult, { ok: false }>

type TestAlpacaConnectionInput = {
  environment: BrokerEnvironment
  keyId: string
  secret: string
}

const AUTH_FAILED_MESSAGE = 'Authentication failed (401)'
const RATE_LIMITED_MESSAGE = 'Rate limited — please try again'
const PAPER_LIVE_KEY_MISMATCH_MESSAGE = 'Environment mismatch — these are LIVE keys, not paper keys'
const LIVE_PAPER_KEY_MISMATCH_MESSAGE = 'Environment mismatch — these are PAPER keys, not live keys'

function failure(errorCode: ConnectionErrorCode, message: string): ConnectionFailure {
  return { ok: false, errorCode, message }
}

function networkFailure(err: unknown): ConnectionFailure {
  return failure('network_error', err instanceof Error ? err.message : 'Network error')
}

function authFailure(): ConnectionFailure {
  return failure('auth_failed', AUTH_FAILED_MESSAGE)
}

function rateLimited(): ConnectionFailure {
  return failure('rate_limited', RATE_LIMITED_MESSAGE)
}

function unknownHttpStatus(status: number): ConnectionFailure {
  return failure('unknown', `HTTP ${status}`)
}

function knownHttpFailure(status: number): ConnectionFailure | null {
  if (status === 401 || status === 403) {
    return authFailure()
  }

  if (status === 429) {
    return rateLimited()
  }

  return null
}

function trimRequired(value: string, field: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${field} is required`)
  }
  return trimmed
}

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 5) return accountNumber
  return `${accountNumber.slice(0, 2)}…${accountNumber.slice(-3)}`
}

function isLikelyLiveKey(keyId: string): boolean {
  return keyId.trim().startsWith('AK')
}

function isLikelyPaperKey(keyId: string): boolean {
  return keyId.trim().startsWith('PK')
}

export async function testAlpacaConnection(
  input: TestAlpacaConnectionInput
): Promise<TestConnectionResult> {
  const keyId = trimRequired(input.keyId, 'keyId')
  const secret = trimRequired(input.secret, 'secret')
  const url = `${ALPACA_TRADING_BASE_URLS[input.environment]}/v2/account`
  logger.debug(
    { vendor: 'alpaca', environment: input.environment, keyPrefix: keyId.slice(0, 2) },
    'settings_connection_test_started'
  )

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': keyId,
        'APCA-API-SECRET-KEY': secret
      }
    })
  } catch (err) {
    return networkFailure(err)
  }

  if (response.status === 401 || response.status === 403) {
    if (input.environment === 'paper' && isLikelyLiveKey(keyId)) {
      const mismatch = failure('environment_mismatch', PAPER_LIVE_KEY_MISMATCH_MESSAGE)
      logger.debug(
        { vendor: 'alpaca', environment: input.environment, errorCode: mismatch.errorCode },
        'settings_connection_test_failed'
      )
      return mismatch
    }
    if (input.environment === 'live' && isLikelyPaperKey(keyId)) {
      const mismatch = failure('environment_mismatch', LIVE_PAPER_KEY_MISMATCH_MESSAGE)
      logger.debug(
        { vendor: 'alpaca', environment: input.environment, errorCode: mismatch.errorCode },
        'settings_connection_test_failed'
      )
      return mismatch
    }
  }

  const httpFailure = knownHttpFailure(response.status)
  if (httpFailure) {
    logger.debug(
      {
        vendor: 'alpaca',
        environment: input.environment,
        status: response.status,
        errorCode: httpFailure.errorCode
      },
      'settings_connection_test_failed'
    )
    return httpFailure
  }

  if (!response.ok) {
    const failure = unknownHttpStatus(response.status)
    logger.debug(
      {
        vendor: 'alpaca',
        environment: input.environment,
        status: response.status,
        errorCode: failure.errorCode
      },
      'settings_connection_test_failed'
    )
    return failure
  }

  const account = (await response.json()) as { account_number?: string }
  const accountNumberMasked = maskAccountNumber(account.account_number ?? '')
  logger.info(
    { vendor: 'alpaca', environment: input.environment, accountNumberMasked },
    'settings_connection_verified'
  )
  return {
    ok: true,
    vendor: 'alpaca',
    environment: input.environment,
    accountNumberMasked
  }
}
