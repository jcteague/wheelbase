import { describe, it, expect } from 'vitest'
import {
  BrokerError,
  type BrokerProvider,
  type AccountInfo,
  type BrokerActivity,
  type BrokerErrorCode
} from './broker-provider'

// [US-116] The broker answers facts about YOUR ACCOUNT and nothing else. Market facts —
// the exchange clock and calendar — live on MarketDataProvider, so a journal-only install
// with no broker still gets them.
describe('BrokerProvider interface', () => {
  it('is exactly getAccountInfo and getActivities', () => {
    const fixture = {
      async getAccountInfo(): Promise<AccountInfo> {
        return {
          buyingPower: '10000.00',
          portfolioValue: '25000.00',
          cash: '5000.00',
          environment: 'paper' as const,
          accountNumberMasked: 'PA…ABC'
        }
      },
      async getActivities(): Promise<BrokerActivity[]> {
        return []
      }
    } satisfies BrokerProvider

    expect(Object.keys(fixture).sort()).toEqual(['getAccountInfo', 'getActivities'])
  })
})

describe('BrokerError', () => {
  it('exports BrokerError class with code field constrained to BrokerErrorCode union', () => {
    const error = new BrokerError('auth_failed', 'Invalid credentials')
    expect(error.code).toBe('auth_failed')
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Invalid credentials')
  })

  it('accepts all valid BrokerErrorCode values', () => {
    const codes: BrokerErrorCode[] = [
      'auth_failed',
      'network_error',
      'rate_limited',
      'environment_mismatch',
      'unknown'
    ]
    for (const code of codes) {
      const err = new BrokerError(code, `test ${code}`)
      expect(err.code).toBe(code)
    }
  })
})

describe('AccountInfo type', () => {
  it('includes accountNumberMasked field', () => {
    const account: AccountInfo = {
      buyingPower: '10000.00',
      portfolioValue: '25000.00',
      cash: '5000.00',
      environment: 'paper',
      accountNumberMasked: 'PA…ABC'
    }
    expect(account.accountNumberMasked).toBe('PA…ABC')
  })
})
