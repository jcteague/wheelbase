// [US-101] createPmccPosition — records a PMCC opening (LEAPS BUY + short call SELL) atomically.
// No Electron or broker imports here: recording a PMCC never submits an order.

import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { randomUUID } from 'node:crypto'
import { calculatePmccOpeningDebit } from '../core/costbasis'
import { openPmcc, ValidationError, type OpenPmccLegInput } from '../core/lifecycle'
import { localToday, makeSnapshotAt } from '../dates'
import { logger } from '../logger'
import type { CreatePmccPositionPayload, CreatePmccPositionResult, LegRecord } from '../schemas'
import type { IvrOnDemand } from './ivr-on-demand'
import { insertPosition } from './position-rows'

type PmccLegPayload = CreatePmccPositionPayload['long']

const money4 = (value: Decimal.Value): string => new Decimal(value).toFixed(4)

function toLegInput(leg: PmccLegPayload): OpenPmccLegInput {
  return {
    ...leg,
    strike: money4(leg.strike),
    fillPrice: money4(leg.fillPrice),
    fees: money4(leg.fees)
  }
}

const INSERT_LEG_SQL = `INSERT INTO legs
  (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts,
   premium_per_contract, fill_price, fill_date, fees, created_at, updated_at)
 VALUES (?, ?, ?, ?, 'CALL', ?, ?, ?, ?, ?, ?, ?, ?, ?)`

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
  db.prepare(INSERT_LEG_SQL).run(
    id,
    positionId,
    legRole,
    action,
    leg.strike,
    leg.expiration,
    leg.contracts,
    leg.fillPrice,
    leg.fillPrice,
    leg.fillDate,
    leg.fees,
    now,
    now
  )
  return {
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
  const snapshotId = randomUUID()
  const now = new Date().toISOString()
  const basisPerShare = openingDebit.basisPerShare
  const totalPremiumCollected = money4(new Decimal(openingDebit.shortCredit).minus(short.fees))
  const snapshotAt = makeSnapshotAt(long.fillDate)

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
    db.prepare(
      `INSERT INTO cost_basis_snapshots
        (id, position_id, basis_per_share, total_premium_collected, trigger_event, snapshot_at, created_at)
       VALUES (?, ?, ?, ?, 'PMCC_OPEN', ?, ?)`
    ).run(snapshotId, positionId, basisPerShare, totalPremiumCollected, snapshotAt, now)
    return { position, longLeg, shortLeg }
  })()
  logger.debug({ positionId }, 'create_pmcc_position_tx_committed')

  logger.info(
    { positionId, ticker, phase, initialNetDebit: openingDebit.initialNetDebit },
    'pmcc_position_created'
  )
  void ivrOnDemand?.collect(ticker)

  return {
    ...rows,
    costBasisSnapshot: {
      id: snapshotId,
      positionId,
      basisPerShare,
      totalPremiumCollected,
      finalPnl: null,
      triggerEvent: 'PMCC_OPEN',
      snapshotAt,
      createdAt: now
    },
    openingDebit
  }
}
