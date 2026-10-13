// [US-105] The Roll LEAPS form's schema: money rules, the two shape rules against the open
// short (skipped when none is open), the no-change rule, and the IPC payload mapping.
import { describe, expect, it } from 'vitest'
import { LONG_NOT_AFTER_SHORT } from '../../../main/core/pmcc-rules'
import {
  EMPTY_ROLL_PMCC_LEAPS_DEFAULTS,
  rollPmccLeapsSchema,
  toRollPmccLeapsPayload,
  type RollPmccLeapsContext,
  type RollPmccLeapsFormValues
} from './roll-pmcc-leaps'

const TODAY = '2026-10-09'

const CTX: RollPmccLeapsContext = {
  currentLeaps: { strike: '80.0000', expiration: '2027-09-17' },
  openShort: { strike: '112.0000', expiration: '2027-07-16' },
  lastEventDate: '2026-09-14'
}

const NO_SHORT: RollPmccLeapsContext = { ...CTX, openShort: null }

const UP_OUT: RollPmccLeapsFormValues = {
  proceeds: '26.00',
  newStrike: '85',
  newDebit: '23.50',
  newExpiration: '2028-01-21',
  fillDate: TODAY
}

const parse = (
  patch: Partial<RollPmccLeapsFormValues>,
  ctx: RollPmccLeapsContext = CTX
): ReturnType<ReturnType<typeof rollPmccLeapsSchema>['safeParse']> =>
  rollPmccLeapsSchema(ctx).safeParse({ ...UP_OUT, ...patch })

function issuesAt(
  patch: Partial<RollPmccLeapsFormValues>,
  path: string,
  ctx: RollPmccLeapsContext = CTX
): string[] {
  const result = parse(patch, ctx)
  if (result.success) return []
  return result.error.issues
    .filter((issue) => issue.path.join('.') === path)
    .map((issue) => issue.message)
}

const NO_CHANGE = 'Roll must change the strike, the expiration, or both'
const STRIKE_MESSAGE = 'LEAPS strike must be below the short-call strike ($112.00).'

describe('rollPmccLeapsSchema', () => {
  it('accepts a roll up and out', () => {
    expect(parse({}).success).toBe(true)
  })

  it('rejects a replacement that expires on the open short expiration', () => {
    expect(issuesAt({ newExpiration: '2027-07-16' }, 'newExpiration')).toEqual([
      LONG_NOT_AFTER_SHORT.message
    ])
  })

  it('rejects a replacement that expires before the open short', () => {
    expect(issuesAt({ newExpiration: '2027-07-02' }, 'newExpiration')).toEqual([
      LONG_NOT_AFTER_SHORT.message
    ])
  })

  it('rejects a strike equal to the open short strike', () => {
    expect(issuesAt({ newStrike: '112' }, 'newStrike')).toEqual([STRIKE_MESSAGE])
  })

  it('rejects a strike above the open short strike', () => {
    expect(issuesAt({ newStrike: '115' }, 'newStrike')).toEqual([STRIKE_MESSAGE])
  })

  it('rejects a roll that changes neither the strike nor the expiration', () => {
    expect(issuesAt({ newStrike: '80', newExpiration: '2027-09-17' }, '__roll__')).toEqual([
      NO_CHANGE
    ])
  })

  it('compares the strike as a number, not as text', () => {
    expect(issuesAt({ newStrike: '80.00', newExpiration: '2027-09-17' }, '__roll__')).toEqual([
      NO_CHANGE
    ])
  })

  it('rejects zero proceeds', () => {
    expect(issuesAt({ proceeds: '0.00' }, 'proceeds')).toEqual([
      'Proceeds from close must be greater than zero'
    ])
  })

  it('rejects a zero replacement debit', () => {
    expect(issuesAt({ newDebit: '0' }, 'newDebit')).toEqual([
      'Replacement debit must be greater than zero'
    ])
  })

  it('accepts a roll in that still expires after the open short', () => {
    expect(parse({ newStrike: '80', newExpiration: '2027-08-20' }).success).toBe(true)
  })

  it('reports only the date-format message while the expiration is incomplete', () => {
    expect(issuesAt({ newExpiration: '' }, 'newExpiration')).toEqual(['Date must be YYYY-MM-DD'])
    expect(issuesAt({ newStrike: '80', newExpiration: '' }, '__roll__')).toEqual([])
  })

  it('rejects a fill date before the LEAPS was filled as before the last recorded event', () => {
    expect(issuesAt({ fillDate: '2026-09-13' }, 'fillDate')).toEqual([
      'Fill date cannot be before the last recorded event (Sep 14, 2026)'
    ])
  })

  it('rejects a fill date after the LEAPS fill but before a later recorded event', () => {
    const ctx = { ...CTX, lastEventDate: '2026-10-05' }
    expect(issuesAt({ fillDate: '2026-10-04' }, 'fillDate', ctx)).toEqual([
      'Fill date cannot be before the last recorded event (Oct 5, 2026)'
    ])
    expect(parse({ fillDate: '2026-10-05' }, ctx).success).toBe(true)
  })

  it('rejects a fill date after the LEAPS expired', () => {
    expect(issuesAt({ fillDate: '2027-09-18' }, 'fillDate')).toEqual([
      'Fill date cannot be after the LEAPS expiration date'
    ])
  })

  it('reports one message per field: the first broken rule', () => {
    expect(
      issuesAt({ fillDate: '2027-10-01', newExpiration: '2027-07-16' }, 'newExpiration')
    ).toEqual([LONG_NOT_AFTER_SHORT.message])
  })

  it('skips the fill-date rules while the fill date is incomplete', () => {
    expect(issuesAt({ fillDate: '2026-09' }, 'fillDate')).toEqual(['Date must be YYYY-MM-DD'])
  })

  describe('with no open short call', () => {
    it('rejects a replacement expiring on or before the fill date', () => {
      const fillDate = '2027-07-09'
      expect(issuesAt({ fillDate, newExpiration: fillDate }, 'newExpiration', NO_SHORT)).toEqual([
        'Expiration must be after the fill date.'
      ])
      expect(
        issuesAt({ fillDate, newExpiration: '2027-07-01' }, 'newExpiration', NO_SHORT)
      ).toEqual(['Expiration must be after the fill date.'])
    })

    it('accepts a replacement on the former short expiration', () => {
      expect(parse({ newExpiration: '2027-07-16' }, NO_SHORT).success).toBe(true)
    })

    it('accepts a strike at the former short strike', () => {
      expect(parse({ newStrike: '112' }, NO_SHORT).success).toBe(true)
    })

    it('still rejects a roll that changes nothing', () => {
      expect(
        issuesAt({ newStrike: '80', newExpiration: '2027-09-17' }, '__roll__', NO_SHORT)
      ).toEqual([NO_CHANGE])
    })

    it('still rejects zero money', () => {
      expect(issuesAt({ proceeds: '0.00' }, 'proceeds', NO_SHORT)).toEqual([
        'Proceeds from close must be greater than zero'
      ])
      expect(issuesAt({ newDebit: '0' }, 'newDebit', NO_SHORT)).toEqual([
        'Replacement debit must be greater than zero'
      ])
    })
  })
})

describe('EMPTY_ROLL_PMCC_LEAPS_DEFAULTS', () => {
  it('pre-fills the current strike at 2 dp and the fill date to today', () => {
    expect(EMPTY_ROLL_PMCC_LEAPS_DEFAULTS(TODAY, '80.0000')).toEqual({
      proceeds: '',
      newStrike: '80.00',
      newDebit: '',
      newExpiration: '',
      fillDate: TODAY
    })
  })
})

describe('toRollPmccLeapsPayload', () => {
  it('maps the form values to the IPC payload as numbers', () => {
    expect(toRollPmccLeapsPayload(UP_OUT, 'pos-1')).toEqual({
      positionId: 'pos-1',
      proceedsPerContract: 26,
      replacementDebitPerContract: 23.5,
      newStrike: 85,
      newExpiration: '2028-01-21',
      fillDate: TODAY
    })
  })

  it('omits an empty fill date so the service defaults it', () => {
    expect(toRollPmccLeapsPayload({ ...UP_OUT, fillDate: '' }, 'pos-1')).not.toHaveProperty(
      'fillDate'
    )
  })
})
