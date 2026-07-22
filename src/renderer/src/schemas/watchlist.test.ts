import { describe, expect, it } from 'vitest'
import { watchlistEntrySchema } from './watchlist'

describe('watchlistEntrySchema', () => {
  const validBase = { ticker: 'NVDA' }

  describe('ticker', () => {
    it('rejects an empty ticker with a specific message', () => {
      const result = watchlistEntrySchema.safeParse({ ...validBase, ticker: '' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Enter a ticker symbol')
      }
    })

    it('rejects a numeric ticker with a validity message', () => {
      const result = watchlistEntrySchema.safeParse({ ...validBase, ticker: '12345' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Enter a valid ticker symbol')
      }
    })

    it('rejects a ticker with a space', () => {
      const result = watchlistEntrySchema.safeParse({ ...validBase, ticker: 'AB CD' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Enter a valid ticker symbol')
      }
    })

    it('normalizes a lowercase ticker to uppercase', () => {
      const result = watchlistEntrySchema.safeParse({ ticker: 'nvda' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.ticker).toBe('NVDA')
      }
    })
  })

  describe('thesis', () => {
    it('rejects a thesis longer than 500 characters', () => {
      const result = watchlistEntrySchema.safeParse({ ...validBase, thesis: 'a'.repeat(501) })
      expect(result.success).toBe(false)
    })

    it('accepts a thesis of exactly 500 characters', () => {
      const result = watchlistEntrySchema.safeParse({ ...validBase, thesis: 'a'.repeat(500) })
      expect(result.success).toBe(true)
    })
  })

  describe('ownBelowPrice', () => {
    it('allows an empty ownBelowPrice', () => {
      const result = watchlistEntrySchema.safeParse({ ...validBase, ownBelowPrice: '' })
      expect(result.success).toBe(true)
    })

    it('allows an undefined ownBelowPrice', () => {
      const result = watchlistEntrySchema.safeParse({ ...validBase })
      expect(result.success).toBe(true)
    })

    it('accepts a positive ownBelowPrice', () => {
      const result = watchlistEntrySchema.safeParse({ ...validBase, ownBelowPrice: '38.50' })
      expect(result.success).toBe(true)
    })

    it('rejects a non-positive ownBelowPrice', () => {
      const result = watchlistEntrySchema.safeParse({ ...validBase, ownBelowPrice: '0' })
      expect(result.success).toBe(false)
    })
  })

  describe('ivrTrigger', () => {
    it.each(['30', '50', '70'])('accepts %s', (value) => {
      const result = watchlistEntrySchema.safeParse({ ...validBase, ivrTrigger: value })
      expect(result.success).toBe(true)
    })

    it('rejects 150 (out of range)', () => {
      const result = watchlistEntrySchema.safeParse({ ...validBase, ivrTrigger: '150' })
      expect(result.success).toBe(false)
    })

    it('rejects a non-integer value', () => {
      const result = watchlistEntrySchema.safeParse({ ...validBase, ivrTrigger: '50.5' })
      expect(result.success).toBe(false)
    })

    it('allows an empty ivrTrigger', () => {
      const result = watchlistEntrySchema.safeParse({ ...validBase, ivrTrigger: '' })
      expect(result.success).toBe(true)
    })
  })

  describe('boolean flags', () => {
    it('defaults postEarningsOnly and coreHolding to false', () => {
      const result = watchlistEntrySchema.safeParse({ ...validBase })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.postEarningsOnly).toBe(false)
        expect(result.data.coreHolding).toBe(false)
      }
    })
  })
})
