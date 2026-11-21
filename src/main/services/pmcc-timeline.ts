// [US-109] PMCC timeline service — turns a position's legs into timeline events and folds them
// with the pure engine (plans/us-109/data-model.md § 1).
import { money4 } from '../../shared/decimal-text'
import {
  buildPmccTimeline,
  timelineEventDate,
  type ContractRef,
  type Fill,
  type PmccShortEnd,
  type PmccTimeline,
  type PmccTimelineEvent
} from '../core/pmcc-timeline'
import { logger } from '../logger'
import type { LegRecord } from '../schemas'
import {
  chainContribution,
  isKnownPmccLeg,
  isShortCallRoll,
  legContribution,
  orderedLedgerEvents,
  type LedgerEvent
} from './pmcc-ledger'
import { groupRollChains, isRollRole, type RollChain } from './roll-chains'

export type PmccTimelineOptions = { valuationDate: string; closedDate: string | null }

/** Strikes and prices in the one 4-dp form, so the engine can pair contracts by string. */
const contractOf = (leg: LegRecord): ContractRef => ({
  strike: money4(leg.strike),
  expiration: leg.expiration
})

const fillOf = (leg: LegRecord): Fill => ({
  ...contractOf(leg),
  pricePerShare: money4(leg.premiumPerContract)
})

/** A leg the ledger does not count: shown as a neutral row with its raw role. */
const unknownEvent = (leg: LegRecord, seq: number): PmccTimelineEvent => ({
  kind: 'UNKNOWN',
  date: leg.fillDate,
  seq,
  contracts: leg.contracts,
  role: leg.legRole
})

/** A short roll stays in its cycle; a LEAPS roll records when each half filled, which dates it. */
function chainEvent(chain: RollChain, seq: number): PmccTimelineEvent {
  const base = {
    seq,
    contracts: chain.contracts,
    contribution: chainContribution(chain),
    from: fillOf(chain.rollFrom),
    to: fillOf(chain.rollTo)
  }
  return isShortCallRoll(chain)
    ? { ...base, kind: 'SHORT_ROLL', date: chain.fillDate }
    : {
        ...base,
        kind: 'LEAPS_ROLL',
        closedOn: chain.rollFrom.fillDate,
        openedOn: chain.rollTo.fillDate
      }
}

function legEvent(leg: LegRecord, seq: number): PmccTimelineEvent {
  if (!isKnownPmccLeg(leg)) return unknownEvent(leg, seq)
  const base = {
    date: leg.fillDate,
    seq,
    contracts: leg.contracts,
    contribution: legContribution(leg)
  }
  const shortEnd = (end: PmccShortEnd): PmccTimelineEvent => ({
    ...base,
    kind: 'SHORT_END',
    contract: contractOf(leg),
    ...end
  })
  switch (leg.legRole) {
    case 'LEAPS_OPEN':
      return { ...base, kind: 'LEAPS_OPEN', contract: fillOf(leg) }
    case 'LEAPS_CLOSE':
      return { ...base, kind: 'LEAPS_CLOSE', contract: fillOf(leg) }
    case 'SHORT_CALL_OPEN':
      return { ...base, kind: 'SHORT_OPEN', contract: fillOf(leg) }
    case 'SHORT_CALL_EXPIRED':
      return shortEnd({ outcome: 'EXPIRED', pricePerShare: null })
    case 'SHORT_CALL_CLOSE':
      return shortEnd({ outcome: 'CLOSED', pricePerShare: money4(leg.premiumPerContract) })
    case 'SHORT_CALL_ASSIGNED':
      return shortEnd({ outcome: 'ASSIGNED', pricePerShare: null })
  }
}

const ledgerTimelineEvent = ({ leg, chain }: LedgerEvent, seq: number): PmccTimelineEvent =>
  chain ? chainEvent(chain, seq) : legEvent(leg, seq)

/** `null` when there is no LEAPS leg. */
export function pmccTimelineFromLegs(
  legs: LegRecord[],
  opts: PmccTimelineOptions
): PmccTimeline | null {
  const chains = groupRollChains(legs)
  const ledgerEvents = orderedLedgerEvents(legs, chains).map(ledgerTimelineEvent)
  const paired = new Set(chains.flatMap((chain) => [chain.rollFrom.id, chain.rollTo.id]))
  const unpaired = legs
    .filter((leg) => isRollRole(leg) && !paired.has(leg.id))
    .map((leg, index) => unknownEvent(leg, ledgerEvents.length + index))
  const events = [...ledgerEvents, ...unpaired]

  logger.debug(
    {
      positionId: legs.at(0)?.positionId,
      events: events.map((event) => ({ kind: event.kind, date: timelineEventDate(event) }))
    },
    'pmcc_timeline_events'
  )
  return buildPmccTimeline({ events, ...opts })
}
