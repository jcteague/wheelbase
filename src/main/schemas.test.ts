import { describe, expect, it } from 'vitest'
import {
  AssignCspPayloadSchema,
  GetStockQuotesPayloadSchema,
  OpenCcPayloadSchema,
  RollCcPayloadSchema,
  RollCspPayloadSchema,
  SetStockQuoteTickersPayloadSchema
} from './schemas'

const VALID_POSITION_ID = '11111111-1111-4111-8111-111111111111'

describe('AssignCspPayloadSchema', () => {
  it('parses a valid assignment payload', () => {
    expect(
      AssignCspPayloadSchema.parse({
        positionId: VALID_POSITION_ID,
        assignmentDate: '2026-01-17'
      })
    ).toEqual({
      positionId: VALID_POSITION_ID,
      assignmentDate: '2026-01-17'
    })
  })

  it('rejects a non-UUID positionId', () => {
    expect(() =>
      AssignCspPayloadSchema.parse({
        positionId: 'not-a-uuid',
        assignmentDate: '2026-01-17'
      })
    ).toThrow()
  })

  it('rejects a missing assignmentDate', () => {
    expect(() =>
      AssignCspPayloadSchema.parse({
        positionId: VALID_POSITION_ID
      })
    ).toThrow()
  })

  it('rejects an empty payload', () => {
    expect(() => AssignCspPayloadSchema.parse({})).toThrow()
  })
})

const VALID_CC_PAYLOAD = {
  positionId: '11111111-1111-4111-8111-111111111111',
  strike: 182,
  expiration: '2026-02-21',
  contracts: 1,
  premiumPerContract: 2.3
}

describe('OpenCcPayloadSchema', () => {
  it('parses valid payload', () => {
    const result = OpenCcPayloadSchema.parse(VALID_CC_PAYLOAD)
    expect(result.positionId).toBe(VALID_CC_PAYLOAD.positionId)
    expect(result.strike).toBe(182)
    expect(result.contracts).toBe(1)
  })

  it('rejects missing positionId', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { positionId, ...rest } = VALID_CC_PAYLOAD
    expect(() => OpenCcPayloadSchema.parse(rest)).toThrow()
  })

  it('rejects non-positive strike', () => {
    expect(() => OpenCcPayloadSchema.parse({ ...VALID_CC_PAYLOAD, strike: 0 })).toThrow()
  })

  it('rejects non-integer contracts', () => {
    expect(() => OpenCcPayloadSchema.parse({ ...VALID_CC_PAYLOAD, contracts: 1.5 })).toThrow()
  })

  it('accepts optional fillDate when present', () => {
    const result = OpenCcPayloadSchema.parse({ ...VALID_CC_PAYLOAD, fillDate: '2026-01-20' })
    expect(result.fillDate).toBe('2026-01-20')
  })

  it('accepts missing fillDate', () => {
    const result = OpenCcPayloadSchema.parse(VALID_CC_PAYLOAD)
    expect(result.fillDate).toBeUndefined()
  })
})

const VALID_ROLL_CSP_PAYLOAD = {
  positionId: '11111111-1111-4111-8111-111111111111',
  costToClosePerContract: 1.2,
  newPremiumPerContract: 2.8,
  newExpiration: '2026-05-16',
  newStrike: 175
}

describe('RollCspPayloadSchema', () => {
  it('parses a valid roll CSP payload', () => {
    const result = RollCspPayloadSchema.parse(VALID_ROLL_CSP_PAYLOAD)
    expect(result.newExpiration).toBe('2026-05-16')
  })

  it('rejects newExpiration that is not YYYY-MM-DD format', () => {
    expect(() =>
      RollCspPayloadSchema.parse({ ...VALID_ROLL_CSP_PAYLOAD, newExpiration: 'May 16, 2026' })
    ).toThrow()
  })

  it('rejects newExpiration with slashes instead of dashes', () => {
    expect(() =>
      RollCspPayloadSchema.parse({ ...VALID_ROLL_CSP_PAYLOAD, newExpiration: '2026/05/16' })
    ).toThrow()
  })

  it('rejects empty string for newExpiration', () => {
    expect(() =>
      RollCspPayloadSchema.parse({ ...VALID_ROLL_CSP_PAYLOAD, newExpiration: '' })
    ).toThrow()
  })
})

const VALID_ROLL_CC_PAYLOAD = {
  positionId: '11111111-1111-4111-8111-111111111111',
  costToClosePerContract: 2.5,
  newPremiumPerContract: 3.0,
  newExpiration: '2026-05-16',
  newStrike: 190,
  fillDate: '2026-04-13'
}

describe('RollCcPayloadSchema', () => {
  it('parses valid payload with all fields', () => {
    const result = RollCcPayloadSchema.parse(VALID_ROLL_CC_PAYLOAD)
    expect(result).toEqual(VALID_ROLL_CC_PAYLOAD)
  })

  it('parses valid payload without optional newStrike and fillDate', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { newStrike, fillDate, ...rest } = VALID_ROLL_CC_PAYLOAD
    const result = RollCcPayloadSchema.parse(rest)
    expect(result.positionId).toBe(VALID_ROLL_CC_PAYLOAD.positionId)
    expect(result.newStrike).toBeUndefined()
    expect(result.fillDate).toBeUndefined()
  })

  it('rejects non-UUID positionId', () => {
    expect(
      RollCcPayloadSchema.safeParse({ ...VALID_ROLL_CC_PAYLOAD, positionId: 'not-a-uuid' }).success
    ).toBe(false)
  })

  it('rejects non-positive costToClosePerContract', () => {
    expect(
      RollCcPayloadSchema.safeParse({ ...VALID_ROLL_CC_PAYLOAD, costToClosePerContract: -1 })
        .success
    ).toBe(false)
  })

  it('rejects invalid date format for newExpiration', () => {
    expect(
      RollCcPayloadSchema.safeParse({ ...VALID_ROLL_CC_PAYLOAD, newExpiration: '04/13/2026' })
        .success
    ).toBe(false)
  })
})

describe('GetStockQuotesPayloadSchema', () => {
  it('accepts a non-empty ticker array', () => {
    expect(() => GetStockQuotesPayloadSchema.parse({ tickers: ['AAPL', 'MSFT'] })).not.toThrow()
  })

  it('accepts an empty ticker array', () => {
    expect(() => GetStockQuotesPayloadSchema.parse({ tickers: [] })).not.toThrow()
  })

  it('rejects a string for tickers', () => {
    const result = GetStockQuotesPayloadSchema.safeParse({ tickers: 'AAPL' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('tickers'))).toBe(true)
    }
  })

  it('rejects empty-string ticker entry', () => {
    const result = GetStockQuotesPayloadSchema.safeParse({ tickers: [''] })
    expect(result.success).toBe(false)
  })

  it('rejects ticker longer than 10 chars', () => {
    const result = GetStockQuotesPayloadSchema.safeParse({ tickers: ['ABCDEFGHIJK'] })
    expect(result.success).toBe(false)
  })

  it('rejects array longer than 50', () => {
    const result = GetStockQuotesPayloadSchema.safeParse({ tickers: Array(51).fill('A') })
    expect(result.success).toBe(false)
  })
})

describe('SetStockQuoteTickersPayloadSchema', () => {
  it('accepts a non-empty ticker array', () => {
    expect(() =>
      SetStockQuoteTickersPayloadSchema.parse({ tickers: ['AAPL', 'MSFT'] })
    ).not.toThrow()
  })

  it('accepts an empty ticker array', () => {
    expect(() => SetStockQuoteTickersPayloadSchema.parse({ tickers: [] })).not.toThrow()
  })

  it('rejects a string for tickers', () => {
    const result = SetStockQuoteTickersPayloadSchema.safeParse({ tickers: 'AAPL' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('tickers'))).toBe(true)
    }
  })

  it('rejects empty-string ticker entry', () => {
    const result = SetStockQuoteTickersPayloadSchema.safeParse({ tickers: [''] })
    expect(result.success).toBe(false)
  })

  it('rejects ticker longer than 10 chars', () => {
    const result = SetStockQuoteTickersPayloadSchema.safeParse({ tickers: ['ABCDEFGHIJK'] })
    expect(result.success).toBe(false)
  })

  it('rejects array longer than 50', () => {
    const result = SetStockQuoteTickersPayloadSchema.safeParse({ tickers: Array(51).fill('A') })
    expect(result.success).toBe(false)
  })
})
