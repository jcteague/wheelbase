// [US-103] PMCC cost-basis audit chain — one snapshot per leg event, in order, through the
// worked ledger: open → expiration → subsequent short → short roll → LEAPS roll.
// PMCC sibling of cost-basis-chain.test.ts.

import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { CreatePmccPositionPayload, LegRecord } from '../schemas'
import { isoDate, makeTestDb } from '../test-utils'
import { appendPmccSnapshot } from './pmcc-ledger'
import { createPmccPosition } from './positions'
import { insertLegs, pmccFixtures } from './test-fixtures/pmcc-legs'

interface SnapshotRow {
  basis_per_share: string
  trigger_event: string
  snapshot_at: string
}

// createPmccPosition validates against the run day, so the chain uses run-day-relative dates.
function openPayload(): CreatePmccPositionPayload {
  const leg = {
    underlying: 'XYZ',
    instrumentType: 'CALL' as const,
    deliverableShares: 100,
    contracts: 1
  }
  return {
    strategy: 'PMCC',
    ticker: 'XYZ',
    long: {
      ...leg,
      strike: 80,
      expiration: isoDate(368),
      fillPrice: 25.0,
      fillDate: isoDate(0),
      fees: 0
    },
    short: {
      ...leg,
      strike: 110,
      expiration: isoDate(32),
      fillPrice: 2.0,
      fillDate: isoDate(0),
      fees: 0
    }
  }
}

function snapshotRows(db: Database.Database, positionId: string): SnapshotRow[] {
  return db
    .prepare(
      `SELECT basis_per_share, trigger_event, snapshot_at
       FROM cost_basis_snapshots WHERE position_id = ? ORDER BY snapshot_at ASC`
    )
    .all(positionId) as SnapshotRow[]
}

function recordLegEvent(
  db: Database.Database,
  positionId: string,
  legs: LegRecord[],
  triggerEvent: 'PMCC_SHORT_EXPIRED' | 'PMCC_SHORT_OPEN' | 'PMCC_SHORT_ROLL' | 'PMCC_LEAPS_ROLL'
): void {
  db.transaction(() => {
    insertLegs(db, legs)
    appendPmccSnapshot(db, positionId, {
      triggerEvent,
      eventDate: legs[0].fillDate,
      now: new Date().toISOString()
    })
  })()
}

/** Runs the AC's XYZ chain and returns the position id plus the snapshot count after each step. */
function buildPmccChain(db: Database.Database): { positionId: string; counts: number[] } {
  const { position } = createPmccPosition(db, openPayload())
  const F = pmccFixtures(position.id, isoDate)
  const count = (): number => snapshotRows(db, position.id).length

  const counts = [count()]
  recordLegEvent(db, position.id, F.EXPIRE_1, 'PMCC_SHORT_EXPIRED')
  counts.push(count())
  recordLegEvent(db, position.id, F.SHORT_2, 'PMCC_SHORT_OPEN')
  counts.push(count())
  recordLegEvent(db, position.id, F.SHORT_ROLL, 'PMCC_SHORT_ROLL')
  counts.push(count())
  recordLegEvent(db, position.id, F.LEAPS_ROLL, 'PMCC_LEAPS_ROLL')
  counts.push(count())

  return { positionId: position.id, counts }
}

describe('PMCC cost-basis snapshot chain (US-103)', () => {
  it('records five snapshots with the worked-ledger bases, in order', () => {
    const db = makeTestDb()
    const { positionId } = buildPmccChain(db)

    expect(snapshotRows(db, positionId).map((r) => r.basis_per_share)).toEqual([
      '23.0000',
      '23.0000',
      '21.2000',
      '21.8000',
      '19.3000'
    ])
  })

  it('records the five trigger events in order', () => {
    const db = makeTestDb()
    const { positionId } = buildPmccChain(db)

    expect(snapshotRows(db, positionId).map((r) => r.trigger_event)).toEqual([
      'PMCC_OPEN',
      'PMCC_SHORT_EXPIRED',
      'PMCC_SHORT_OPEN',
      'PMCC_SHORT_ROLL',
      'PMCC_LEAPS_ROLL'
    ])
  })

  it('has strictly ascending snapshot_at', () => {
    const db = makeTestDb()
    const { positionId } = buildPmccChain(db)
    const times = snapshotRows(db, positionId).map((r) => r.snapshot_at)

    times.slice(1).forEach((t, i) => expect(t > times[i]).toBe(true))
  })

  it('records the short roll as one snapshot moving basis by exactly 0.6000', () => {
    const db = makeTestDb()
    const { positionId, counts } = buildPmccChain(db)
    const rows = snapshotRows(db, positionId)

    expect(counts).toEqual([1, 2, 3, 4, 5])
    expect(
      new Decimal(rows[3].basis_per_share).minus(rows[2].basis_per_share).equals('0.6000')
    ).toBe(true)
  })
})
