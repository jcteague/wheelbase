import { getCcRollTypeLabel, getCcRollTypeDetail, computeNetCreditDebit } from './rolls'

export type LegHistoryEntry = {
  id: string
  positionId: string
  legRole: string
  action: string
  instrumentType: string
  strike: string
  expiration: string | null
  contracts: number
  premiumPerContract: string | null
  fillDate: string
  rollChainId: string | null
  runningCostBasis: string | null
}

export type RollGroup = {
  type: 'roll'
  rollNumber: number
  rollChainId: string
  rollType: string
  rollDetail: string
  fillDate: string
  rollFromLeg: LegHistoryEntry
  rollToLeg: LegHistoryEntry
  net: {
    isCredit: boolean
    perContract: number
    total: number
  }
}

export type NormalLeg = {
  type: 'leg'
  leg: LegHistoryEntry
}

export type CumulativeRollSummary = {
  totalCredits: number
  totalDebits: number
  net: number
  rollCount: number
}

export type CumulativeItem = {
  type: 'cumulative'
  summary: CumulativeRollSummary
}

export type TimelineItem = NormalLeg | RollGroup | CumulativeItem

function isRollLeg(leg: LegHistoryEntry): boolean {
  return leg.legRole === 'ROLL_FROM' || leg.legRole === 'ROLL_TO'
}

function getItemDate(item: NormalLeg | RollGroup): string {
  return item.type === 'leg' ? item.leg.fillDate : item.fillDate
}

type RollPair = { rollFromLeg?: LegHistoryEntry; rollToLeg?: LegHistoryEntry }
type CompletePair = { rollFromLeg: LegHistoryEntry; rollToLeg: LegHistoryEntry }

function groupRollLegs(rollLegs: LegHistoryEntry[]): Map<string, RollPair> {
  return rollLegs.reduce((map, leg) => {
    if (leg.rollChainId === null) return map
    const existing = map.get(leg.rollChainId) ?? {}
    const key = leg.legRole === 'ROLL_FROM' ? 'rollFromLeg' : 'rollToLeg'
    map.set(leg.rollChainId, { ...existing, [key]: leg })
    return map
  }, new Map<string, RollPair>())
}

function isCompletePair(pair: RollPair): pair is CompletePair {
  return pair.rollFromLeg !== undefined && pair.rollToLeg !== undefined
}

function toRollGroup(
  chainId: string,
  rollFromLeg: LegHistoryEntry,
  rollToLeg: LegHistoryEntry,
  rollNumber: number
): RollGroup {
  const rollTypeInput = {
    currentStrike: rollFromLeg.strike,
    newStrike: rollToLeg.strike,
    currentExpiration: rollFromLeg.expiration ?? '',
    newExpiration: rollToLeg.expiration ?? ''
  }
  return {
    type: 'roll',
    rollNumber,
    rollChainId: chainId,
    rollType: getCcRollTypeLabel(rollTypeInput),
    rollDetail: getCcRollTypeDetail(rollTypeInput),
    fillDate: rollFromLeg.fillDate,
    rollFromLeg,
    rollToLeg,
    net: computeNetCreditDebit(
      parseFloat(rollFromLeg.premiumPerContract ?? '0'),
      parseFloat(rollToLeg.premiumPerContract ?? '0'),
      rollFromLeg.contracts
    )
  }
}

export function buildRollTimeline(legs: LegHistoryEntry[]): TimelineItem[] {
  const rollLegs = legs.filter(isRollLeg)
  const groupMap = groupRollLegs(rollLegs)

  const sortedGroups: RollGroup[] = Array.from(groupMap.entries())
    .filter((entry): entry is [string, CompletePair] => isCompletePair(entry[1]))
    .sort(([, a], [, b]) => a.rollFromLeg.fillDate.localeCompare(b.rollFromLeg.fillDate))
    .map(([chainId, { rollFromLeg, rollToLeg }], i) =>
      toRollGroup(chainId, rollFromLeg, rollToLeg, i + 1)
    )

  const pairedChainIds = new Set(sortedGroups.map((g) => g.rollChainId))
  const orphanedRollLegs = rollLegs.filter(
    (leg) => leg.rollChainId === null || !pairedChainIds.has(leg.rollChainId)
  )

  const normalItems: NormalLeg[] = [
    ...legs.filter((leg) => !isRollLeg(leg)),
    ...orphanedRollLegs
  ].map((leg) => ({ type: 'leg' as const, leg }))

  if (sortedGroups.length === 0) {
    return normalItems.sort((a, b) => a.leg.fillDate.localeCompare(b.leg.fillDate))
  }

  const merged: Array<NormalLeg | RollGroup> = [...normalItems, ...sortedGroups].sort((a, b) => {
    const dateCmp = getItemDate(a).localeCompare(getItemDate(b))
    if (dateCmp !== 0) return dateCmp
    // Same date: roll groups before normal legs (roll is an atomic transaction)
    if (a.type === 'roll' && b.type !== 'roll') return -1
    if (a.type !== 'roll' && b.type === 'roll') return 1
    return 0
  })

  const lastRollIdx = merged.reduce(
    (lastIdx, item, idx) => (item.type === 'roll' ? idx : lastIdx),
    -1
  )

  const cumulative: CumulativeItem = {
    type: 'cumulative',
    summary: computeCumulativeRollSummary(sortedGroups)
  }

  return [...merged.slice(0, lastRollIdx + 1), cumulative, ...merged.slice(lastRollIdx + 1)]
}

export function computeCumulativeRollSummary(rollGroups: RollGroup[]): CumulativeRollSummary {
  const { totalCredits, totalDebits } = rollGroups.reduce(
    (acc, g) => ({
      totalCredits: acc.totalCredits + (g.net.isCredit ? g.net.total : 0),
      totalDebits: acc.totalDebits + (g.net.isCredit ? 0 : g.net.total)
    }),
    { totalCredits: 0, totalDebits: 0 }
  )
  return {
    totalCredits,
    totalDebits,
    net: totalCredits - totalDebits,
    rollCount: rollGroups.length
  }
}
