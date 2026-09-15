import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as brokerApi from './broker'
import { getBrokerAccount } from './broker'

const mockBrokerAccount = vi.fn()

const ACCOUNT_FIXTURE = {
  buyingPower: '10000.00',
  portfolioValue: '50000.00',
  cash: '10000.00',
  environment: 'paper' as const,
  accountNumberMasked: 'PA…ABC'
}

beforeEach(() => {
  mockBrokerAccount.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      broker: {
        account: mockBrokerAccount
      }
    }
  })
})

describe('getBrokerAccount', () => {
  it('calls window.api.broker.account()', async () => {
    mockBrokerAccount.mockResolvedValue({ ok: true, account: ACCOUNT_FIXTURE })
    await getBrokerAccount()
    expect(mockBrokerAccount).toHaveBeenCalledOnce()
  })

  it('returns AccountInfo on ok:true', async () => {
    mockBrokerAccount.mockResolvedValue({ ok: true, account: ACCOUNT_FIXTURE })
    const result = await getBrokerAccount()
    expect(result).toEqual(ACCOUNT_FIXTURE)
  })

  it('throws ApiError(502) on ok:false', async () => {
    const errors = [{ field: '__root__', code: 'auth_failed', message: 'Unauthorized' }]
    mockBrokerAccount.mockResolvedValue({ ok: false, errors })
    await expect(getBrokerAccount()).rejects.toMatchObject({
      status: 502,
      body: { detail: errors }
    })
  })
})

// [US-116] getMarketStatus moved to api/market-data.ts with the capability.
describe('the broker API surface', () => {
  it('no longer exposes getMarketStatus', () => {
    expect('getMarketStatus' in brokerApi).toBe(false)
  })
})
