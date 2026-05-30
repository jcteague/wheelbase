import { describe, it, expect } from 'vitest'
import {
  BrokerError,
  type BrokerProvider,
  type AccountInfo,
  type BrokerActivity,
  type MarketStatus,
  type BrokerErrorCode
} from './broker-provider'

describe('BrokerProvider interface', () => {
  it('exports BrokerProvider interface with getAccountInfo, getActivities, getMarketStatus', () => {
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
      },
      async getMarketStatus(): Promise<MarketStatus> {
        return {
          isOpen: false,
          nextOpen: '2026-05-30T13:30:00Z',
          nextClose: '2026-05-30T20:00:00Z',
          session: 'closed'
        }
      }
    } satisfies BrokerProvider

    expect(typeof fixture.getAccountInfo).toBe('function')
    expect(typeof fixture.getActivities).toBe('function')
    expect(typeof fixture.getMarketStatus).toBe('function')
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
