// [US-109] Test-only seed: inserts one PMCC position and its legs exactly as given, with no
// lifecycle, date or US-102 validation, so e2e specs can build timeline states no shipped story
// can record yet. Contract: plans/us-109/contracts/test-pmcc-seed-position.md.
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { addMilliseconds } from 'date-fns'
import { logger } from '../logger'
import type { TestPmccSeedPositionPayload } from '../schemas'
import { insertLegRow } from './leg-rows'
import { toLegRecord } from './test-leg-rows'

const INSERT_SEEDED_POSITION_SQL = `INSERT INTO positions
  (id, ticker, strategy_type, status, phase, opened_date, closed_date, tags, created_at, updated_at)
 VALUES (?, ?, 'PMCC', ?, 'PMCC_OPEN', ?, ?, '[]', ?, ?)`

export function seedPmccPosition(
  db: Database.Database,
  payload: TestPmccSeedPositionPayload,
  now: Date
): { positionId: string } {
  logger.debug({ payload }, 'test_pmcc_seed_position_start')
  const positionId = randomUUID()
  const nowIso = now.toISOString()
  const openedDate = payload.legs
    .map((leg) => leg.fillDate)
    .reduce((earliest, day) => (day < earliest ? day : earliest))

  db.transaction(() => {
    db.prepare(INSERT_SEEDED_POSITION_SQL).run(
      positionId,
      payload.ticker,
      payload.closedDate === null ? 'ACTIVE' : 'CLOSED',
      openedDate,
      payload.closedDate,
      nowIso,
      nowIso
    )
    payload.legs.forEach((leg, index) =>
      insertLegRow(db, toLegRecord(positionId, leg, addMilliseconds(now, index).toISOString()))
    )
  })()

  logger.info(
    { positionId, ticker: payload.ticker, legCount: payload.legs.length },
    'test_pmcc_position_seeded'
  )
  return { positionId }
}
