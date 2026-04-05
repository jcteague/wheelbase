type SnapshotInput = { snapshotAt: string; basisPerShare: string }
type EnrichedLeg<T> = T & { runningCostBasis: string | null }

function snapshotDate(snapshot: SnapshotInput): string {
  return snapshot.snapshotAt.slice(0, 10)
}

function assignDaySnapshots<T extends { fillDate: string }>(
  dayLegs: T[],
  daySnapshots: SnapshotInput[],
  lastBasis: string | null
): Array<EnrichedLeg<T>> {
  const assignedSnapshotIndexes = dayLegs.map((_, index) =>
    index < daySnapshots.length ? index : null
  )

  if (daySnapshots.length > dayLegs.length && assignedSnapshotIndexes.length > 0) {
    assignedSnapshotIndexes[assignedSnapshotIndexes.length - 1] = daySnapshots.length - 1
  }

  let currentBasis = lastBasis

  return dayLegs.map((leg, index) => {
    const snapshotIndex = assignedSnapshotIndexes[index]
    if (snapshotIndex != null) {
      currentBasis = daySnapshots[snapshotIndex].basisPerShare
    }

    return { ...leg, runningCostBasis: currentBasis }
  })
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

    const dayEnriched = assignDaySnapshots(dayLegs, daySnapshots, lastBasis)
    const dayLastBasis = dayEnriched[dayEnriched.length - 1]?.runningCostBasis ?? lastBasis
    lastBasis = dayLastBasis
    enriched.push(...dayEnriched)
  }

  return enriched
}
