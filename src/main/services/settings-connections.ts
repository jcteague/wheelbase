export type BrokerEnvironment = 'paper' | 'live'

export type ConnectionErrorCode =
  | 'auth_failed'
  | 'rate_limited'
  | 'environment_mismatch'
  | 'network_error'
  | 'unknown'

export type TestConnectionResult =
  | { ok: true; vendor: 'massive'; status: 'connected' }
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

type TestMassiveConnectionOptions = {
  loadMassiveApiKey: () => string
}

type TestAlpacaConnectionInput = {
  environment: BrokerEnvironment
  keyId: string
  secret: string
}

const MASSIVE_BASE_URL = 'https://api.syncswimmer.com'
const ALPACA_BASE_URLS: Record<BrokerEnvironment, string> = {
  paper: 'https://paper-api.alpaca.markets',
  live: 'https://api.alpaca.markets'
}
const AUTH_FAILED_MESSAGE = 'Authentication failed (401)'
const RATE_LIMITED_MESSAGE = 'Rate limited — please try again'
const PAPER_LIVE_KEY_MISMATCH_MESSAGE = 'Environment mismatch — these are LIVE keys, not paper keys'

function failure(errorCode: ConnectionErrorCode, message: string): TestConnectionResult {
  return { ok: false, errorCode, message }
}

function networkFailure(err: unknown): TestConnectionResult {
  return failure('network_error', err instanceof Error ? err.message : 'Network error')
}

function authFailure(): TestConnectionResult {
  return failure('auth_failed', AUTH_FAILED_MESSAGE)
}

function rateLimited(): TestConnectionResult {
  return failure('rate_limited', RATE_LIMITED_MESSAGE)
}

function unknownHttpStatus(status: number): TestConnectionResult {
  return failure('unknown', `HTTP ${status}`)
}

function knownHttpFailure(status: number): TestConnectionResult | null {
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

export async function testMassiveConnection({
  loadMassiveApiKey
}: TestMassiveConnectionOptions): Promise<TestConnectionResult> {
  const apiKey = trimRequired(loadMassiveApiKey(), 'Massive API key')

  let response: Response
  try {
    response = await fetch(`${MASSIVE_BASE_URL}/v3/reference/tickers/AAPL`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
  } catch (err) {
    return networkFailure(err)
  }

  const httpFailure = knownHttpFailure(response.status)
  if (httpFailure) return httpFailure

  if (!response.ok) {
    return unknownHttpStatus(response.status)
  }

  return { ok: true, vendor: 'massive', status: 'connected' }
}

export async function testAlpacaConnection(
  input: TestAlpacaConnectionInput
): Promise<TestConnectionResult> {
  const keyId = trimRequired(input.keyId, 'keyId')
  const secret = trimRequired(input.secret, 'secret')
  const url = `${ALPACA_BASE_URLS[input.environment]}/v2/account`

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
      return failure('environment_mismatch', PAPER_LIVE_KEY_MISMATCH_MESSAGE)
    }
  }

  const httpFailure = knownHttpFailure(response.status)
  if (httpFailure) return httpFailure

  if (!response.ok) {
    return unknownHttpStatus(response.status)
  }

  const account = (await response.json()) as { account_number?: string }
  return {
    ok: true,
    vendor: 'alpaca',
    environment: input.environment,
    accountNumberMasked: maskAccountNumber(account.account_number ?? '')
  }
}
