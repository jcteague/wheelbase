import { describe, expect, it } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { isoDate, makeTestDb } from '../test-utils'
import { assignCspPosition } from './assign-csp-position'
import { openCoveredCallPosition } from './open-covered-call-position'
import { createPosition } from './positions'

function makeAssignedPosition(
  db: ReturnType<typeof makeTestDb>
): ReturnType<typeof assignCspPosition> {
  const created = createPosition(db, {
    ticker: 'AAPL',
    strike: 180,
    expiration: isoDate(30),
    contracts: 1,
    premiumPerContract: 3.5,
    fillDate: '2026-01-03'
  })
  const assigned = assignCspPosition(db, created.position.id, {
    positionId: created.position.id,
    assignmentDate: '2026-01-17'
  })
  return assigned
}

const VALID_CC_PAYLOAD = {
  positionId: '',
  strike: 182,
  expiration: isoDate(30),
  contracts: 1,
  premiumPerContract: 2.3,
  fillDate: isoDate(0)
}

describe('openCoveredCallPosition', () => {
  it('creates CC_OPEN leg, updates phase, creates cost basis snapshot', () => {
    const db = makeTestDb()
    const { position } = makeAssignedPosition(db)

    const result = openCoveredCallPosition(db, position.id, {
      ...VALID_CC_PAYLOAD,
      positionId: position.id
    })

    expect(result.position.phase).toBe('CC_OPEN')
    expect(result.position.status).toBe('ACTIVE')
    expect(result.position.closedDate).toBeNull()
    expect(result.leg.legRole).toBe('CC_OPEN')
    expect(result.leg.action).toBe('SELL')
    expect(result.leg.instrumentType).toBe('CALL')
    expect(result.costBasisSnapshot).toBeDefined()
  })

  it('returns correct cost basis after CC open', () => {
    // CSP strike 180, CSP premium 3.50 → assignment basis = 180 - 3.50 = 176.50/share
    // CC premium 2.30 → new basis = 176.50 - 2.30 = 174.20/share
    // totalPremiumCollected: 350 (CSP) + 230 (CC) = 580
    const db = makeTestDb()
    const { position } = makeAssignedPosition(db)

    const result = openCoveredCallPosition(db, position.id, {
      ...VALID_CC_PAYLOAD,
      positionId: position.id
    })

    expect(result.costBasisSnapshot.basisPerShare).toBe('174.2000')
    expect(result.costBasisSnapshot.totalPremiumCollected).toBe('580.0000')
  })

  it('throws ValidationError when position not found', () => {
    const db = makeTestDb()
    const fakeId = '00000000-0000-0000-0000-000000000000'

    expect(() =>
      openCoveredCallPosition(db, fakeId, { ...VALID_CC_PAYLOAD, positionId: fakeId })
    ).toThrow(ValidationError)
  })

  it('throws ValidationError when phase is not HOLDING_SHARES', () => {
    const db = makeTestDb()
    const created = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 3.5,
      fillDate: '2026-01-03'
    })

    // Position is CSP_OPEN, not HOLDING_SHARES
    try {
      openCoveredCallPosition(db, created.position.id, {
        ...VALID_CC_PAYLOAD,
        positionId: created.position.id
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('invalid_phase')
    }
  })

  it('throws ValidationError when contracts exceed position contracts', () => {
    const db = makeTestDb()
    const { position } = makeAssignedPosition(db)

    try {
      openCoveredCallPosition(db, position.id, {
        ...VALID_CC_PAYLOAD,
        positionId: position.id,
        contracts: 2
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('exceeds_shares')
    }
  })

  it('throws ValidationError when fill date before assignment date', () => {
    const db = makeTestDb()
    const { position } = makeAssignedPosition(db)

    // assignmentDate is '2026-01-17', so fillDate '2026-01-16' is before it
    try {
      openCoveredCallPosition(db, position.id, {
        ...VALID_CC_PAYLOAD,
        positionId: position.id,
        fillDate: '2026-01-16'
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('before_assignment')
    }
  })

  it('defaults fill date to today when not provided', () => {
    const db = makeTestDb()
    const { position } = makeAssignedPosition(db)
    const today = isoDate(0)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { positionId, fillDate, ...payloadWithoutFillDate } = VALID_CC_PAYLOAD

    const result = openCoveredCallPosition(db, position.id, {
      ...payloadWithoutFillDate,
      positionId: position.id
    })

    expect(result.leg.fillDate).toBe(today)
  })
})
