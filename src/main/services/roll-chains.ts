import Decimal from 'decimal.js'
import type { LegRole } from '../core/types'
import type { LegRecord } from '../schemas'

/** A leg known to hold `R` — `legRole` narrowed by a role check, never by a cast. */
export type LegWithRole<R extends LegRole> = LegRecord & { legRole: R }

export function hasLegRole<R extends LegRole>(leg: LegRecord, role: R): leg is LegWithRole<R> {
  return leg.legRole === role
}

export interface RollChain {
  rollChainId: string
  rollFrom: LegWithRole<'ROLL_FROM'>
  rollTo: LegWithRole<'ROLL_TO'>
  netCreditPerShare: string
  contracts: number
  fees: string
  fillDate: string
}

type RollLeg = LegRecord & { rollChainId: string }

const isRollLeg = (leg: LegRecord): leg is RollLeg =>
  (leg.legRole === 'ROLL_FROM' || leg.legRole === 'ROLL_TO') && leg.rollChainId !== null

const signedPremium = (leg: LegRecord): Decimal =>
  leg.action === 'SELL'
    ? new Decimal(leg.premiumPerContract)
    : new Decimal(leg.premiumPerContract).negated()

const earlier = (a: string, b: string): string => (a < b ? a : b)

function toRollChain(rollChainId: string, legs: RollLeg[]): RollChain | null {
  const rollFrom = legs.find((l) => hasLegRole(l, 'ROLL_FROM'))
  const rollTo = legs.find((l) => hasLegRole(l, 'ROLL_TO'))
  if (!rollFrom || !rollTo) return null
  const pair = [rollFrom, rollTo]
  return {
    rollChainId,
    rollFrom,
    rollTo,
    netCreditPerShare: pair
      .reduce((sum, l) => sum.plus(signedPremium(l)), new Decimal(0))
      .toFixed(4),
    contracts: rollTo.contracts,
    fees: pair.reduce((sum, l) => sum.plus(l.fees), new Decimal(0)).toFixed(4),
    fillDate: earlier(rollFrom.fillDate, rollTo.fillDate)
  }
}

/** The created_at of a chain's first-recorded half — its tie-break within a fill date. */
export const earliestCreatedAt = (chain: RollChain): string =>
  earlier(chain.rollFrom.createdAt, chain.rollTo.createdAt)

/**
 * Pairs each roll's ROLL_FROM / ROLL_TO legs by rollChainId, oldest first.
 * The net is Σ SELL − Σ BUY premium, so it reads as a credit whichever half
 * was sold — a wheel roll sells the new leg, a LEAPS roll sells the old one.
 * Chains missing a half are dropped.
 */
export function groupRollChains(legs: LegRecord[]): RollChain[] {
  const byChain = legs
    .filter(isRollLeg)
    .reduce(
      (acc, leg) => acc.set(leg.rollChainId, [...(acc.get(leg.rollChainId) ?? []), leg]),
      new Map<string, RollLeg[]>()
    )

  return Array.from(byChain, ([rollChainId, chainLegs]) => toRollChain(rollChainId, chainLegs))
    .filter((chain): chain is RollChain => chain !== null)
    .sort(
      (a, b) =>
        a.fillDate.localeCompare(b.fillDate) ||
        earliestCreatedAt(a).localeCompare(earliestCreatedAt(b))
    )
}
