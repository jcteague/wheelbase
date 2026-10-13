// [US-103] PMCC cost-basis audit chain — one snapshot per leg event, in order, through the
// worked ledger: open → expiration → subsequent short → short roll → LEAPS roll.
// PMCC sibling of cost-basis-chain.test.ts.

import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { isoDate, makeTestDb } from '../test-utils'
import { createPmccPosition } from './positions'
import { rollPmccLeapsPosition } from './roll-pmcc-leaps-position'
import { rollPmccShortCallPosition } from './roll-pmcc-short-call-position'
import { pmccFixtures, pmccOpenPayload, recordPmccLegEvent } from './test-fixtures/pmcc-legs'

interface SnapshotRow {
  basis_per_share: string
  trigger_event: string
  snapshot_at: string
}

// createPmccPosition validates against the run day, so the chain uses run-day-relative dates.
function snapshotRows(db: Database.Database, positionId: string): SnapshotRow[] {
  return db
    .prepare(
      `SELECT basis_per_share, trigger_event, snapshot_at
       FROM cost_basis_snapshots WHERE position_id = ? ORDER BY snapshot_at ASC`
    )
    .all(positionId) as SnapshotRow[]
}

/** Runs the AC's XYZ chain and returns the position id plus the snapshot count after each step. */
function buildPmccChain(db: Database.Database): { positionId: string; counts: number[] } {
  const { position } = createPmccPosition(db, pmccOpenPayload(isoDate))
  const F = pmccFixtures(position.id, isoDate)
  const count = (): number => snapshotRows(db, position.id).length

  const counts = [count()]
  recordPmccLegEvent(db, position.id, F.EXPIRE_1, 'PMCC_SHORT_EXPIRED')
  counts.push(count())
  recordPmccLegEvent(db, position.id, F.SHORT_2, 'PMCC_SHORT_OPEN')
  counts.push(count())
  recordPmccLegEvent(db, position.id, F.SHORT_ROLL, 'PMCC_SHORT_ROLL')
  counts.push(count())
  recordPmccLegEvent(db, position.id, F.LEAPS_ROLL, 'PMCC_LEAPS_ROLL')
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

  it('records the short roll through rollPmccShortCallPosition as the fourth snapshot (US-104)', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, pmccOpenPayload(isoDate))
    const F = pmccFixtures(position.id, isoDate)
    recordPmccLegEvent(db, position.id, F.EXPIRE_1, 'PMCC_SHORT_EXPIRED')
    recordPmccLegEvent(db, position.id, F.SHORT_2, 'PMCC_SHORT_OPEN')

    rollPmccShortCallPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 3.0,
      newPremiumPerContract: 2.4,
      newStrike: 112,
      newExpiration: isoDate(95),
      fillDate: isoDate(63)
    })

    const rows = snapshotRows(db, position.id)
    expect(rows.map((r) => r.basis_per_share)).toEqual(['23.0000', '23.0000', '21.2000', '21.8000'])
    expect(rows.map((r) => r.trigger_event)).toEqual([
      'PMCC_OPEN',
      'PMCC_SHORT_EXPIRED',
      'PMCC_SHORT_OPEN',
      'PMCC_SHORT_ROLL'
    ])
  })

  it('records the LEAPS roll through rollPmccLeapsPosition as the fifth snapshot (US-105)', () => {
    const db = makeTestDb()
    const { position } = createPmccPosition(db, pmccOpenPayload(isoDate))
    const F = pmccFixtures(position.id, isoDate)
    recordPmccLegEvent(db, position.id, F.EXPIRE_1, 'PMCC_SHORT_EXPIRED')
    recordPmccLegEvent(db, position.id, F.SHORT_2, 'PMCC_SHORT_OPEN')
    recordPmccLegEvent(db, position.id, F.SHORT_ROLL, 'PMCC_SHORT_ROLL')

    rollPmccLeapsPosition(db, position.id, {
      positionId: position.id,
      proceedsPerContract: 26.0,
      replacementDebitPerContract: 23.5,
      newStrike: 85,
      newExpiration: isoDate(494),
      fillDate: isoDate(84)
    })

    const rows = snapshotRows(db, position.id)
    expect(rows.map((r) => r.basis_per_share)).toEqual([
      '23.0000',
      '23.0000',
      '21.2000',
      '21.8000',
      '19.3000'
    ])
    expect(rows.map((r) => r.trigger_event)).toEqual([
      'PMCC_OPEN',
      'PMCC_SHORT_EXPIRED',
      'PMCC_SHORT_OPEN',
      'PMCC_SHORT_ROLL',
      'PMCC_LEAPS_ROLL'
    ])
  })
})
