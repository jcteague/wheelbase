// [US-31] FakeBrokerProvider — test double implementing BrokerProvider

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccountInfo, BrokerActivity, MarketStatus } from './broker-provider'

import { FakeBrokerProvider } from './fake-broker'

describe('FakeBrokerProvider', () => {
  let savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    savedEnv = {
      FAKE_BROKER_ACCOUNT: process.env.FAKE_BROKER_ACCOUNT,
      FAKE_BROKER_ACTIVITIES: process.env.FAKE_BROKER_ACTIVITIES,
      FAKE_MARKET_STATUS: process.env.FAKE_MARKET_STATUS
    }
    delete process.env.FAKE_BROKER_ACCOUNT
    delete process.env.FAKE_BROKER_ACTIVITIES
    delete process.env.FAKE_MARKET_STATUS
  })

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }
  })

  // === getAccountInfo ===

  describe('getAccountInfo', () => {
    it('returns AccountInfo from FAKE_BROKER_ACCOUNT env var when set', async () => {
      const custom: AccountInfo = {
        buyingPower: '25000.00',
        portfolioValue: '100000.00',
        cash: '12500.00',
        environment: 'paper',
        accountNumberMasked: 'PA…XYZ'
      }
      process.env.FAKE_BROKER_ACCOUNT = JSON.stringify(custom)

      const provider = new FakeBrokerProvider()
      const result = await provider.getAccountInfo()

      expect(result).toEqual(custom)
    })

    it('returns a default fixture when FAKE_BROKER_ACCOUNT env var is not set', async () => {
      const provider = new FakeBrokerProvider()
      const result = await provider.getAccountInfo()

      expect(result).toMatchObject({
        buyingPower: expect.any(String),
        portfolioValue: expect.any(String),
        cash: expect.any(String),
        environment: expect.stringMatching(/^(paper|live)$/),
        accountNumberMasked: expect.any(String)
      })
    })
  })

  // === getActivities ===

  describe('getActivities', () => {
    it('returns FAKE_BROKER_ACTIVITIES env var parsed JSON when present', async () => {
      const activities: BrokerActivity[] = [
        {
          activityId: 'act-001',
          activityType: 'OPASN',
          symbol: 'AAPL260516P00180000',
          qty: 100,
          price: '180.00',
          transactionTime: '2026-05-01T14:30:00Z'
        }
      ]
      process.env.FAKE_BROKER_ACTIVITIES = JSON.stringify(activities)

      const provider = new FakeBrokerProvider()
      const result = await provider.getActivities({ type: 'OPASN' })

      expect(result).toEqual(activities)
    })

    it('returns empty array when FAKE_BROKER_ACTIVITIES env var is not set', async () => {
      const provider = new FakeBrokerProvider()
      const result = await provider.getActivities({ type: 'OPASN' })

      expect(result).toEqual([])
    })
  })

  // === getMarketStatus ===

  describe('getMarketStatus', () => {
    it('returns MarketStatus from FAKE_MARKET_STATUS env var when set', async () => {
      const status: MarketStatus = {
        isOpen: true,
        nextOpen: '2026-05-30T13:30:00Z',
        nextClose: '2026-05-29T20:00:00Z',
        session: 'regular'
      }
      process.env.FAKE_MARKET_STATUS = JSON.stringify(status)

      const provider = new FakeBrokerProvider()
      const result = await provider.getMarketStatus()

      expect(result).toEqual(status)
    })

    it('returns a default MarketStatus when FAKE_MARKET_STATUS env var is not set', async () => {
      const provider = new FakeBrokerProvider()
      const result = await provider.getMarketStatus()

      expect(result).toMatchObject({
        isOpen: expect.any(Boolean),
        nextOpen: expect.any(String),
        nextClose: expect.any(String),
        session: expect.stringMatching(/^(regular|pre|post|closed)$/)
      })
    })
  })

  // === BrokerProvider shape ===

  it('implements the BrokerProvider interface (getAccountInfo, getActivities, getMarketStatus)', () => {
    const provider = new FakeBrokerProvider()
    expect(typeof provider.getAccountInfo).toBe('function')
    expect(typeof provider.getActivities).toBe('function')
    expect(typeof provider.getMarketStatus).toBe('function')
  })
})
