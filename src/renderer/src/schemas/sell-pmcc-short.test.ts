// [US-115] The Sell Short Call form's schema: defaults, the AC's invalid-entry and shape rows at
// their form paths, one message per field, and the IPC payload mapping.
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PmccLegFormSlice } from './pmcc-entry'
import {
  EMPTY_SELL_PMCC_SHORT_DEFAULTS,
  sellPmccShortSchema,
  toSellPmccShortPayload,
  type SellPmccShortFormContext,
  type SellPmccShortFormValues
} from './sell-pmcc-short'

const TODAY = '2027-07-23'

/** The Background: the $85 LEAPS filled 2027-07-09, cycle 8 expired worthless 2027-07-16. */
const CTX: SellPmccShortFormContext = {
  leaps: { strike: '85.0000', expiration: '2028-01-21', fillDate: '2027-07-09', contracts: 1 },
  previousShortRetiredOn: '2027-07-16',
  today: TODAY
}

const NEXT_SHORT: SellPmccShortFormValues = {
  contracts: '1',
  short: {
    contractId: 'XYZ270820C00118000',
    strike: '118',
    expiration: '2027-08-20',
    fillPrice: '1.95',
    fees: '0.00',
    fillDate: TODAY
  }
}

type Patch = Partial<Pick<SellPmccShortFormValues, 'contracts'>> & {
  short?: Partial<SellPmccShortFormValues['short']>
}

const withPatch = ({ short, ...rest }: Patch): SellPmccShortFormValues => ({
  ...NEXT_SHORT,
  ...rest,
  short: { ...NEXT_SHORT.short, ...short }
})

/** Every issue as `[path, message]`, in the order the schema reports them. */
function issues(patch: Patch, ctx: SellPmccShortFormContext = CTX): [string, string][] {
  const result = sellPmccShortSchema(ctx).safeParse(withPatch(patch))
  if (result.success) return []
  return result.error.issues.map((issue) => [issue.path.join('.'), issue.message])
}

describe('EMPTY_SELL_PMCC_SHORT_DEFAULTS', () => {
  it('starts at the LEAPS contract count, today and no fees, with the contract left empty', () => {
    expect(EMPTY_SELL_PMCC_SHORT_DEFAULTS(TODAY, 1)).toEqual({
      contracts: '1',
      short: { strike: '', expiration: '', fillPrice: '', fees: '0.00', fillDate: '2027-07-23' }
    })
  })

  it('defaults contracts to every LEAPS contract held', () => {
    expect(EMPTY_SELL_PMCC_SHORT_DEFAULTS(TODAY, 3).contracts).toBe('3')
  })
})

describe('sellPmccShortSchema', () => {
  it('accepts the next short call', () => {
    expect(issues({})).toEqual([])
  })

  // Reject invalid entry (OPT-23, 6 rows).
  it.each<[string, Patch, string, string]>([
    [
      'a zero sale price',
      { short: { fillPrice: '0.00' } },
      'short.fillPrice',
      'Actual fill price must be greater than zero.'
    ],
    [
      'zero contracts',
      { contracts: '0' },
      'contracts',
      'Contracts must be a positive whole number.'
    ],
    [
      'more contracts than the LEAPS holds',
      { contracts: '2' },
      'contracts',
      'Cannot sell more short calls than LEAPS contracts held (1).'
    ],
    [
      'a fill date in the future',
      { short: { fillDate: '2027-07-24' } },
      'short.fillDate',
      'Fill date cannot be in the future.'
    ],
    [
      'a fill date before the previous short was retired',
      { short: { fillDate: '2027-07-15' } },
      'short.fillDate',
      'Fill date cannot be before the previous short call was retired (2027-07-16).'
    ],
    [
      'an expiration on the fill date',
      { short: { expiration: '2027-07-23', fillDate: '2027-07-23' } },
      'short.expiration',
      'Expiration must be after the fill date.'
    ]
  ])('rejects %s on its field', (_name, patch, path, message) => {
    expect(issues(patch)).toEqual([[path, message]])
  })

  // Reject a short call that breaks the PMCC shape (OPT-23, 4 rows).
  const EXPIRES_WITH_LEAPS = 'Short call must expire before the LEAPS call.'
  const STRIKE_AT_OR_BELOW = 'Short-call strike must be above the LEAPS strike.'
  it.each<[string, Patch, string, string]>([
    ['2028-01-21', { short: { expiration: '2028-01-21' } }, 'short.expiration', EXPIRES_WITH_LEAPS],
    ['2028-02-18', { short: { expiration: '2028-02-18' } }, 'short.expiration', EXPIRES_WITH_LEAPS],
    ['$85', { short: { strike: '85' } }, 'short.strike', STRIKE_AT_OR_BELOW],
    ['$80', { short: { strike: '80' } }, 'short.strike', STRIKE_AT_OR_BELOW]
  ])(
    'rejects a short call at %s against the $85 · 2028-01-21 LEAPS',
    (_name, patch, path, message) => {
      expect(issues(patch)).toEqual([[path, message]])
    }
  )

  it('caps contracts at the LEAPS count it is given', () => {
    const threeLeaps = { ...CTX, leaps: { ...CTX.leaps, contracts: 3 } }
    expect(issues({ contracts: '3' }, threeLeaps)).toEqual([])
    expect(issues({ contracts: '4' }, threeLeaps)).toEqual([
      ['contracts', 'Cannot sell more short calls than LEAPS contracts held (3).']
    ])
  })

  it('routes each rule to its form path, in the engine order', () => {
    expect(issues({ contracts: '2', short: { expiration: '2028-02-18', strike: '80' } })).toEqual([
      ['contracts', 'Cannot sell more short calls than LEAPS contracts held (1).'],
      ['short.expiration', 'Short call must expire before the LEAPS call.'],
      ['short.strike', 'Short-call strike must be above the LEAPS strike.']
    ])
  })

  it('reports only the first broken rule on a field', () => {
    // Expired and on/before the fill: the expired-contract rule comes first.
    expect(issues({ short: { expiration: '2027-07-22' } })).toEqual([
      ['short.expiration', 'Use an unexpired contract for opening a current position.']
    ])
  })

  it.each<[string, Patch, string]>([
    ['short.strike', { short: { strike: '' } }, 'Strike must be positive'],
    ['short.expiration', { short: { expiration: '' } }, 'Date must be YYYY-MM-DD'],
    ['short.fillDate', { short: { fillDate: '' } }, 'Date must be YYYY-MM-DD'],
    ['short.fillPrice', { short: { fillPrice: '' } }, 'Enter the actual short-call fill price.'],
    ['contracts', { contracts: '' }, 'Contracts must be a positive whole number.']
  ])('reports only its own required message for an empty %s', (path, patch, message) => {
    expect(issues(patch)).toEqual([[path, message]])
  })

  it('reports only the whole-number message for fractional contracts', () => {
    expect(issues({ contracts: '2.5' })).toEqual([
      ['contracts', 'Contracts must be a positive whole number.']
    ])
  })

  it('still judges the decided fields while another is mid-edit', () => {
    expect(issues({ short: { strike: '', expiration: '2028-02-18' } })).toEqual([
      ['short.strike', 'Strike must be positive'],
      ['short.expiration', 'Short call must expire before the LEAPS call.']
    ])
  })

  it('binds to the slice PmccLegSection reads', () => {
    expectTypeOf<SellPmccShortFormValues>().toExtend<PmccLegFormSlice>()
  })
})

describe('toSellPmccShortPayload', () => {
  it('sends numbers and ISO dates for the position', () => {
    expect(toSellPmccShortPayload('pos-1', NEXT_SHORT)).toEqual({
      positionId: 'pos-1',
      strike: 118,
      expiration: '2027-08-20',
      contracts: 1,
      fillPrice: 1.95,
      fillDate: '2027-07-23',
      fees: 0
    })
  })

  it('carries the fees and a partial contract count', () => {
    expect(
      toSellPmccShortPayload('pos-1', withPatch({ contracts: '3', short: { fees: '1.00' } }))
    ).toEqual(expect.objectContaining({ contracts: 3, fees: 1 }))
  })
})
