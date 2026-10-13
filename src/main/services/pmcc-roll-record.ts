// [US-105] The shared write path of the two PMCC roll services: the open-legs guard and the one
// transaction that inserts the linked ROLL_FROM / ROLL_TO pair and appends US-103's snapshot.
// Also the services' shared shell: loading the position with its open legs and logging a rejection.
// The services own validation, which side is rolled, and the roll numbering.

import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { requirePmccOpenPhase, ValidationError } from '../core/lifecycle'
import type { LegAction } from '../core/types'
import { logger } from '../logger'
import type {
  GetPositionResult,
  LegRecord,
  PmccOpenLegs,
  PmccTriggerEvent,
  RollLegPair
} from '../schemas'
import { getPosition } from './get-position'
import { insertLegRow } from './leg-rows'
import { appendPmccSnapshot, type AppendPmccSnapshotResult } from './pmcc-ledger'

/** A wheel id has no LEAPS either, so its phase is reported before the missing leg. */
export function requirePmccOpenLegs(detail: GetPositionResult): PmccOpenLegs {
  if (detail.pmccOpenLegs !== null) return detail.pmccOpenLegs
  requirePmccOpenPhase(detail.position.phase)
  throw new ValidationError('__root__', 'no_active_leg', 'Position has no active leg')
}

/** The position being rolled and its open legs, or the not-found / phase / no-leg rejection. */
export function loadPmccRollContext(
  db: Database.Database,
  positionId: string
): { detail: GetPositionResult; openLegs: PmccOpenLegs } {
  const detail = getPosition(db, positionId)
  if (!detail) throw new ValidationError('__root__', 'not_found', 'Position not found')
  return { detail, openLegs: requirePmccOpenLegs(detail) }
}

/** Runs a roll, logging a `ValidationError` rejection at INFO under `rejectedEvent` and rethrowing. */
export function logPmccRollRejection<R>(
  positionId: string,
  rejectedEvent: string,
  roll: () => R
): R {
  try {
    return roll()
  } catch (err) {
    if (err instanceof ValidationError) {
      logger.info({ positionId, field: err.field, code: err.code }, rejectedEvent)
    }
    throw err
  }
}

/** One side of the roll; `premiumPerContract` is also its fill price. */
export type PmccRollLegTerms<A extends LegAction> = Pick<
  LegRecord,
  'strike' | 'expiration' | 'premiumPerContract'
> & { action: A }

export interface RecordPmccRollInput<
  From extends LegAction,
  To extends LegAction,
  T extends PmccTriggerEvent
> {
  from: PmccRollLegTerms<From>
  to: PmccRollLegTerms<To>
  contracts: number
  fillDate: string
  triggerEvent: T
}

export type RecordedPmccRoll<
  From extends LegAction,
  To extends LegAction,
  T extends PmccTriggerEvent
> = AppendPmccSnapshotResult<T> & RollLegPair<From, To>

/** Inserts both legs under a new roll chain and appends the snapshot, all in one transaction. */
export function recordPmccRoll<
  From extends LegAction,
  To extends LegAction,
  T extends PmccTriggerEvent
>(
  db: Database.Database,
  positionId: string,
  input: RecordPmccRollInput<From, To, T>
): RecordedPmccRoll<From, To, T> {
  const { from, to, contracts, fillDate, triggerEvent } = input
  const rollChainId = randomUUID()
  const now = new Date().toISOString()
  const shared = {
    positionId,
    instrumentType: 'CALL' as const,
    contracts,
    fillDate,
    rollChainId,
    fees: '0.0000',
    createdAt: now,
    updatedAt: now
  }
  const rollFromLeg = {
    ...shared,
    ...from,
    id: randomUUID(),
    legRole: 'ROLL_FROM' as const,
    fillPrice: from.premiumPerContract
  }
  const rollToLeg = {
    ...shared,
    ...to,
    id: randomUUID(),
    legRole: 'ROLL_TO' as const,
    fillPrice: to.premiumPerContract
  }

  logger.debug({ positionId, rollChainId, triggerEvent }, 'pmcc_roll_tx_start')
  const { ledger, snapshot } = db.transaction(() => {
    insertLegRow(db, rollFromLeg)
    insertLegRow(db, rollToLeg)
    return appendPmccSnapshot(db, positionId, { triggerEvent, eventDate: fillDate, now })
  })()
  logger.debug({ positionId, rollChainId, triggerEvent }, 'pmcc_roll_tx_committed')

  return { rollFromLeg, rollToLeg, rollChainId, ledger, snapshot }
}
