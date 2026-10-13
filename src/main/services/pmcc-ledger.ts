// [US-103] PMCC ledger service — turns a position's legs into ledger contributions and writes
// the one PMCC cost-basis snapshot per leg event (research.md ADR "appendPmccSnapshot is the
// one writer").

import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { money4 } from '../../shared/decimal-text'
import { randomUUID } from 'node:crypto'
import {
  calculatePmccLedger,
  type PmccContribution,
  type PmccLedgerSide,
  type PmccLedgerWithStrike
} from '../core/costbasis'
import { isPmccLegRole, type LegRole, type PmccLegRole } from '../core/types'
import { makeSnapshotAt } from '../dates'
import { logger } from '../logger'
import type { CostBasisSnapshotRecord, LegRecord, PmccTriggerEvent } from '../schemas'
import { readLegs } from './leg-rows'
import {
  earliestCreatedAt,
  groupRollChains,
  hasLegRole,
  type LegWithRole,
  type RollChain
} from './roll-chains'

const PMCC_LEG_SIDE: Record<PmccLegRole, PmccLedgerSide> = {
  LEAPS_OPEN: 'LONG',
  LEAPS_CLOSE: 'LONG',
  SHORT_CALL_OPEN: 'SHORT',
  SHORT_CALL_CLOSE: 'SHORT',
  SHORT_CALL_EXPIRED: 'SHORT',
  SHORT_CALL_ASSIGNED: 'SHORT'
}

interface Ordered {
  fillDate: string
  createdAt: string
}

function byFillThenCreated(a: Ordered, b: Ordered): number {
  return a.fillDate.localeCompare(b.fillDate) || a.createdAt.localeCompare(b.createdAt)
}

function isRollRole(leg: LegRecord): boolean {
  return leg.legRole === 'ROLL_FROM' || leg.legRole === 'ROLL_TO'
}

/** `+premium` for a BUY, `−premium` for a SELL, `0` for EXPIRE / ASSIGN / EXERCISE. */
function signedCashPerShare(leg: LegRecord): Decimal {
  if (leg.action === 'BUY') return new Decimal(leg.premiumPerContract)
  if (leg.action === 'SELL') return new Decimal(leg.premiumPerContract).negated()
  return new Decimal(0)
}

function legContribution(leg: LegRecord & { legRole: PmccLegRole }): PmccContribution {
  return {
    side: PMCC_LEG_SIDE[leg.legRole],
    cashPerShare: money4(signedCashPerShare(leg)),
    contracts: leg.contracts,
    fees: money4(leg.fees)
  }
}

/** A short roll buys back the old short; a LEAPS roll sells the old long. */
export function isShortCallRoll(chain: RollChain): boolean {
  return chain.rollFrom.action === 'BUY'
}

/** The number the next roll of that side takes: 1 + the rolls of that side already recorded. */
export function nextPmccRollNumber(legs: LegRecord[], side: 'short' | 'leaps'): number {
  const rolls = groupRollChains(legs).filter(
    (chain) => isShortCallRoll(chain) === (side === 'short')
  )
  return rolls.length + 1
}

function chainContribution(chain: RollChain): PmccContribution {
  return {
    side: isShortCallRoll(chain) ? 'SHORT' : 'LONG',
    cashPerShare: money4(new Decimal(chain.netCreditPerShare).negated()),
    contracts: chain.contracts,
    fees: chain.fees
  }
}

function isKnownPmccLeg(leg: LegRecord): leg is LegRecord & { legRole: PmccLegRole } {
  if (isPmccLegRole(leg.legRole)) return true
  logger.warn(
    { positionId: leg.positionId, legId: leg.id, legRole: leg.legRole },
    'pmcc_ledger_unknown_leg_role'
  )
  return false
}

/** A non-roll leg or a paired roll chain, as the ledger replays them. */
type LedgerEvent = { leg: LegRecord; chain?: never } | { chain: RollChain; leg?: never }

/** Non-roll legs merged with roll chains, in fill-date then created-at order. */
function orderedLedgerEvents(legs: LegRecord[], chains: RollChain[]): LedgerEvent[] {
  const legEntries = legs
    .filter((leg) => !isRollRole(leg))
    .map((leg) => ({ fillDate: leg.fillDate, createdAt: leg.createdAt, event: { leg } }))
  const chainEntries = chains.map((chain) => ({
    fillDate: chain.fillDate,
    createdAt: earliestCreatedAt(chain),
    event: { chain }
  }))
  return [...legEntries, ...chainEntries].sort(byFillThenCreated).map((entry) => entry.event)
}

function eventContribution({ leg, chain }: LedgerEvent): PmccContribution[] {
  if (chain) return [chainContribution(chain)]
  return isKnownPmccLeg(leg) ? [legContribution(leg)] : []
}

function contributionsFrom(legs: LegRecord[], chains: RollChain[]): PmccContribution[] {
  logger.debug({ chains: chains.map((c) => c.rollChainId) }, 'pmcc_roll_chains')
  const contributions = orderedLedgerEvents(legs, chains).flatMap(eventContribution)
  logger.debug({ contributions }, 'pmcc_ledger_contributions')
  return contributions
}

export function buildPmccContributions(legs: LegRecord[]): PmccContribution[] {
  return contributionsFrom(legs, groupRollChains(legs))
}

/** The leg holding the LEAPS: LEAPS_OPEN, or the ROLL_TO of a LEAPS roll. */
export type PmccLongLeg = LegWithRole<'LEAPS_OPEN' | 'ROLL_TO'>

/** The open short call: SHORT_CALL_OPEN, or the ROLL_TO of a short-call roll. */
export type PmccShortLeg = LegWithRole<'SHORT_CALL_OPEN' | 'ROLL_TO'>

function applyLeapsEvent(
  open: PmccLongLeg | null,
  { leg, chain }: LedgerEvent
): PmccLongLeg | null {
  if (chain) return isShortCallRoll(chain) ? open : chain.rollTo
  return hasLegRole(leg, 'LEAPS_OPEN') ? leg : open
}

/** The leg that holds the LEAPS now: LEAPS_OPEN, or the BUY half of a LEAPS roll. */
export function currentLeapsLeg(
  legs: LegRecord[],
  chains = groupRollChains(legs)
): PmccLongLeg | null {
  return orderedLedgerEvents(legs, chains).reduce<PmccLongLeg | null>(applyLeapsEvent, null)
}

const SHORT_CALL_CLOSING_ROLES: ReadonlySet<LegRole> = new Set([
  'SHORT_CALL_EXPIRED',
  'SHORT_CALL_CLOSE',
  'SHORT_CALL_ASSIGNED'
])

function applyShortCallEvent(
  open: PmccShortLeg | null,
  { leg, chain }: LedgerEvent
): PmccShortLeg | null {
  if (chain) return isShortCallRoll(chain) ? chain.rollTo : open
  if (hasLegRole(leg, 'SHORT_CALL_OPEN')) return leg
  return SHORT_CALL_CLOSING_ROLES.has(leg.legRole) ? null : open
}

/** The open short call: SHORT_CALL_OPEN or a short roll's ROLL_TO, unless a later leg closed it. */
export function currentShortCallLeg(
  legs: LegRecord[],
  chains = groupRollChains(legs)
): PmccShortLeg | null {
  return orderedLedgerEvents(legs, chains).reduce<PmccShortLeg | null>(applyShortCallEvent, null)
}

/** The PMCC's open legs now: the LEAPS and, if one is open, the short call. */
export type PmccOpenLegs = { long: PmccLongLeg; short: PmccShortLeg | null }

/** `null` when there is no LEAPS leg. */
export function pmccOpenLegs(legs: LegRecord[]): PmccOpenLegs | null {
  const chains = groupRollChains(legs)
  const long = currentLeapsLeg(legs, chains)
  return long === null ? null : { long, short: currentShortCallLeg(legs, chains) }
}

export function currentLongStrike(legs: LegRecord[]): string | null {
  return currentLeapsLeg(legs)?.strike ?? null
}

export function leapsContracts(legs: LegRecord[]): number {
  return currentLeapsLeg(legs)?.contracts ?? 0
}

export function pmccLedgerFromLegs(legs: LegRecord[]): PmccLedgerWithStrike | null {
  const chains = groupRollChains(legs)
  const long = currentLeapsLeg(legs, chains)
  if (long === null) return null
  return calculatePmccLedger({
    leapsContracts: long.contracts,
    longStrike: long.strike,
    contributions: contributionsFrom(legs, chains)
  })
}

interface AppendPmccSnapshotOptions<T extends PmccTriggerEvent> {
  triggerEvent: T
  eventDate: string
  now: string
}

/** What appendPmccSnapshot returns: the recomputed ledger and the snapshot row it inserted. */
export type AppendPmccSnapshotResult<T extends PmccTriggerEvent = PmccTriggerEvent> = {
  ledger: PmccLedgerWithStrike
  snapshot: CostBasisSnapshotRecord & { triggerEvent: T; finalPnl: null }
}

/**
 * The one PMCC snapshot writer. Reads the legs (including any the caller inserted in its open
 * transaction), recomputes the ledger and inserts one row. Opens no transaction of its own.
 */
export function appendPmccSnapshot<T extends PmccTriggerEvent>(
  db: Database.Database,
  positionId: string,
  opts: AppendPmccSnapshotOptions<T>
): AppendPmccSnapshotResult<T> {
  const { triggerEvent, eventDate, now } = opts
  const ledger = pmccLedgerFromLegs(readLegs(db, positionId))
  if (ledger === null) throw new Error(`PMCC position ${positionId} has no LEAPS leg`)

  const snapshot = {
    id: randomUUID(),
    positionId,
    basisPerShare: ledger.basisPerShare,
    totalPremiumCollected: ledger.shortCreditsTotal,
    finalPnl: null,
    triggerEvent,
    snapshotAt: makeSnapshotAt(eventDate),
    createdAt: now
  }
  db.prepare(
    `INSERT INTO cost_basis_snapshots
      (id, position_id, basis_per_share, total_premium_collected, final_pnl, trigger_event,
       snapshot_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`
  ).run(
    snapshot.id,
    positionId,
    snapshot.basisPerShare,
    snapshot.totalPremiumCollected,
    triggerEvent,
    snapshot.snapshotAt,
    now
  )

  logger.info(
    {
      positionId,
      triggerEvent,
      basisPerShare: ledger.basisPerShare,
      basisTotal: ledger.basisTotal
    },
    'pmcc_basis_recalculated'
  )
  return { ledger, snapshot }
}
