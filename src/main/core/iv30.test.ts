// [US-121] IV30 reading engine — daily-VWAP inversion, strike walk, tier fallback, interpolation.
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  DEFAULT_DIVIDEND_YIELD,
  DEFAULT_RISK_FREE_RATE,
  IV30_ENGINE_VERSION,
  IV30_METHOD,
  MIN_TRADES_PER_LEG,
  computeIv30,
  iv30FromInputs,
  type DailyBar,
  type Iv30Outcome,
  type Iv30Reading
} from './iv30'
import { buildIv30Session, legSymbol, type Iv30SessionSpec } from './test-fixtures/iv30-bars'

const SESSION = '2026-03-10'
const PRICE = 200.4
const WEEKLY_NEAR = '2026-04-03' // 24 DTE
const WEEKLY_FAR = '2026-04-10' // 31 DTE
const MONTHLY_NEAR = '2026-03-20' // 10 DTE
const MONTHLY_FAR = '2026-04-17' // 38 DTE
const NEAREST = 200.5
const NEXT = 200

const flat = (sigma: number, extra: Partial<Iv30SessionSpec> = {}): Iv30SessionSpec => ({
  session: SESSION,
  price: PRICE,
  weekly: {
    near: { expiration: WEEKLY_NEAR, sigma },
    far: { expiration: WEEKLY_FAR, sigma }
  },
  ...extra
})

function readingOf(outcome: Iv30Outcome): Iv30Reading {
  if (outcome.status !== 'reading') throw new Error(`expected reading, got ${outcome.reason}`)
  return outcome.reading
}

const compute = (spec: Iv30SessionSpec): Iv30Outcome => computeIv30(buildIv30Session(spec))

describe('constants', () => {
  it('exposes the engine identity and defaults', () => {
    expect(IV30_ENGINE_VERSION).toBe(1)
    expect(IV30_METHOD).toBe('daily_vwap')
    expect(DEFAULT_RISK_FREE_RATE).toBe('0.0450')
    expect(DEFAULT_DIVIDEND_YIELD).toBe('0.0000')
    expect(MIN_TRADES_PER_LEG).toBe(1)
  })
})

describe('computeIv30', () => {
  it('recovers a flat 0.2475 surface exactly from the weekly pair', () => {
    const fixture = buildIv30Session(flat(0.2475))
    const reading = readingOf(computeIv30(fixture))

    expect(reading.iv30).toBe('0.2475')
    expect(reading.tier).toBe('weekly')
    expect(reading.session).toBe(SESSION)
    expect(reading.underlyingVwap).toBe('200.4000')
    expect(reading.rate).toBe('0.0450')
    expect(reading.dividendYield).toBe('0.0000')
    expect(reading.engineVersion).toBe(1)
    expect(reading.near.expiration).toBe(WEEKLY_NEAR)
    expect(reading.near.strike).toBe('200.5000')
    expect(reading.far?.expiration).toBe(WEEKLY_FAR)
    expect(reading.far?.strike).toBe('200.5000')
  })

  it('copies the chosen legs’ VWAPs and trade counts from the bars', () => {
    const fixture = buildIv30Session(
      flat(0.2475, {
        leg: ({ type, expiration }) =>
          expiration === WEEKLY_NEAR ? { tradeCount: type === 'call' ? 7 : 3 } : undefined
      })
    )
    const reading = readingOf(computeIv30(fixture))
    const callBar = fixture.optionBars.get(
      legSymbol({ expiration: WEEKLY_NEAR, strike: NEAREST, type: 'call' })
    )
    const putBar = fixture.optionBars.get(
      legSymbol({ expiration: WEEKLY_NEAR, strike: NEAREST, type: 'put' })
    )

    expect(reading.near.callTrades).toBe(7)
    expect(reading.near.putTrades).toBe(3)
    expect(reading.near.callVwap).toBe(callBar?.vwap)
    expect(reading.near.putVwap).toBe(putBar?.vwap)
    expect(reading.far?.callTrades).toBe(100)
  })

  it('interpolates near 0.20 / far 0.30 at 24/31 DTE in total variance', () => {
    const tNear = 24 / 365
    const tFar = 31 / 365
    const t30 = 30 / 365
    const lambda = (t30 - tNear) / (tFar - tNear)
    const w30 = 0.2 ** 2 * tNear * (1 - lambda) + 0.3 ** 2 * tFar * lambda
    const expected = Math.sqrt(w30 / t30).toFixed(4)

    const reading = readingOf(
      compute({
        session: SESSION,
        price: PRICE,
        weekly: {
          near: { expiration: WEEKLY_NEAR, sigma: 0.2 },
          far: { expiration: WEEKLY_FAR, sigma: 0.3 }
        }
      })
    )

    expect(expected).toBe('0.2903')
    expect(reading.iv30).toBe(expected)
  })

  it('uses the near IV alone when the plan is exactly 30 DTE', () => {
    const reading = readingOf(
      compute({
        session: SESSION,
        price: PRICE,
        weekly: { near: { expiration: '2026-04-09', sigma: 0.31 } }
      })
    )

    expect(reading.iv30).toBe('0.3100')
    expect(reading.far).toBeNull()
  })

  it('skips a strike whose call has no bar for the next-nearest traded strike', () => {
    const reading = readingOf(
      compute(
        flat(0.2475, {
          leg: ({ strike, type }) => (strike === NEAREST && type === 'call' ? null : undefined)
        })
      )
    )

    expect(reading.near.strike).toBe('200.0000')
    expect(reading.far?.strike).toBe('200.0000')
    expect(JSON.stringify(reading)).not.toContain('200.5000')
  })

  it('skips a strike whose put traded zero times', () => {
    const reading = readingOf(
      compute(
        flat(0.2475, {
          leg: ({ strike, type, expiration }) =>
            strike === NEAREST && type === 'put' && expiration === WEEKLY_NEAR
              ? { tradeCount: 0 }
              : undefined
        })
      )
    )

    expect(reading.near.strike).toBe('200.0000')
    expect(reading.near.putTrades).toBeGreaterThanOrEqual(1)
    expect(reading.far?.strike).toBe('200.5000')
  })

  it('skips a strike whose call VWAP is at or below intrinsic', () => {
    const reading = readingOf(
      compute(
        flat(0.2475, {
          leg: ({ strike, type }) =>
            strike === NEAREST && type === 'call' ? { vwap: '0.0100' } : undefined
        })
      )
    )

    expect(reading.near.strike).toBe(`${NEXT}.0000`)
    expect(reading.iv30).toBe('0.2475')
  })

  it('fails the weekly tier when no strike inverts and falls back to monthly', () => {
    const reading = readingOf(
      compute(
        flat(0.2475, {
          monthly: {
            near: { expiration: MONTHLY_NEAR, sigma: 0.2475 },
            far: { expiration: MONTHLY_FAR, sigma: 0.2475 }
          },
          leg: ({ expiration, type }) =>
            expiration === WEEKLY_FAR && type === 'call' ? { vwap: '0.0000' } : undefined
        })
      )
    )

    expect(reading.tier).toBe('monthly')
    expect(reading.near.expiration).toBe(MONTHLY_NEAR)
    expect(reading.far?.expiration).toBe(MONTHLY_FAR)
  })

  it('falls back to the monthly pair when every weekly strike is untraded', () => {
    const reading = readingOf(
      compute(
        flat(0.2475, {
          monthly: {
            near: { expiration: MONTHLY_NEAR, sigma: 0.2475 },
            far: { expiration: MONTHLY_FAR, sigma: 0.2475 }
          },
          leg: ({ expiration }) =>
            expiration === WEEKLY_NEAR || expiration === WEEKLY_FAR ? { tradeCount: 0 } : undefined
        })
      )
    )

    expect(reading.tier).toBe('monthly')
    expect(reading.near.expiration).toBe(MONTHLY_NEAR)
    expect(reading.far?.expiration).toBe(MONTHLY_FAR)
    expect(reading.iv30).toBe('0.2475')
  })

  it('is a no_tradeable_pair gap when neither tier has a usable strike', () => {
    const outcome = compute(
      flat(0.2475, {
        monthly: {
          near: { expiration: MONTHLY_NEAR, sigma: 0.2475 },
          far: { expiration: MONTHLY_FAR, sigma: 0.2475 }
        },
        leg: ({ type }) => (type === 'put' ? null : undefined)
      })
    )

    expect(outcome).toEqual({ status: 'gap', reason: 'no_tradeable_pair' })
  })

  it('is a no_tradeable_pair gap when the plan has no tiers', () => {
    expect(compute({ session: SESSION, price: PRICE })).toEqual({
      status: 'gap',
      reason: 'no_tradeable_pair'
    })
  })

  it('is a no_underlying_bar gap when the underlying has no bar, ignoring option bars', () => {
    const fixture = buildIv30Session(flat(0.2475))

    expect(computeIv30({ ...fixture, underlyingBar: undefined })).toEqual({
      status: 'gap',
      reason: 'no_underlying_bar'
    })
  })

  it('records a supplied rate and dividend yield', () => {
    const fixture = buildIv30Session(flat(0.2475, { rate: 0.05, dividendYield: 0.01 }))
    const reading = readingOf(computeIv30({ ...fixture, rate: '0.05', dividendYield: '0.01' }))

    expect(reading.rate).toBe('0.0500')
    expect(reading.dividendYield).toBe('0.0100')
    expect(reading.iv30).toBe('0.2475')
  })
})

describe('iv30FromInputs', () => {
  it('reproduces a computed reading’s iv30 from its stored inputs', () => {
    const reading = readingOf(
      compute({
        session: SESSION,
        price: PRICE,
        weekly: {
          near: { expiration: WEEKLY_NEAR, sigma: 0.2 },
          far: { expiration: WEEKLY_FAR, sigma: 0.3 }
        }
      })
    )
    const { iv30, engineVersion, ...inputs } = reading

    expect(engineVersion).toBe(1)
    expect(iv30FromInputs(inputs)).toBe(iv30)
  })

  it('reproduces a single-expiration reading', () => {
    const reading = readingOf(
      compute({
        session: SESSION,
        price: PRICE,
        weekly: { near: { expiration: '2026-04-09', sigma: 0.31 } }
      })
    )

    expect(iv30FromInputs(reading)).toBe(reading.iv30)
  })

  it('returns null when a stored call VWAP is below intrinsic', () => {
    const reading = readingOf(compute(flat(0.2475)))

    expect(iv30FromInputs({ ...reading, near: { ...reading.near, callVwap: '0.0100' } })).toBeNull()
  })
})

describe('DailyBar', () => {
  it('carries no vendor IV field — exactly date, vwap, close, volume, tradeCount', () => {
    expectTypeOf<keyof DailyBar>().toEqualTypeOf<
      'date' | 'vwap' | 'close' | 'volume' | 'tradeCount'
    >()
    const bar = buildIv30Session(flat(0.2475)).underlyingBar
    expect(Object.keys(bar).sort()).toEqual(['close', 'date', 'tradeCount', 'volume', 'vwap'])
  })
})
