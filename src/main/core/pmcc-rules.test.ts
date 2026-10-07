import { describe, expect, it } from 'vitest'
import {
  EXPIRATION_NOT_AFTER_FILL,
  pmccCrossLegIssues,
  pmccShortRollIssues,
  SHORT_NOT_BEFORE_LONG,
  shortExpiresBeforeLeaps,
  type PmccCrossLegInput,
  type PmccCrossLegValues,
  type PmccIssue,
  type PmccShortRollField,
  type PmccShortRollInput
} from './pmcc-rules'

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

describe('shortExpiresBeforeLeaps', () => {
  it('accepts a short call expiring before the LEAPS', () => {
    expect(shortExpiresBeforeLeaps('2026-10-16', '2027-09-17')).toBe(true)
  })

  it('rejects a short call expiring with the LEAPS', () => {
    expect(shortExpiresBeforeLeaps('2027-09-17', '2027-09-17')).toBe(false)
  })

  it('rejects a short call expiring after the LEAPS', () => {
    expect(shortExpiresBeforeLeaps('2027-10-15', '2027-09-17')).toBe(false)
  })
})

describe('SHORT_NOT_BEFORE_LONG', () => {
  it('is the code and message the cross-leg rule reports', () => {
    expect(SHORT_NOT_BEFORE_LONG).toEqual({
      code: 'short_not_before_long',
      message: 'Short call must expire before the LEAPS call.'
    })
  })

  it('is what pmccCrossLegIssues reports for a short call outlasting the LEAPS', () => {
    expect(pmccCrossLegIssues(input({ short: { expiration: '2027-10-15' } }))).toEqual([
      { field: 'short.expiration', ...SHORT_NOT_BEFORE_LONG }
    ])
  })
})

describe('pmccShortRollIssues', () => {
  const OPEN_SHORT = { strike: '108.0000', expiration: '2026-11-20', fillDate: '2026-10-02' }
  const VALID: PmccShortRollInput = {
    openShort: OPEN_SHORT,
    leapsExpiration: '2027-09-17',
    fillDate: '2026-10-09',
    newStrike: '112',
    newExpiration: '2026-12-18'
  }
  const issues = (patch: Partial<PmccShortRollInput>): PmccIssue<PmccShortRollField>[] =>
    pmccShortRollIssues({ ...VALID, ...patch })

  it('returns no issues for a valid roll up and out', () => {
    expect(issues({})).toEqual([])
  })

  it('reports a fill date before the open short call was filled', () => {
    expect(issues({ fillDate: '2026-10-01' })).toEqual([
      {
        field: 'fillDate',
        code: 'close_date_before_open',
        message: 'Fill date cannot be before the short call open date'
      }
    ])
  })

  it('accepts a fill date on the open short call fill date', () => {
    expect(issues({ fillDate: '2026-10-02' })).toEqual([])
  })

  it('reports a fill date after the open short call expired', () => {
    expect(issues({ fillDate: '2026-11-21' })).toEqual([
      {
        field: 'fillDate',
        code: 'close_date_after_expiration',
        message: 'Fill date cannot be after the short call expiration date'
      }
    ])
  })

  it('accepts a fill date on the open short call expiration', () => {
    expect(issues({ fillDate: '2026-11-20' })).toEqual([])
  })

  it('reports a replacement on the LEAPS expiration with the shared coverage rule', () => {
    expect(issues({ newExpiration: '2027-09-17' })).toEqual([
      { field: 'newExpiration', ...SHORT_NOT_BEFORE_LONG }
    ])
  })

  it('reports a replacement before the current expiration with the formatted date', () => {
    expect(issues({ newExpiration: '2026-11-13' })).toEqual([
      {
        field: 'newExpiration',
        code: 'must_be_on_or_after_current',
        message: 'Replacement expiration must be on or after the current expiration (Nov 20, 2026)'
      }
    ])
  })

  it('accepts a replacement on the current expiration when the strike changes', () => {
    expect(issues({ newExpiration: '2026-11-20' })).toEqual([])
  })

  it('reports a replacement expiring on the roll fill date', () => {
    // Once the fill is on/before the current expiration, the replacement can only share the
    // fill date by expiring on the current expiration too.
    expect(
      issues({
        openShort: { ...OPEN_SHORT, expiration: '2026-12-18' },
        fillDate: '2026-12-18',
        newExpiration: '2026-12-18'
      })
    ).toEqual([{ field: 'newExpiration', ...EXPIRATION_NOT_AFTER_FILL }])
  })

  it('reports a roll that changes neither strike nor expiration, comparing strikes as numbers', () => {
    expect(issues({ newStrike: '108.00', newExpiration: '2026-11-20' })).toEqual([
      {
        field: '__roll__',
        code: 'no_change',
        message: 'Roll must change the strike, the expiration, or both'
      }
    ])
  })

  it('lists every broken rule in the engine order', () => {
    expect(
      issues({ fillDate: '2026-12-01', newStrike: '108', newExpiration: '2026-11-13' }).map(
        ({ code }) => code
      )
    ).toEqual([
      'close_date_after_expiration',
      'must_be_on_or_after_current',
      'expiration_not_after_fill'
    ])
    expect(
      issues({ fillDate: '2026-10-01', newExpiration: '2027-10-15' }).map(({ code }) => code)
    ).toEqual(['close_date_before_open', 'short_not_before_long'])
    expect(
      issues({
        openShort: { ...OPEN_SHORT, expiration: '2026-09-25' },
        fillDate: '2026-09-28'
      }).map(({ code }) => code)
    ).toEqual(['close_date_before_open', 'close_date_after_expiration'])
  })

  it('skips every rule that reads an undecided value', () => {
    expect(issues({ fillDate: undefined, newStrike: undefined, newExpiration: undefined })).toEqual(
      []
    )
    expect(issues({ fillDate: undefined, newExpiration: '2026-11-27' })).toEqual([])
    expect(issues({ newStrike: undefined, newExpiration: '2026-11-20' })).toEqual([])
  })
})
