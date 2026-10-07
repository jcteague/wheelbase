// [US-104] The Roll Short Call form's schema: field rules, the four cross-field rules at
// their engine paths, and the IPC payload mapping.
import { describe, expect, it } from 'vitest'
import { SHORT_NOT_BEFORE_LONG } from '../../../main/core/pmcc-rules'
import {
  EMPTY_ROLL_PMCC_SHORT_CALL_DEFAULTS,
  rollPmccShortCallSchema,
  toRollPmccShortCallPayload,
  type RollPmccShortCallContext,
  type RollPmccShortCallFormValues
} from './roll-pmcc-short-call'

const TODAY = '2026-10-09'

const CTX: RollPmccShortCallContext = {
  openShort: { strike: '108.0000', expiration: '2026-11-20', fillDate: '2026-10-02' },
  leapsExpiration: '2027-09-17'
}

const UP_OUT: RollPmccShortCallFormValues = {
  costToClosePerContract: '3.00',
  newStrike: '112',
  newPremiumPerContract: '2.40',
  newExpiration: '2026-12-18',
  fillDate: TODAY
}

const parse = (
  patch: Partial<RollPmccShortCallFormValues>
): ReturnType<ReturnType<typeof rollPmccShortCallSchema>['safeParse']> =>
  rollPmccShortCallSchema(CTX).safeParse({ ...UP_OUT, ...patch })

function issuesAt(patch: Partial<RollPmccShortCallFormValues>, path: string): string[] {
  const result = parse(patch)
  if (result.success) return []
  return result.error.issues
    .filter((issue) => issue.path.join('.') === path)
    .map((issue) => issue.message)
}

describe('rollPmccShortCallSchema', () => {
  it('accepts a roll up and out', () => {
    expect(parse({}).success).toBe(true)
  })

  it('accepts a debit roll — a net debit is not a validation error', () => {
    expect(parse({ costToClosePerContract: '5.00', newPremiumPerContract: '1.00' }).success).toBe(
      true
    )
  })

  it('rejects a replacement that expires on the LEAPS expiration with the shared message', () => {
    expect(issuesAt({ newExpiration: '2027-09-17' }, 'newExpiration')).toEqual([
      SHORT_NOT_BEFORE_LONG.message
    ])
  })

  it('rejects a replacement that expires after the LEAPS', () => {
    expect(issuesAt({ newExpiration: '2027-10-15' }, 'newExpiration')).toEqual([
      SHORT_NOT_BEFORE_LONG.message
    ])
  })

  it('rejects a replacement that expires before the current short call', () => {
    expect(issuesAt({ newExpiration: '2026-11-13' }, 'newExpiration')).toEqual([
      'Replacement expiration must be on or after the current expiration (Nov 20, 2026)'
    ])
  })

  it('rejects a replacement that expires on the roll fill date at the current expiration', () => {
    // The only reachable case: the fill may not pass the current expiration (Nov 20), and the
    // replacement may not come before it, so fill = current expiration = new expiration.
    const patch = { newStrike: '112', fillDate: '2026-11-20', newExpiration: '2026-11-20' }
    expect(issuesAt(patch, 'newExpiration')).toEqual(['Expiration must be after the fill date.'])
    expect(issuesAt(patch, 'fillDate')).toEqual([])
  })

  it('rejects a fill date after the current short call expires', () => {
    expect(issuesAt({ fillDate: '2026-11-21' }, 'fillDate')).toEqual([
      'Fill date cannot be after the short call expiration date'
    ])
  })

  it('accepts a fill date on the current short call expiration', () => {
    expect(issuesAt({ fillDate: '2026-11-20' }, 'fillDate')).toEqual([])
  })

  it('reports only the on/after-current message when the replacement is before both', () => {
    expect(
      issuesAt({ fillDate: '2026-11-18', newExpiration: '2026-11-13' }, 'newExpiration')
    ).toEqual(['Replacement expiration must be on or after the current expiration (Nov 20, 2026)'])
  })

  it('skips the expiration-after-fill rule while the fill date is incomplete', () => {
    expect(issuesAt({ fillDate: '2026-12', newExpiration: '2026-11-27' }, 'newExpiration')).toEqual(
      []
    )
  })

  it('accepts a replacement on the current expiration when the strike changes', () => {
    expect(parse({ newExpiration: '2026-11-20' }).success).toBe(true)
  })

  it('rejects a roll that changes neither the strike nor the expiration', () => {
    expect(issuesAt({ newStrike: '108', newExpiration: '2026-11-20' }, '__roll__')).toEqual([
      'Roll must change the strike, the expiration, or both'
    ])
  })

  it('compares the strike as a number, not as text', () => {
    expect(issuesAt({ newStrike: '108.00', newExpiration: '2026-11-20' }, '__roll__')).toEqual([
      'Roll must change the strike, the expiration, or both'
    ])
  })

  it('rejects a fill date before the open short call was filled', () => {
    expect(issuesAt({ fillDate: '2026-10-01' }, 'fillDate')).toEqual([
      'Fill date cannot be before the short call open date'
    ])
  })

  it('accepts a fill date on the day the open short call was filled', () => {
    expect(parse({ fillDate: '2026-10-02' }).success).toBe(true)
  })

  it('reports only the date-format message while the fill date is incomplete', () => {
    expect(issuesAt({ fillDate: '2026-1' }, 'fillDate')).toEqual(['Date must be YYYY-MM-DD'])
  })

  it('rejects a zero cost to close', () => {
    expect(issuesAt({ costToClosePerContract: '0.00' }, 'costToClosePerContract')).toEqual([
      'Cost to close must be greater than zero'
    ])
  })

  it('rejects a zero replacement premium', () => {
    expect(issuesAt({ newPremiumPerContract: '0' }, 'newPremiumPerContract')).toEqual([
      'Replacement premium must be greater than zero'
    ])
  })

  it('rejects a zero strike', () => {
    expect(issuesAt({ newStrike: '0' }, 'newStrike')).toEqual(['Strike must be positive'])
  })

  it('reports only the date-format message while the expiration is incomplete', () => {
    expect(parse({ newExpiration: '' }).success).toBe(false)
    expect(issuesAt({ newExpiration: '' }, 'newExpiration')).toEqual(['Date must be YYYY-MM-DD'])
    expect(issuesAt({ newStrike: '108', newExpiration: '' }, '__roll__')).toEqual([])
  })
})

describe('EMPTY_ROLL_PMCC_SHORT_CALL_DEFAULTS', () => {
  it('leaves the inputs empty and defaults the fill date to today', () => {
    expect(EMPTY_ROLL_PMCC_SHORT_CALL_DEFAULTS(TODAY)).toEqual({
      costToClosePerContract: '',
      newStrike: '',
      newPremiumPerContract: '',
      newExpiration: '',
      fillDate: TODAY
    })
  })
})

describe('toRollPmccShortCallPayload', () => {
  it('maps the form values to the IPC payload as numbers', () => {
    expect(toRollPmccShortCallPayload(UP_OUT, 'pos-1')).toEqual({
      positionId: 'pos-1',
      costToClosePerContract: 3,
      newPremiumPerContract: 2.4,
      newStrike: 112,
      newExpiration: '2026-12-18',
      fillDate: TODAY
    })
  })

  it('omits an empty fill date so the service defaults it', () => {
    expect(toRollPmccShortCallPayload({ ...UP_OUT, fillDate: '' }, 'pos-1')).not.toHaveProperty(
      'fillDate'
    )
  })
})
