type SnapshotInput = { snapshotAt: string; basisPerShare: string }
type EnrichedLeg<T> = T & { runningCostBasis: string | null }

function snapshotDate(snapshot: SnapshotInput): string {
  return snapshot.snapshotAt.slice(0, 10)
}

function isRollFrom<T extends { legRole?: string }>(leg: T): boolean {
  return leg.legRole === 'ROLL_FROM'
}

type DayResult<T> = {
  enriched: Array<EnrichedLeg<T>>
  finalBasis: string | null
}

function assignDaySnapshots<T extends { fillDate: string; legRole?: string }>(
  dayLegs: T[],
  daySnapshots: SnapshotInput[],
  lastBasis: string | null
): DayResult<T> {
  const eligibleCount = dayLegs.filter((leg) => !isRollFrom(leg)).length
  let currentBasis = lastBasis
  let eligibleIdx = 0

  const enriched = dayLegs.map((leg) => {
    // ROLL_FROM is the closing side of a roll — basis only changes after ROLL_TO
    // completes the atomic pair. Render the basis cell empty for ROLL_FROM.
    if (isRollFrom(leg)) {
      return { ...leg, runningCostBasis: null }
    }

    const isLastEligible = eligibleIdx === eligibleCount - 1
    const snapshotIdx = isLastEligible
      ? Math.max(eligibleIdx, daySnapshots.length - 1)
      : eligibleIdx

    if (snapshotIdx >= 0 && snapshotIdx < daySnapshots.length) {
      currentBasis = daySnapshots[snapshotIdx].basisPerShare
    }
    eligibleIdx++
    return { ...leg, runningCostBasis: currentBasis }
  })

  return { enriched, finalBasis: currentBasis }
}

export function deriveRunningBasis<T extends { fillDate: string }>(
  legs: T[],
  snapshots: SnapshotInput[]
): Array<EnrichedLeg<T>> {
  const sorted = [...snapshots].sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt))

  let si = 0
  let lastBasis: string | null = null
  let legIndex = 0
  const enriched: Array<EnrichedLeg<T>> = []

  while (legIndex < legs.length) {
    const day = legs[legIndex].fillDate
    const dayLegs: T[] = []

    while (legIndex < legs.length && legs[legIndex].fillDate === day) {
      dayLegs.push(legs[legIndex])
      legIndex += 1
    }

    while (si < sorted.length && snapshotDate(sorted[si]) < day) {
      lastBasis = sorted[si].basisPerShare
      si++
    }

    const daySnapshots: SnapshotInput[] = []
    while (si < sorted.length && snapshotDate(sorted[si]) === day) {
      daySnapshots.push(sorted[si])
      si++
    }

    const { enriched: dayEnriched, finalBasis } = assignDaySnapshots(
      dayLegs,
      daySnapshots,
      lastBasis
    )
    lastBasis = finalBasis
    enriched.push(...dayEnriched)
  }

  return enriched
}
