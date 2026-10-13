// [US-101] createPmccPosition — records a PMCC opening (LEAPS BUY + short call SELL) atomically.
// No Electron or broker imports here: recording a PMCC never submits an order.

import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { calculatePmccOpeningDebit } from '../core/costbasis'
import { openPmcc, ValidationError, type OpenPmccLegInput } from '../core/lifecycle'
import { localToday } from '../dates'
import { logger } from '../logger'
import type { CreatePmccPositionPayload, CreatePmccPositionResult, LegRecord } from '../schemas'
import type { IvrOnDemand } from './ivr-on-demand'
import { money4 } from '../../shared/decimal-text'
import { insertLegRow } from './leg-rows'
import { appendPmccSnapshot } from './pmcc-ledger'
import { insertPosition } from './position-rows'

type PmccLegPayload = CreatePmccPositionPayload['long']

function toLegInput(leg: PmccLegPayload): OpenPmccLegInput {
  return {
    ...leg,
    strike: money4(leg.strike),
    fillPrice: money4(leg.fillPrice),
    fees: money4(leg.fees)
  }
}

// The LEAPS is bought and the short call sold: the role fixes the action.
const PMCC_LEG_ACTION = { LEAPS_OPEN: 'BUY', SHORT_CALL_OPEN: 'SELL' } as const
type PmccLegRole = keyof typeof PMCC_LEG_ACTION

type PmccLegRecord<R extends PmccLegRole> = LegRecord & {
  legRole: R
  action: (typeof PMCC_LEG_ACTION)[R]
  instrumentType: 'CALL'
  fillPrice: string
}

interface NewPmccLegRow<R extends PmccLegRole> {
  id: string
  positionId: string
  legRole: R
  leg: OpenPmccLegInput
  now: string
}

function insertPmccLeg<R extends PmccLegRole>(
  db: Database.Database,
  row: NewPmccLegRow<R>
): PmccLegRecord<R> {
  const { id, positionId, legRole, leg, now } = row
  const action = PMCC_LEG_ACTION[legRole]
  const record: PmccLegRecord<R> = {
    id,
    positionId,
    legRole,
    action,
    instrumentType: 'CALL',
    strike: leg.strike,
    expiration: leg.expiration,
    contracts: leg.contracts,
    premiumPerContract: leg.fillPrice,
    fillPrice: leg.fillPrice,
    fillDate: leg.fillDate,
    rollChainId: null,
    fees: leg.fees,
    createdAt: now,
    updatedAt: now
  }
  insertLegRow(db, record)
  return record
}

export function createPmccPosition(
  db: Database.Database,
  payload: CreatePmccPositionPayload,
  ivrOnDemand?: IvrOnDemand
): CreatePmccPositionResult {
  const today = localToday()
  const { ticker } = payload

  logger.debug({ payload, referenceDate: today }, 'create_pmcc_position_inputs')

  const long = toLegInput(payload.long)
  const short = toLegInput(payload.short)

  let phase: 'PMCC_OPEN'
  try {
    phase = openPmcc({ ticker, long, short, referenceDate: today }).phase
  } catch (err) {
    if (err instanceof ValidationError) {
      logger.info({ ticker, field: err.field, code: err.code }, 'pmcc_entry_rejected')
    }
    throw err
  }

  const openingDebit = calculatePmccOpeningDebit({ contracts: long.contracts, long, short })
  logger.debug(openingDebit, 'pmcc_opening_debit_calculated')

  const positionId = randomUUID()
  const longLegId = randomUUID()
  const shortLegId = randomUUID()
  const now = new Date().toISOString()

  logger.debug({ positionId }, 'create_pmcc_position_tx_start')
  const rows = db.transaction(() => {
    const position = insertPosition(db, {
      id: positionId,
      ticker,
      strategyType: 'PMCC',
      phase,
      openedDate: long.fillDate,
      accountId: payload.accountId ?? null,
      notes: payload.notes ?? null,
      thesis: payload.thesis ?? null,
      now
    })
    // LEAPS first with the same created_at, so GET_LEGS_QUERY returns it first on a fill-date tie.
    const longLeg = insertPmccLeg(db, {
      id: longLegId,
      positionId,
      legRole: 'LEAPS_OPEN',
      leg: long,
      now
    })
    const shortLeg = insertPmccLeg(db, {
      id: shortLegId,
      positionId,
      legRole: 'SHORT_CALL_OPEN',
      leg: short,
      now
    })
    const { snapshot } = appendPmccSnapshot(db, positionId, {
      triggerEvent: 'PMCC_OPEN',
      eventDate: long.fillDate,
      now
    })
    return { position, longLeg, shortLeg, costBasisSnapshot: snapshot }
  })()
  logger.debug({ positionId }, 'create_pmcc_position_tx_committed')

  logger.info(
    { positionId, ticker, phase, initialNetDebit: openingDebit.initialNetDebit },
    'pmcc_position_created'
  )
  void ivrOnDemand?.collect(ticker)

  return { ...rows, openingDebit }
}
