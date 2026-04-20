import { describe, expect, it } from 'vitest'
import { makeTestDb } from '../test-utils'
import { assignCspPosition } from './assign-csp-position'
import { openCoveredCallPosition } from './open-covered-call-position'
import { createPosition } from './positions'
import { rollCcPosition } from './roll-cc-position'
import { rollCspPosition } from './roll-csp-position'

interface SnapshotRow {
  basis_per_share: string
  total_premium_collected: string
  snapshot_at: string
}

/**
 * Builds a complete 6-step wheel lifecycle in the given DB.
 * Returns the positionId so tests can query snapshots directly.
 *
 * Step 1 — CSP open:         strike $50, premium $2.00          → basis $48.00, total $200.00
 * Step 2 — Same-strike roll: net credit $0.70 (1.50 − 0.80)    → basis $47.30, total $270.00
 * Step 3 — Roll-down $50→$47: net credit $0.30 (1.50 − 1.20)   → basis $44.00, total $300.00
 * Step 4 — Assignment at $47: $47 − $2.00 − $0.70 − $0.30      → basis $44.00, total $300.00
 * Step 5 — CC open $50/$1.50:  $44.00 − $1.50                  → basis $42.50, total $450.00
 * Step 6 — CC roll-up to $52:  net credit $0.80 (no strike Δ)  → basis $41.70, total $530.00
 */
function buildFullLifecycle(db: ReturnType<typeof makeTestDb>): string {
  const { position } = createPosition(db, {
    ticker: 'AAPL',
    strike: 50,
    expiration: '2026-01-31',
    contracts: 1,
    premiumPerContract: 2,
    fillDate: '2026-01-03'
  })

  // Same-strike roll: net credit = 1.50 - 0.80 = 0.70
  rollCspPosition(db, position.id, {
    positionId: position.id,
    costToClosePerContract: 0.8,
    newPremiumPerContract: 1.5,
    newExpiration: '2026-02-28',
    fillDate: '2026-01-10'
  })

  // Roll-down $50 → $47: net credit = 1.50 - 1.20 = 0.30
  rollCspPosition(db, position.id, {
    positionId: position.id,
    costToClosePerContract: 1.2,
    newPremiumPerContract: 1.5,
    newStrike: 47,
    newExpiration: '2026-03-31',
    fillDate: '2026-01-17'
  })

  assignCspPosition(db, position.id, {
    positionId: position.id,
    assignmentDate: '2026-02-07'
  })

  openCoveredCallPosition(db, position.id, {
    positionId: position.id,
    strike: 50,
    expiration: '2026-04-17',
    contracts: 1,
    premiumPerContract: 1.5,
    fillDate: '2026-02-10'
  })

  // CC roll-up to $52: net credit = 2.80 - 2.00 = 0.80 (strike delta ignored for CC)
  rollCcPosition(db, position.id, {
    positionId: position.id,
    costToClosePerContract: 2.0,
    newPremiumPerContract: 2.8,
    newStrike: 52,
    newExpiration: '2026-05-15',
    fillDate: '2026-03-01'
  })

  return position.id
}

describe('cost basis snapshot chain', () => {
  it('full lifecycle produces 6 snapshots in chronological order', () => {
    const db = makeTestDb()
    const positionId = buildFullLifecycle(db)

    const rows = db
      .prepare(
        `SELECT basis_per_share, total_premium_collected, snapshot_at
         FROM cost_basis_snapshots
         WHERE position_id = ?
         ORDER BY snapshot_at ASC`
      )
      .all(positionId) as SnapshotRow[]

    expect(rows).toHaveLength(6)

    for (const row of rows) {
      expect(row.basis_per_share).not.toBeNull()
      expect(row.total_premium_collected).not.toBeNull()
    }

    const timestamps = rows.map((r) => r.snapshot_at)
    expect(timestamps).toEqual([...timestamps].sort())
  })

  it('snapshot chain basis values match expected progression', () => {
    const db = makeTestDb()
    const positionId = buildFullLifecycle(db)

    const rows = db
      .prepare(
        `SELECT basis_per_share, total_premium_collected
         FROM cost_basis_snapshots
         WHERE position_id = ?
         ORDER BY snapshot_at ASC`
      )
      .all(positionId) as Pick<SnapshotRow, 'basis_per_share' | 'total_premium_collected'>[]

    expect(rows).toHaveLength(6)

    // Snapshot 1: CSP open ($50 − $2.00 = $48.00; total = $200.00)
    expect(rows[0].basis_per_share).toBe('48.0000')
    expect(rows[0].total_premium_collected).toBe('200.0000')

    // Snapshot 2: same-strike roll (net $0.70 → $48.00 − $0.70 = $47.30; total += $70 = $270.00)
    expect(rows[1].basis_per_share).toBe('47.3000')
    expect(rows[1].total_premium_collected).toBe('270.0000')

    // Snapshot 3: roll-down $50→$47 (net $0.30 → $47.30 + ($47−$50) − $0.30 = $44.00; total += $30 = $300.00)
    expect(rows[2].basis_per_share).toBe('44.0000')
    expect(rows[2].total_premium_collected).toBe('300.0000')

    // Snapshot 4: assignment at $47 (strike $47 − $2.00 − $0.70 − $0.30 = $44.00; total = $300.00)
    expect(rows[3].basis_per_share).toBe('44.0000')
    expect(rows[3].total_premium_collected).toBe('300.0000')

    // Snapshot 5: CC open ($1.50 → $44.00 − $1.50 = $42.50; total += $150 = $450.00)
    expect(rows[4].basis_per_share).toBe('42.5000')
    expect(rows[4].total_premium_collected).toBe('450.0000')

    // Snapshot 6: CC roll-up to $52 (net $0.80, strike delta ignored → $42.50 − $0.80 = $41.70; total += $80 = $530.00)
    expect(rows[5].basis_per_share).toBe('41.7000')
    expect(rows[5].total_premium_collected).toBe('530.0000')
  })
})
