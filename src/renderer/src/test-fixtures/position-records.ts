// Complete IPC record fixtures for renderer tests. Responses are typed by the handlers' own
// records, so a test spreads only the fields it cares about over these defaults.
import type { CostBasisSnapshotRecord, LegRecord, PositionRecord } from '../../../main/schemas'

export function positionRecord<const T extends Partial<PositionRecord>>(
  overrides: T
): PositionRecord & T {
  return {
    id: 'pos-1',
    ticker: 'AAPL',
    phase: 'CSP_OPEN',
    status: 'ACTIVE',
    strategyType: 'WHEEL',
    openedDate: '2026-09-14',
    closedDate: null,
    accountId: null,
    notes: null,
    thesis: null,
    tags: [],
    profitTargetPercent: null,
    managementWindowDteOverride: null,
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    ...overrides
  }
}

export function legRecord<const T extends Partial<LegRecord>>(overrides: T): LegRecord & T {
  return {
    id: 'leg-1',
    positionId: 'pos-1',
    legRole: 'CSP_OPEN',
    action: 'SELL',
    instrumentType: 'PUT',
    strike: '180.0000',
    expiration: '2026-10-16',
    contracts: 1,
    premiumPerContract: '2.5000',
    fillPrice: null,
    fillDate: '2026-09-14',
    rollChainId: null,
    fees: '0.0000',
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    ...overrides
  }
}

export function snapshotRecord<const T extends Partial<CostBasisSnapshotRecord>>(
  overrides: T
): CostBasisSnapshotRecord & T {
  return {
    id: 'snap-1',
    positionId: 'pos-1',
    basisPerShare: '177.5000',
    totalPremiumCollected: '250.0000',
    finalPnl: null,
    triggerEvent: 'CSP_OPEN',
    snapshotAt: '2026-09-14T00:00:00.000Z',
    createdAt: '2026-09-14T00:00:00.000Z',
    ...overrides
  }
}
