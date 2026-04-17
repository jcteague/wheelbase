import { describe, expect, it } from 'vitest'
import { deriveRunningBasis } from './deriveRunningBasis'

describe('deriveRunningBasis', () => {
  it('returns empty array for empty legs', () => {
    expect(deriveRunningBasis([], [])).toEqual([])
  })

  it('single CSP_OPEN leg gets the initial snapshot basis', () => {
    const legs = [{ fillDate: '2026-01-03', legRole: 'CSP_OPEN' }]
    const snapshots = [{ snapshotAt: '2026-01-03T10:00:00Z', basisPerShare: '176.5000' }]
    const result = deriveRunningBasis(legs, snapshots)
    expect(result[0].runningCostBasis).toBe('176.5000')
  })

  it('leg before any snapshot gets null', () => {
    const legs = [{ fillDate: '2026-01-02' }]
    const snapshots = [{ snapshotAt: '2026-01-03T10:00:00Z', basisPerShare: '176.5000' }]
    const result = deriveRunningBasis(legs, snapshots)
    expect(result[0].runningCostBasis).toBeNull()
  })

  it('ASSIGN leg carries forward CSP_OPEN snapshot', () => {
    const legs = [
      { fillDate: '2026-01-03', legRole: 'CSP_OPEN' },
      { fillDate: '2026-01-17', legRole: 'ASSIGN' }
    ]
    const snapshots = [
      { snapshotAt: '2026-01-03T10:00:00Z', basisPerShare: '176.5000' },
      { snapshotAt: '2026-01-17T12:00:00Z', basisPerShare: '176.5000' }
    ]
    const result = deriveRunningBasis(legs, snapshots)
    expect(result[1].runningCostBasis).toBe('176.5000')
  })

  it('CC_OPEN leg gets its own snapshot', () => {
    const legs = [
      { fillDate: '2026-01-03', legRole: 'CSP_OPEN' },
      { fillDate: '2026-01-17', legRole: 'ASSIGN' },
      { fillDate: '2026-01-20', legRole: 'CC_OPEN' }
    ]
    const snapshots = [
      { snapshotAt: '2026-01-03T10:00:00Z', basisPerShare: '176.5000' },
      { snapshotAt: '2026-01-17T12:00:00Z', basisPerShare: '176.5000' },
      { snapshotAt: '2026-01-20T09:00:00Z', basisPerShare: '174.2000' }
    ]
    const result = deriveRunningBasis(legs, snapshots)
    expect(result[2].runningCostBasis).toBe('174.2000')
  })

  it('CC_CLOSE leg carries forward CC_OPEN snapshot (no new snapshot)', () => {
    const legs = [
      { fillDate: '2026-01-03', legRole: 'CSP_OPEN' },
      { fillDate: '2026-01-17', legRole: 'ASSIGN' },
      { fillDate: '2026-01-20', legRole: 'CC_OPEN' },
      { fillDate: '2026-02-05', legRole: 'CC_CLOSE' }
    ]
    const snapshots = [
      { snapshotAt: '2026-01-03T10:00:00Z', basisPerShare: '176.5000' },
      { snapshotAt: '2026-01-17T12:00:00Z', basisPerShare: '176.5000' },
      { snapshotAt: '2026-01-20T09:00:00Z', basisPerShare: '174.2000' }
    ]
    const result = deriveRunningBasis(legs, snapshots)
    expect(result[3].runningCostBasis).toBe('174.2000')
  })

  it('multiple snapshots on the same day: last one wins', () => {
    const legs = [{ fillDate: '2026-01-03' }]
    const snapshots = [
      { snapshotAt: '2026-01-03T09:00:00Z', basisPerShare: '176.5000' },
      { snapshotAt: '2026-01-03T10:00:00Z', basisPerShare: '175.0000' }
    ]
    const result = deriveRunningBasis(legs, snapshots)
    expect(result[0].runningCostBasis).toBe('175.0000')
  })

  it('preserves intra-day snapshot sequence across multiple same-day legs', () => {
    const legs = [
      { fillDate: '2026-01-03', legRole: 'CSP_OPEN' },
      { fillDate: '2026-01-03', legRole: 'ASSIGN' },
      { fillDate: '2026-01-03', legRole: 'CC_OPEN' },
      { fillDate: '2026-01-03', legRole: 'CC_CLOSE' }
    ]
    const snapshots = [
      { snapshotAt: '2026-01-03T09:00:00Z', basisPerShare: '176.5000' },
      { snapshotAt: '2026-01-03T10:00:00Z', basisPerShare: '176.5000' },
      { snapshotAt: '2026-01-03T11:00:00Z', basisPerShare: '174.2000' }
    ]

    const result = deriveRunningBasis(legs, snapshots)

    expect(result.map((leg) => leg.runningCostBasis)).toEqual([
      '176.5000',
      '176.5000',
      '174.2000',
      '174.2000'
    ])
  })

  it('ROLL_FROM leg has null basis (roll pair is atomic; basis shown on ROLL_TO)', () => {
    const legs = [{ fillDate: '2026-01-20', legRole: 'ROLL_FROM' }]
    const snapshots = [{ snapshotAt: '2026-01-03T10:00:00Z', basisPerShare: '176.5000' }]
    const result = deriveRunningBasis(legs, snapshots)
    expect(result[0].runningCostBasis).toBeNull()
  })

  it('on a same-day roll pair, ROLL_FROM basis is null and ROLL_TO gets the post-roll snapshot', () => {
    const legs = [
      { fillDate: '2026-02-01', legRole: 'ROLL_FROM' },
      { fillDate: '2026-02-01', legRole: 'ROLL_TO' }
    ]
    const snapshots = [
      { snapshotAt: '2026-01-03T10:00:00Z', basisPerShare: '176.5000' },
      { snapshotAt: '2026-02-01T14:00:00Z', basisPerShare: '174.9000' }
    ]
    const result = deriveRunningBasis(legs, snapshots)
    expect(result[0].runningCostBasis).toBeNull() // ROLL_FROM has no basis (roll not complete)
    expect(result[1].runningCostBasis).toBe('174.9000') // ROLL_TO gets post-roll snapshot
  })

  it('a leg after a ROLL_FROM on the same day still inherits the prior-day basis', () => {
    // Regression: ROLL_FROM returning null must not wipe the running basis tracker
    // for subsequent same-day legs (e.g. ROLL_TO).
    const legs = [
      { fillDate: '2026-02-01', legRole: 'ROLL_FROM' },
      { fillDate: '2026-02-01', legRole: 'ROLL_TO' },
      { fillDate: '2026-02-05', legRole: 'CC_OPEN' }
    ]
    const snapshots = [
      { snapshotAt: '2026-01-03T10:00:00Z', basisPerShare: '176.5000' },
      { snapshotAt: '2026-02-01T14:00:00Z', basisPerShare: '174.9000' }
    ]
    const result = deriveRunningBasis(legs, snapshots)
    expect(result[2].runningCostBasis).toBe('174.9000') // later leg carries forward ROLL_TO basis
  })
})
