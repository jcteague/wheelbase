import { describe, expect, it } from 'vitest'
import { pmccCrossLegIssues, type PmccCrossLegInput, type PmccCrossLegValues } from './pmcc-rules'

const TODAY = '2026-09-14'

const LONG: PmccCrossLegValues = {
  strike: '80',
  expiration: '2027-09-17',
  fillPrice: '25.00',
  fillDate: TODAY
}
const SHORT: PmccCrossLegValues = {
  strike: '110',
  expiration: '2026-10-16',
  fillPrice: '2.00',
  fillDate: TODAY
}

function input(
  patch: { long?: Partial<PmccCrossLegValues>; short?: Partial<PmccCrossLegValues> } = {}
): PmccCrossLegInput {
  return {
    long: { ...LONG, ...patch.long },
    short: { ...SHORT, ...patch.short },
    referenceDate: TODAY
  }
}

const UNDECIDED: PmccCrossLegValues = {
  strike: undefined,
  expiration: undefined,
  fillPrice: undefined,
  fillDate: undefined
}

describe('pmccCrossLegIssues', () => {
  it('returns no issues for a valid pair', () => {
    expect(pmccCrossLegIssues(input())).toEqual([])
  })

  it.each<[string, Parameters<typeof input>[0], string, string, string]>([
    [
      'a future short fill date',
      { long: { fillDate: '2026-09-01' }, short: { fillDate: '2026-09-15' } },
      'short.fillDate',
      'cannot_be_future',
      'Fill date cannot be in the future.'
    ],
    [
      'a LEAPS acquired after the short-call fill',
      { short: { fillDate: '2026-09-10' } },
      'short.fillDate',
      'long_after_short',
      'LEAPS must be acquired no later than the short-call fill.'
    ],
    [
      'an expired short call',
      {
        long: { fillDate: '2026-09-01' },
        short: { fillDate: '2026-09-01', expiration: '2026-09-11' }
      },
      'short.expiration',
      'expired_contract',
      'Use an unexpired contract for opening a current position.'
    ],
    [
      'a short expiration on its fill date',
      { short: { expiration: TODAY } },
      'short.expiration',
      'expiration_not_after_fill',
      'Expiration must be after the fill date.'
    ],
    [
      'a short call expiring with the LEAPS',
      { short: { expiration: '2027-09-17' } },
      'short.expiration',
      'short_not_before_long',
      'Short call must expire before the LEAPS call.'
    ],
    [
      'a short strike at the LEAPS strike',
      { short: { strike: '80' } },
      'short.strike',
      'strike_not_above_long',
      'Short-call strike must be above the LEAPS strike.'
    ],
    [
      'a pair that is not a net debit',
      { short: { fillPrice: '25.00' } },
      '__pair__',
      'not_net_debit',
      'This PMCC entry requires a net debit before fees.'
    ]
  ])('reports %s', (_label, patch, field, code, message) => {
    expect(pmccCrossLegIssues(input(patch))).toEqual([{ field, code, message }])
  })

  it('reports every broken rule, not just the first, in engine order', () => {
    const issues = pmccCrossLegIssues(
      input({
        long: { fillDate: '2026-09-15' },
        short: { strike: '70', fillPrice: '30.00', expiration: '2027-12-17' }
      })
    )
    expect(issues.map(({ field, code }) => [field, code])).toEqual([
      ['long.fillDate', 'cannot_be_future'],
      ['short.fillDate', 'long_after_short'],
      ['short.expiration', 'short_not_before_long'],
      ['short.strike', 'strike_not_above_long'],
      ['__pair__', 'not_net_debit']
    ])
  })

  it('reports an expired contract before an expiration on or before its fill date', () => {
    const issues = pmccCrossLegIssues(input({ long: { expiration: '2026-09-13' } }))
    const atLongExpiration = issues.filter(({ field }) => field === 'long.expiration')
    expect(atLongExpiration.map(({ field, code }) => [field, code])).toEqual([
      ['long.expiration', 'expired_contract'],
      ['long.expiration', 'expiration_not_after_fill']
    ])
  })

  it('skips every rule that reads an undecided value', () => {
    expect(pmccCrossLegIssues({ long: UNDECIDED, short: UNDECIDED, referenceDate: TODAY })).toEqual(
      []
    )
  })

  it('still judges the values that are decided', () => {
    const issues = pmccCrossLegIssues({
      long: { ...UNDECIDED, strike: '80' },
      short: { ...UNDECIDED, strike: '75', fillDate: '2026-09-15' },
      referenceDate: TODAY
    })
    expect(issues.map(({ code }) => code)).toEqual(['cannot_be_future', 'strike_not_above_long'])
  })
})
