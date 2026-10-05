// [US-103] Dev-only `_test:pmcc-record-leg-event` seam. Registered only when NODE_ENV === 'test';
// e2e specs use it to land post-entry PMCC leg events (and their cost-basis snapshot) before the
// stories that record them in production exist. Contract: plans/us-103/contracts/
// test-pmcc-record-leg-event.md.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { CreatePmccPositionPayload, LegRecord } from '../schemas'
import { createPmccPosition } from '../services/positions'
import { pmccFixtures } from '../services/test-fixtures/pmcc-legs'
import { isoDate, makeTestDb } from '../test-utils'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const CHANNEL = '_test:pmcc-record-leg-event'

type Handler = (...a: never[]) => unknown

async function handlersFor(db: Database.Database): Promise<Map<string, Handler>> {
  const { ipcMain } = await import('electron')
  const { registerTestPmccLedgerIpc } = await import('./test-pmcc-ledger')

  registerTestPmccLedgerIpc(db)

  return new Map(vi.mocked(ipcMain.handle).mock.calls as Array<[string, Handler]>)
}

async function call(handlers: Map<string, Handler>, payload: unknown): Promise<unknown> {
  const handler = handlers.get(CHANNEL)
  if (handler === undefined) throw new Error(`${CHANNEL} was not registered`)
  return handler(null as never, payload as never)
}

// createPmccPosition validates against the run day, so the seam tests use run-day-relative dates.
function openPayload(): CreatePmccPositionPayload {
  const leg = {
    underlying: 'XYZ',
    instrumentType: 'CALL' as const,
    deliverableShares: 100,
    contracts: 1,
    fillDate: isoDate(0),
    fees: 0
  }
  return {
    strategy: 'PMCC',
    ticker: 'XYZ',
    long: { ...leg, strike: 80, expiration: isoDate(368), fillPrice: 25.0 },
    short: { ...leg, strike: 110, expiration: isoDate(32), fillPrice: 2.0 }
  }
}

/** The payload's camelCase leg row — the fixture leg minus the columns the seam generates. */
function toRow(leg: LegRecord): Record<string, unknown> {
  return {
    legRole: leg.legRole,
    action: leg.action,
    strike: leg.strike,
    expiration: leg.expiration,
    contracts: leg.contracts,
    premiumPerContract: leg.premiumPerContract,
    fillDate: leg.fillDate,
    fees: leg.fees,
    rollChainId: leg.rollChainId
  }
}

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

function openPosition(db: Database.Database): {
  positionId: string
  F: ReturnType<typeof pmccFixtures>
} {
  const { position } = createPmccPosition(db, openPayload())
  return { positionId: position.id, F: pmccFixtures(position.id, isoDate) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('registerTestPmccLedgerIpc', () => {
  it('registers exactly one channel, _test:pmcc-record-leg-event', async () => {
    const handlers = await handlersFor(makeTestDb())

    expect([...handlers.keys()]).toEqual([CHANNEL])
  })

  it('records the SHORT_2 row and appends a PMCC_SHORT_OPEN snapshot', async () => {
    const db = makeTestDb()
    const { positionId, F } = openPosition(db)
    const handlers = await handlersFor(db)
    const legsBefore = countRows(db, 'legs')
    const snapshotsBefore = countRows(db, 'cost_basis_snapshots')

    const result = await call(handlers, {
      positionId,
      triggerEvent: 'PMCC_SHORT_OPEN',
      eventDate: F.SHORT_2[0].fillDate,
      legs: F.SHORT_2.map(toRow)
    })

    expect(result).toMatchObject({
      ok: true,
      ledger: { basisPerShare: '21.2000' },
      snapshot: { triggerEvent: 'PMCC_SHORT_OPEN', positionId }
    })
    expect(countRows(db, 'legs')).toBe(legsBefore + 1)
    expect(countRows(db, 'cost_basis_snapshots')).toBe(snapshotsBefore + 1)
  })

  it('records a SHORT_ROLL pair sharing a rollChainId as one PMCC_SHORT_ROLL snapshot', async () => {
    const db = makeTestDb()
    const { positionId, F } = openPosition(db)
    const handlers = await handlersFor(db)
    await call(handlers, {
      positionId,
      triggerEvent: 'PMCC_SHORT_OPEN',
      eventDate: F.SHORT_2[0].fillDate,
      legs: F.SHORT_2.map(toRow)
    })
    const legsBefore = countRows(db, 'legs')
    const snapshotsBefore = countRows(db, 'cost_basis_snapshots')

    const result = await call(handlers, {
      positionId,
      triggerEvent: 'PMCC_SHORT_ROLL',
      eventDate: F.SHORT_ROLL[0].fillDate,
      legs: F.SHORT_ROLL.map(toRow)
    })

    expect(result).toMatchObject({
      ok: true,
      ledger: { basisPerShare: '21.8000' },
      snapshot: { triggerEvent: 'PMCC_SHORT_ROLL' }
    })
    expect(countRows(db, 'legs')).toBe(legsBefore + 2)
    expect(countRows(db, 'cost_basis_snapshots')).toBe(snapshotsBefore + 1)
    expect(
      db
        .prepare(
          'SELECT DISTINCT roll_chain_id FROM legs WHERE position_id = ? AND roll_chain_id IS NOT NULL'
        )
        .all(positionId)
    ).toEqual([{ roll_chain_id: 'rc-1' }])
  })

  it('accepts empty legs for PMCC_SHORT_EXPIRED: snapshot written, basis unchanged', async () => {
    const db = makeTestDb()
    const { positionId } = openPosition(db)
    const handlers = await handlersFor(db)
    const legsBefore = countRows(db, 'legs')
    const snapshotsBefore = countRows(db, 'cost_basis_snapshots')

    const result = await call(handlers, {
      positionId,
      triggerEvent: 'PMCC_SHORT_EXPIRED',
      eventDate: isoDate(32),
      legs: []
    })

    expect(result).toMatchObject({
      ok: true,
      ledger: { basisPerShare: '23.0000' },
      snapshot: { triggerEvent: 'PMCC_SHORT_EXPIRED', basisPerShare: '23.0000' }
    })
    expect(countRows(db, 'legs')).toBe(legsBefore)
    expect(countRows(db, 'cost_basis_snapshots')).toBe(snapshotsBefore + 1)
  })

  it('rejects a wheel trigger event (CSP_ROLL) on the triggerEvent field and writes nothing', async () => {
    const db = makeTestDb()
    const { positionId, F } = openPosition(db)
    const handlers = await handlersFor(db)
    const legsBefore = countRows(db, 'legs')
    const snapshotsBefore = countRows(db, 'cost_basis_snapshots')

    const result = await call(handlers, {
      positionId,
      triggerEvent: 'CSP_ROLL',
      eventDate: F.SHORT_2[0].fillDate,
      legs: F.SHORT_2.map(toRow)
    })

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'triggerEvent' })]
    })
    expect(countRows(db, 'legs')).toBe(legsBefore)
    expect(countRows(db, 'cost_basis_snapshots')).toBe(snapshotsBefore)
  })

  it('returns internal_error and rolls back the leg row when the snapshot insert fails', async () => {
    const db = makeTestDb()
    const { positionId, F } = openPosition(db)
    const handlers = await handlersFor(db)
    db.exec('DROP TABLE cost_basis_snapshots')
    const legsBefore = countRows(db, 'legs')

    const result = await call(handlers, {
      positionId,
      triggerEvent: 'PMCC_SHORT_OPEN',
      eventDate: F.SHORT_2[0].fillDate,
      legs: F.SHORT_2.map(toRow)
    })

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'internal_error' })]
    })
    expect(countRows(db, 'legs')).toBe(legsBefore)
  })
})
