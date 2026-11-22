import { describe, expect, it } from 'vitest'
import {
  EXPIRATION_NOT_AFTER_FILL,
  latestFillDate,
  leapsStrikeNotBelowShortMessage,
  LONG_NOT_AFTER_SHORT,
  pmccCrossLegIssues,
  pmccFillDateFloor,
  pmccLeapsRollIssues,
  pmccShortRollIssues,
  pmccSubsequentShortIssues,
  ROLL_NO_CHANGE,
  SHORT_CALL_ALREADY_OPEN,
  SHORT_NOT_BEFORE_LONG,
  shortExpiresBeforeLeaps,
  shortStrikeAboveLeaps,
  STRIKE_NOT_BELOW_SHORT_CODE,
  type PmccCrossLegInput,
  type PmccCrossLegValues,
  type PmccIssue,
  type PmccLeapsRollField,
  type PmccLeapsRollInput,
  type PmccShortRollField,
  type PmccShortRollInput,
  type PmccSubsequentShortContext,
  type PmccSubsequentShortInput,
  type PmccSubsequentShortValues
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

  it.each([
    ['2026-10-15', '2026-10-16'],
    ['2026-09-30', '2026-10-01'],
    ['2026-12-31', '2027-01-01'],
    ['2028-02-28', '2028-02-29'],
    ['2028-02-29', '2028-03-01']
  ])('preserves strict coverage across calendar boundaries (%s, %s)', (earlier, later) => {
    expect(shortExpiresBeforeLeaps(earlier, later)).toBe(true)
    expect(shortExpiresBeforeLeaps(later, earlier)).toBe(false)
    expect(shortExpiresBeforeLeaps(earlier, earlier)).toBe(false)
  })

  it.each([
    ['2027-02-29', '2027-03-01'],
    ['2027-04-31', '2027-05-01'],
    ['2027-09-17', '2027-13-01'],
    ['', '2027-09-17'],
    ['2027-09-17', 'not-a-date']
  ])('cannot establish coverage with an invalid calendar date (%s, %s)', (short, long) => {
    expect(shortExpiresBeforeLeaps(short, long)).toBe(false)
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

// [US-105] The strike-ordering predicate and the long-side comparator, shared with the LEAPS roll.
describe('shortStrikeAboveLeaps', () => {
  it('accepts a short strike above the LEAPS strike', () => {
    expect(shortStrikeAboveLeaps('112.0000', '85.0000')).toBe(true)
  })

  it('rejects equal strikes, compared numerically', () => {
    expect(shortStrikeAboveLeaps('112.0000', '112')).toBe(false)
  })

  it('rejects a short strike below the LEAPS strike', () => {
    expect(shortStrikeAboveLeaps('80.0000', '85.0000')).toBe(false)
  })
})

describe('LONG_NOT_AFTER_SHORT', () => {
  it('is the code and message for a LEAPS that does not outlast the short call', () => {
    expect(LONG_NOT_AFTER_SHORT).toEqual({
      code: 'long_not_after_short',
      message: 'LEAPS call must expire after the short call.'
    })
  })
})

describe('STRIKE_NOT_BELOW_SHORT_CODE', () => {
  it('is the stable code for a LEAPS strike not below the short strike', () => {
    expect(STRIKE_NOT_BELOW_SHORT_CODE).toBe('strike_not_below_short')
  })
})

describe('leapsStrikeNotBelowShortMessage', () => {
  it('formats the short strike to cents', () => {
    expect(leapsStrikeNotBelowShortMessage('112.0000')).toBe(
      'LEAPS strike must be below the short-call strike ($112.00).'
    )
  })

  it('pads a one-decimal strike', () => {
    expect(leapsStrikeNotBelowShortMessage('112.5')).toBe(
      'LEAPS strike must be below the short-call strike ($112.50).'
    )
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

describe('latestFillDate', () => {
  it('returns the latest fill date, whatever the leg order', () => {
    expect(
      latestFillDate([
        { fillDate: '2026-09-14' },
        { fillDate: '2026-11-16' },
        { fillDate: '2026-10-16' }
      ])
    ).toBe('2026-11-16')
  })

  it('returns an empty string, before every date, for no legs', () => {
    expect(latestFillDate([])).toBe('')
  })
})

// [US-105] The LEAPS roll's rules: fill-date ordering against the LEAPS being sold, the two shape
// rules against the open short, the replacement's own expiry, and no-change.
describe('pmccLeapsRollIssues', () => {
  const CURRENT_LEAPS = { strike: '80.0000', expiration: '2027-09-17', fillDate: '2026-09-14' }
  const OPEN_SHORT = { strike: '112.0000', expiration: '2027-07-16' }
  const VALID: PmccLeapsRollInput = {
    currentLeaps: CURRENT_LEAPS,
    openShort: OPEN_SHORT,
    lastEventDate: '2027-06-18',
    fillDate: '2027-07-09',
    newStrike: '85',
    newExpiration: '2028-01-21'
  }
  const issues = (patch: Partial<PmccLeapsRollInput>): PmccIssue<PmccLeapsRollField>[] =>
    pmccLeapsRollIssues({ ...VALID, ...patch })
  const codes = (patch: Partial<PmccLeapsRollInput>): string[] =>
    issues(patch).map(({ code }) => code)

  it('returns no issues for a valid roll up and out', () => {
    expect(issues({})).toEqual([])
  })

  it('reports a fill date before the last recorded event, naming that date', () => {
    expect(issues({ fillDate: '2027-06-17' })).toEqual([
      {
        field: 'fillDate',
        code: 'before_last_event',
        message: 'Fill date cannot be before the last recorded event (Jun 18, 2027)'
      }
    ])
  })

  it('with no recorded event, applies no last-event rule', () => {
    expect(issues({ lastEventDate: '' })).toEqual([])
  })

  it('accepts a fill date on the last recorded event', () => {
    expect(issues({ fillDate: '2027-06-18' })).toEqual([])
  })

  it('reports a fill date before the LEAPS was filled as before the last event', () => {
    expect(
      issues({ lastEventDate: CURRENT_LEAPS.fillDate, fillDate: '2026-09-13' }).map(
        ({ code }) => code
      )
    ).toEqual(['before_last_event'])
  })

  it('accepts a fill date on the LEAPS fill date when nothing has happened since', () => {
    expect(issues({ lastEventDate: CURRENT_LEAPS.fillDate, fillDate: '2026-09-14' })).toEqual([])
  })

  it('reports a fill date after the LEAPS expired', () => {
    expect(issues({ openShort: null, fillDate: '2027-09-18' })).toEqual([
      {
        field: 'fillDate',
        code: 'close_date_after_expiration',
        message: 'Fill date cannot be after the LEAPS expiration date'
      }
    ])
  })

  it('accepts a fill date on the LEAPS expiration', () => {
    expect(issues({ openShort: null, fillDate: '2027-09-17' })).toEqual([])
  })

  it('reports a replacement on or before the open short expiration with the coverage rule', () => {
    expect(issues({ newExpiration: '2027-07-16' })).toEqual([
      { field: 'newExpiration', ...LONG_NOT_AFTER_SHORT }
    ])
  })

  it('reports a strike at the open short strike with its formatted message', () => {
    expect(issues({ newStrike: '112' })).toEqual([
      {
        field: 'newStrike',
        code: STRIKE_NOT_BELOW_SHORT_CODE,
        message: leapsStrikeNotBelowShortMessage('112.0000')
      }
    ])
  })

  it('with no short open, applies neither shape rule', () => {
    expect(issues({ openShort: null, newStrike: '112', newExpiration: '2027-07-16' })).toEqual([])
  })

  it('reports a replacement expiring on or before the roll fill date', () => {
    expect(issues({ openShort: null, newExpiration: '2027-07-09' })).toEqual([
      { field: 'newExpiration', ...EXPIRATION_NOT_AFTER_FILL }
    ])
    expect(codes({ openShort: null, newExpiration: '2027-07-01' })).toEqual([
      EXPIRATION_NOT_AFTER_FILL.code
    ])
  })

  it('reports a roll that changes neither strike nor expiration, comparing strikes as numbers', () => {
    expect(issues({ newStrike: '80.00', newExpiration: '2027-09-17' })).toEqual([
      { field: '__roll__', ...ROLL_NO_CHANGE }
    ])
  })

  it('lists every broken rule in the engine order', () => {
    expect(
      codes({ fillDate: '2026-09-01', newStrike: '112', newExpiration: '2027-07-16' })
    ).toEqual(['before_last_event', 'long_not_after_short', 'strike_not_below_short'])
    expect(codes({ fillDate: '2027-10-01', newExpiration: '2027-07-16' })).toEqual([
      'close_date_after_expiration',
      'long_not_after_short',
      'expiration_not_after_fill'
    ])
    expect(
      codes({
        openShort: { strike: '80.0000', expiration: '2027-07-16' },
        newStrike: '80',
        newExpiration: '2027-09-17'
      })
    ).toEqual(['strike_not_below_short', 'no_change'])
  })

  it('skips every rule that reads an undecided value', () => {
    expect(issues({ fillDate: undefined, newStrike: undefined, newExpiration: undefined })).toEqual(
      []
    )
    expect(issues({ fillDate: undefined, newExpiration: '2027-07-01', openShort: null })).toEqual(
      []
    )
    expect(issues({ newStrike: undefined, newExpiration: '2027-09-17' })).toEqual([])
    expect(issues({ newExpiration: undefined, newStrike: '80' })).toEqual([])
  })
})

// [US-115] Selling the next short call against an open LEAPS. Background: LEAPS $85.00 expiring
// 2028-01-21, 1 contract, filled 2027-07-09; the previous short retired 2027-07-16; today is
// 2027-07-23.
const SALE_CONTEXT: PmccSubsequentShortContext = {
  leaps: { strike: '85.0000', expiration: '2028-01-21', contracts: 1, fillDate: '2027-07-09' },
  previousShortRetiredOn: '2027-07-16',
  today: '2027-07-23'
}
const SALE: PmccSubsequentShortValues = {
  strike: '118.0000',
  expiration: '2027-08-20',
  contracts: 1,
  fillDate: '2027-07-23'
}

function sale({
  short,
  leaps,
  ...context
}: {
  short?: Partial<PmccSubsequentShortValues>
  leaps?: Partial<PmccSubsequentShortContext['leaps']>
  previousShortRetiredOn?: string | null
} = {}): PmccSubsequentShortInput {
  return {
    ...SALE_CONTEXT,
    ...context,
    leaps: { ...SALE_CONTEXT.leaps, ...leaps },
    short: { ...SALE, ...short }
  }
}

const BEFORE_PREVIOUS_SHORT = {
  field: 'fillDate',
  code: 'before_previous_short',
  message: 'Fill date cannot be before the previous short call was retired (2027-07-16).'
}
const LEAPS_FILLED_AFTER_SALE = {
  field: 'fillDate',
  code: 'long_after_short',
  message: 'LEAPS must be acquired no later than the short-call fill.'
}
const STRIKE_AT_OR_BELOW_LEAPS = {
  field: 'strike',
  code: 'strike_not_above_long',
  message: 'Short-call strike must be above the LEAPS strike.'
}

describe('pmccSubsequentShortIssues', () => {
  it('accepts the Background sale', () => {
    expect(pmccSubsequentShortIssues(sale())).toEqual([])
  })

  describe('contracts cap', () => {
    it('reports more contracts than the LEAPS holds, naming the LEAPS count', () => {
      expect(pmccSubsequentShortIssues(sale({ short: { contracts: 2 } }))).toEqual([
        {
          field: 'contracts',
          code: 'exceeds_leaps_contracts',
          message: 'Cannot sell more short calls than LEAPS contracts held (1).'
        }
      ])
    })

    it('accepts as many contracts as the LEAPS holds', () => {
      expect(
        pmccSubsequentShortIssues(sale({ leaps: { contracts: 3 }, short: { contracts: 3 } }))
      ).toEqual([])
    })

    it('names a three-contract LEAPS when four are sold', () => {
      expect(
        pmccSubsequentShortIssues(sale({ leaps: { contracts: 3 }, short: { contracts: 4 } }))
      ).toEqual([
        {
          field: 'contracts',
          code: 'exceeds_leaps_contracts',
          message: 'Cannot sell more short calls than LEAPS contracts held (3).'
        }
      ])
    })
  })

  it('reports a fill date after today', () => {
    expect(pmccSubsequentShortIssues(sale({ short: { fillDate: '2027-07-24' } }))).toEqual([
      { field: 'fillDate', code: 'cannot_be_future', message: 'Fill date cannot be in the future.' }
    ])
  })

  describe('fill-date floor', () => {
    it('reports a fill the day before the previous short was retired, naming that date', () => {
      expect(pmccSubsequentShortIssues(sale({ short: { fillDate: '2027-07-15' } }))).toEqual([
        BEFORE_PREVIOUS_SHORT
      ])
    })

    it.each(['2027-07-16', '2027-07-17'])(
      'accepts a fill on %s, on or after the retirement',
      (fillDate) => {
        expect(pmccSubsequentShortIssues(sale({ short: { fillDate } }))).toEqual([])
      }
    )

    it('reports only the LEAPS floor when the LEAPS was bought after the retirement', () => {
      expect(
        pmccSubsequentShortIssues(
          sale({ leaps: { fillDate: '2027-07-20' }, short: { fillDate: '2027-07-18' } })
        )
      ).toEqual([LEAPS_FILLED_AFTER_SALE])
    })

    it('accepts a fill on the LEAPS fill date when that floor binds', () => {
      expect(
        pmccSubsequentShortIssues(
          sale({ leaps: { fillDate: '2027-07-20' }, short: { fillDate: '2027-07-20' } })
        )
      ).toEqual([])
    })

    it('reports only the previous-short floor when both floors fall on the same day', () => {
      expect(
        pmccSubsequentShortIssues(
          sale({ leaps: { fillDate: '2027-07-16' }, short: { fillDate: '2027-07-15' } })
        )
      ).toEqual([BEFORE_PREVIOUS_SHORT])
    })

    it('judges the fill against the LEAPS alone when no short was ever retired', () => {
      expect(
        pmccSubsequentShortIssues(
          sale({ previousShortRetiredOn: null, short: { fillDate: '2027-07-08' } })
        )
      ).toEqual([LEAPS_FILLED_AFTER_SALE])
      expect(
        pmccSubsequentShortIssues(
          sale({ previousShortRetiredOn: null, short: { fillDate: '2027-07-09' } })
        )
      ).toEqual([])
    })
  })

  describe('expiration', () => {
    it('reports an expired contract, and not an expiration on or before the fill', () => {
      expect(
        pmccSubsequentShortIssues(
          sale({ short: { expiration: '2027-07-22', fillDate: '2027-07-20' } })
        )
      ).toEqual([
        {
          field: 'expiration',
          code: 'expired_contract',
          message: 'Use an unexpired contract for opening a current position.'
        }
      ])
    })

    it('reports an expiration on the fill date, which today does not count as expired', () => {
      expect(
        pmccSubsequentShortIssues(
          sale({ short: { expiration: '2027-07-23', fillDate: '2027-07-23' } })
        )
      ).toEqual([
        {
          field: 'expiration',
          code: 'expiration_not_after_fill',
          message: 'Expiration must be after the fill date.'
        }
      ])
    })

    it.each(['2028-01-21', '2028-02-18'])(
      "reports a short call expiring on %s, not before the LEAPS, with US-102's message",
      (expiration) => {
        const issues = pmccSubsequentShortIssues(sale({ short: { expiration } }))
        expect(issues).toEqual([
          {
            field: 'expiration',
            code: 'short_not_before_long',
            message: 'Short call must expire before the LEAPS call.'
          }
        ])
        expect(issues[0].message).toBe(SHORT_NOT_BEFORE_LONG.message)
      }
    )

    it('accepts a short call expiring the day before the LEAPS', () => {
      expect(pmccSubsequentShortIssues(sale({ short: { expiration: '2028-01-20' } }))).toEqual([])
    })
  })

  describe('strike', () => {
    it.each(['85.0000', '80.0000'])(
      'reports a short strike of %s, not above the LEAPS',
      (strike) => {
        expect(pmccSubsequentShortIssues(sale({ short: { strike } }))).toEqual([
          STRIKE_AT_OR_BELOW_LEAPS
        ])
      }
    )

    it('accepts a short strike one hundredth of a cent above the LEAPS', () => {
      expect(pmccSubsequentShortIssues(sale({ short: { strike: '85.0001' } }))).toEqual([])
    })
  })

  it('reports contracts, expiration and strike issues in that order', () => {
    const issues = pmccSubsequentShortIssues(
      sale({ short: { contracts: 2, expiration: '2028-02-18', strike: '80.0000' } })
    )
    expect(issues.map(({ field, code }) => [field, code])).toEqual([
      ['contracts', 'exceeds_leaps_contracts'],
      ['expiration', 'short_not_before_long'],
      ['strike', 'strike_not_above_long']
    ])
  })

  it('reports the fill-date issues before the expiration issues', () => {
    const issues = pmccSubsequentShortIssues(
      sale({ short: { fillDate: '2027-07-15', expiration: '2027-07-15' } })
    )
    expect(issues.map(({ field, code }) => [field, code])).toEqual([
      ['fillDate', 'before_previous_short'],
      ['expiration', 'expired_contract'],
      ['expiration', 'expiration_not_after_fill']
    ])
  })

  describe('undecided values', () => {
    it('skips the contracts cap only, when contracts is undecided', () => {
      expect(
        pmccSubsequentShortIssues(sale({ short: { contracts: undefined, strike: '80.0000' } }))
      ).toEqual([STRIKE_AT_OR_BELOW_LEAPS])
    })

    it('skips the strike rule only, when the strike is undecided', () => {
      expect(
        pmccSubsequentShortIssues(sale({ short: { strike: undefined, contracts: 2 } })).map(
          ({ code }) => code
        )
      ).toEqual(['exceeds_leaps_contracts'])
    })

    it('skips the fill-date rules only, when the fill date is undecided', () => {
      // With a fill on today, the expired expiration would also be on/before the fill.
      expect(
        pmccSubsequentShortIssues(
          sale({ short: { fillDate: undefined, expiration: '2027-07-22' } })
        ).map(({ code }) => code)
      ).toEqual(['expired_contract'])
    })

    it('skips the expiration rules only, when the expiration is undecided', () => {
      expect(
        pmccSubsequentShortIssues(
          sale({ short: { expiration: undefined, fillDate: '2027-07-15', strike: '80.0000' } })
        ).map(({ code }) => code)
      ).toEqual(['before_previous_short', 'strike_not_above_long'])
    })

    it('reports nothing while every value is undecided', () => {
      expect(
        pmccSubsequentShortIssues(
          sale({
            short: {
              contracts: undefined,
              strike: undefined,
              expiration: undefined,
              fillDate: undefined
            }
          })
        )
      ).toEqual([])
    })
  })
})

describe('pmccFillDateFloor', () => {
  it.each<[string, string | null, string, ReturnType<typeof pmccFillDateFloor>]>([
    [
      'the previous short retired after the LEAPS fill',
      '2027-07-16',
      '2027-07-09',
      { kind: 'previousShort', date: '2027-07-16' }
    ],
    [
      'both on the same day (tie)',
      '2027-07-16',
      '2027-07-16',
      { kind: 'previousShort', date: '2027-07-16' }
    ],
    [
      'the LEAPS filled one day earlier',
      '2027-07-16',
      '2027-07-15',
      { kind: 'previousShort', date: '2027-07-16' }
    ],
    [
      'the LEAPS filled one day later',
      '2027-07-16',
      '2027-07-17',
      { kind: 'leaps', date: '2027-07-17' }
    ],
    ['no short ever retired', null, '2027-07-09', { kind: 'leaps', date: '2027-07-09' }]
  ])('picks the binding floor when %s', (_label, previousShortRetiredOn, leapsFillDate, floor) => {
    expect(pmccFillDateFloor({ previousShortRetiredOn, leapsFillDate })).toEqual(floor)
  })
})

describe('SHORT_CALL_ALREADY_OPEN', () => {
  it('tells the trader to roll the open short call instead', () => {
    expect(SHORT_CALL_ALREADY_OPEN).toEqual({
      code: 'short_call_already_open',
      message: 'This PMCC already has an open short call — roll it instead.'
    })
  })
})
