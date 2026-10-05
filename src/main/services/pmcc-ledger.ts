// [US-103] PMCC ledger service — turns a position's legs into ledger contributions and writes
// the one PMCC cost-basis snapshot per leg event (research.md ADR "appendPmccSnapshot is the
// one writer").

import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { randomUUID } from 'node:crypto'
import {
  calculatePmccLedger,
  type PmccContribution,
  type PmccLedgerResult,
  type PmccLedgerSide
} from '../core/costbasis'
import { isPmccLegRole, type PmccLegRole } from '../core/types'
import { makeSnapshotAt } from '../dates'
import { logger } from '../logger'
import type { CostBasisSnapshotRecord, LegRecord, PmccTriggerEvent } from '../schemas'
import { readLegs } from './leg-rows'
import { earliestCreatedAt, groupRollChains, type RollChain } from './roll-chains'

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
    cashPerShare: signedCashPerShare(leg).toFixed(4),
    contracts: leg.contracts,
    fees: new Decimal(leg.fees).toFixed(4)
  }
}

/** A LEAPS roll sells the old long; a short roll buys back the old short. */
function isLeapsRoll(chain: RollChain): boolean {
  return chain.rollFrom.action === 'SELL'
}

function chainContribution(chain: RollChain): PmccContribution {
  return {
    side: isLeapsRoll(chain) ? 'LONG' : 'SHORT',
    cashPerShare: new Decimal(chain.netCreditPerShare).negated().toFixed(4),
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

function contributionsFrom(legs: LegRecord[], chains: RollChain[]): PmccContribution[] {
  logger.debug({ chains: chains.map((c) => c.rollChainId) }, 'pmcc_roll_chains')

  const legEntries = legs
    .filter((leg) => !isRollRole(leg))
    .filter(isKnownPmccLeg)
    .map((leg) => ({ ...leg, contribution: legContribution(leg) }))
  const chainEntries = chains.map((chain) => ({
    fillDate: chain.fillDate,
    createdAt: earliestCreatedAt(chain),
    contribution: chainContribution(chain)
  }))

  const contributions = [...legEntries, ...chainEntries]
    .sort(byFillThenCreated)
    .map((entry) => entry.contribution)
  logger.debug({ contributions }, 'pmcc_ledger_contributions')
  return contributions
}

export function buildPmccContributions(legs: LegRecord[]): PmccContribution[] {
  return contributionsFrom(legs, groupRollChains(legs))
}

/** The leg that holds the LEAPS now: LEAPS_OPEN, or the BUY half of a LEAPS roll. */
function newestLongBuy(legs: LegRecord[], chains = groupRollChains(legs)): LegRecord | null {
  const leapsRollTos = chains.filter(isLeapsRoll).map((chain) => chain.rollTo)
  const longBuys = [...legs.filter((leg) => leg.legRole === 'LEAPS_OPEN'), ...leapsRollTos]
  return longBuys.sort(byFillThenCreated).at(-1) ?? null
}

export function currentLongStrike(legs: LegRecord[]): string | null {
  return newestLongBuy(legs)?.strike ?? null
}

export function leapsContracts(legs: LegRecord[]): number {
  return newestLongBuy(legs)?.contracts ?? 0
}

export function pmccLedgerFromLegs(legs: LegRecord[]): PmccLedgerResult | null {
  const chains = groupRollChains(legs)
  const long = newestLongBuy(legs, chains)
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
  ledger: PmccLedgerResult
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
