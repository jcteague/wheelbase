import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBrokerAccount, getMarketStatus } from './broker'

const mockBrokerAccount = vi.fn()
const mockBrokerMarketStatus = vi.fn()

const ACCOUNT_FIXTURE = {
  buyingPower: '10000.00',
  portfolioValue: '50000.00',
  cash: '10000.00',
  environment: 'paper' as const,
  accountNumberMasked: 'PA…ABC'
}

const MARKET_STATUS_FIXTURE = {
  isOpen: true,
  nextOpen: '2026-01-02T14:30:00Z',
  nextClose: '2026-01-01T21:00:00Z',
  session: 'regular' as const
}

beforeEach(() => {
  mockBrokerAccount.mockReset()
  mockBrokerMarketStatus.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      broker: {
        account: mockBrokerAccount,
        marketStatus: mockBrokerMarketStatus
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

describe('getMarketStatus', () => {
  it('calls window.api.broker.marketStatus()', async () => {
    mockBrokerMarketStatus.mockResolvedValue({ ok: true, status: MARKET_STATUS_FIXTURE })
    await getMarketStatus()
    expect(mockBrokerMarketStatus).toHaveBeenCalledOnce()
  })

  it('returns MarketStatus on ok:true', async () => {
    mockBrokerMarketStatus.mockResolvedValue({ ok: true, status: MARKET_STATUS_FIXTURE })
    const result = await getMarketStatus()
    expect(result).toEqual(MARKET_STATUS_FIXTURE)
    expect(result.session).toBe('regular')
  })

  it('throws ApiError(502) on ok:false', async () => {
    const errors = [{ field: '__root__', code: 'network_error', message: 'Connection refused' }]
    mockBrokerMarketStatus.mockResolvedValue({ ok: false, errors })
    await expect(getMarketStatus()).rejects.toMatchObject({
      status: 502,
      body: { detail: errors }
    })
  })
})
