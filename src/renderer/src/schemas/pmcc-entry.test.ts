import { describe, expect, it } from 'vitest'
import {
  EMPTY_PMCC_DEFAULTS,
  pmccEntrySchema,
  toCreatePmccPayload,
  type PmccEntryFormValues
} from './pmcc-entry'

const TODAY = '2026-09-14'

const FIXTURE: PmccEntryFormValues = {
  ticker: 'XYZ',
  contracts: '1',
  long: {
    contractId: 'XYZ270917C00080000',
    strike: '80',
    expiration: '2027-09-17',
    fillPrice: '25.00',
    fees: '0.00',
    fillDate: TODAY
  },
  short: {
    contractId: 'XYZ261016C00110000',
    strike: '110',
    expiration: '2026-10-16',
    fillPrice: '2.00',
    fees: '0.00',
    fillDate: TODAY
  },
  thesis: '',
  notes: ''
}

type LegPatch = Partial<PmccEntryFormValues['long']>

function withLegs(
  patch: { long?: LegPatch; short?: LegPatch } & Partial<
    Omit<PmccEntryFormValues, 'long' | 'short'>
  >
): PmccEntryFormValues {
  return {
    ...FIXTURE,
    ...patch,
    long: { ...FIXTURE.long, ...patch.long },
    short: { ...FIXTURE.short, ...patch.short }
  }
}

function issuesAt(values: PmccEntryFormValues, path: string[]): string[] {
  const result = pmccEntrySchema(TODAY).safeParse(values)
  if (result.success) return []
  return result.error.issues
    .filter((issue) => issue.path.join('.') === path.join('.'))
    .map((issue) => issue.message)
}

describe('pmccEntrySchema', () => {
  it('skips the date rules for a malformed expiration but still checks the strikes', () => {
    const values = withLegs({ long: { strike: '120', expiration: 'nope' } })
    expect(issuesAt(values, ['long', 'expiration'])).toEqual(['Date must be YYYY-MM-DD'])
    expect(issuesAt(values, ['short', 'expiration'])).toEqual([])
    expect(issuesAt(values, ['short', 'strike'])).toEqual([
      'Short-call strike must be above the LEAPS strike.'
    ])
  })

  it('accepts the AC fixture', () => {
    expect(pmccEntrySchema(TODAY).safeParse(FIXTURE).success).toBe(true)
  })

  it('requires each leg fill price with its own message', () => {
    expect(issuesAt(withLegs({ long: { fillPrice: '' } }), ['long', 'fillPrice'])).toContain(
      'Enter the actual LEAPS fill price.'
    )
    expect(issuesAt(withLegs({ short: { fillPrice: '' } }), ['short', 'fillPrice'])).toContain(
      'Enter the actual short-call fill price.'
    )
  })

  it('rejects a zero fill price', () => {
    expect(issuesAt(withLegs({ long: { fillPrice: '0' } }), ['long', 'fillPrice'])).toContain(
      'Actual fill price must be greater than zero.'
    )
  })

  it.each(['1.5', '0'])('rejects %s contracts', (contracts) => {
    expect(issuesAt(withLegs({ contracts }), ['contracts'])).toContain(
      'Contracts must be a positive whole number.'
    )
  })

  it('rejects negative fees', () => {
    expect(issuesAt(withLegs({ short: { fees: '-1' } }), ['short', 'fees'])).toContain(
      'Fees cannot be negative.'
    )
  })

  it.each(['long', 'short'] as const)('requires the %s leg fees', (leg) => {
    expect(issuesAt(withLegs({ [leg]: { fees: '' } }), [leg, 'fees'])).toEqual(['Enter the fees.'])
  })

  it('reports every broken cross-leg rule at its own path', () => {
    const result = pmccEntrySchema(TODAY).safeParse(
      withLegs({ short: { strike: '70', fillPrice: '30.00', expiration: '2027-12-17' } })
    )
    expect(
      result.success ? [] : result.error.issues.map((i) => [i.path.join('.'), i.message])
    ).toEqual([
      ['short.expiration', 'Short call must expire before the LEAPS call.'],
      ['short.strike', 'Short-call strike must be above the LEAPS strike.'],
      ['__pair__', 'This PMCC entry requires a net debit before fees.']
    ])
  })

  it('rejects a short call that does not expire before the LEAPS', () => {
    expect(
      issuesAt(withLegs({ short: { expiration: '2027-09-17' } }), ['short', 'expiration'])
    ).toContain('Short call must expire before the LEAPS call.')
  })

  it('rejects a short strike at or below the LEAPS strike', () => {
    expect(issuesAt(withLegs({ short: { strike: '80' } }), ['short', 'strike'])).toContain(
      'Short-call strike must be above the LEAPS strike.'
    )
  })

  it('rejects a LEAPS acquired after the short-call fill', () => {
    const values = withLegs({ long: { fillDate: TODAY }, short: { fillDate: '2026-09-10' } })
    expect(issuesAt(values, ['short', 'fillDate'])).toContain(
      'LEAPS must be acquired no later than the short-call fill.'
    )
  })

  it('rejects a fill date in the future', () => {
    expect(
      issuesAt(withLegs({ short: { fillDate: '2026-09-15' } }), ['short', 'fillDate'])
    ).toContain('Fill date cannot be in the future.')
  })

  it('rejects an expiration on or before the fill date', () => {
    const values = withLegs({
      long: { fillDate: '2026-09-01' },
      short: { fillDate: '2026-09-10', expiration: '2026-09-10' }
    })
    expect(issuesAt(values, ['short', 'expiration'])).toContain(
      'Expiration must be after the fill date.'
    )
  })

  it('rejects an expiration before today', () => {
    const values = withLegs({
      long: { fillDate: '2026-09-01' },
      short: { fillDate: '2026-09-01', expiration: '2026-09-11' }
    })
    expect(issuesAt(values, ['short', 'expiration'])).toContain(
      'Use an unexpired contract for opening a current position.'
    )
  })

  it.each(['long', 'short'] as const)(
    'names the %s leg expired, not expiring on its fill date, when both fill today and it expired yesterday',
    (leg) => {
      const values = withLegs({ [leg]: { fillDate: TODAY, expiration: '2026-09-13' } })
      expect(issuesAt(values, [leg, 'expiration'])[0]).toBe(
        'Use an unexpired contract for opening a current position.'
      )
    }
  )

  it('rejects a pair that is not a net debit before fees', () => {
    expect(issuesAt(withLegs({ short: { fillPrice: '25.00' } }), ['__pair__'])).toEqual([
      'This PMCC entry requires a net debit before fees.'
    ])
  })
})

describe('EMPTY_PMCC_DEFAULTS', () => {
  it('defaults fees to 0.00 and fill dates to today, everything else blank', () => {
    const leg = { strike: '', expiration: '', fillPrice: '', fees: '0.00', fillDate: TODAY }
    expect(EMPTY_PMCC_DEFAULTS(TODAY)).toEqual({
      ticker: '',
      contracts: '',
      long: leg,
      short: leg,
      thesis: '',
      notes: ''
    })
  })
})

describe('toCreatePmccPayload', () => {
  it('maps an unparseable number to NaN so the IPC schema rejects it', () => {
    const payload = toCreatePmccPayload({ ...FIXTURE, long: { ...FIXTURE.long, strike: 'abc' } })
    expect(payload.long.strike).toBeNaN()
  })

  it('maps the fixture to the contract example payload', () => {
    expect(toCreatePmccPayload(FIXTURE)).toEqual({
      strategy: 'PMCC',
      ticker: 'XYZ',
      long: {
        underlying: 'XYZ',
        instrumentType: 'CALL',
        deliverableShares: 100,
        strike: 80,
        expiration: '2027-09-17',
        contracts: 1,
        fillPrice: 25,
        fillDate: '2026-09-14',
        fees: 0
      },
      short: {
        underlying: 'XYZ',
        instrumentType: 'CALL',
        deliverableShares: 100,
        strike: 110,
        expiration: '2026-10-16',
        contracts: 1,
        fillPrice: 2,
        fillDate: '2026-09-14',
        fees: 0
      }
    })
  })

  it('carries the shared contract count onto both legs', () => {
    const payload = toCreatePmccPayload(withLegs({ contracts: '3' }))
    expect([payload.long.contracts, payload.short.contracts]).toEqual([3, 3])
  })
})
