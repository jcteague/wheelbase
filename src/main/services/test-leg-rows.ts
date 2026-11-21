// Test-seam leg rows: the leg shape the PMCC test seams' payloads carry, made into a LegRecord.
// Only the dev-only seams (ipc/test-pmcc-ledger.ts, services/test-pmcc-seed.ts) use it.

import { randomUUID } from 'node:crypto'
import type { LegRecord } from '../schemas'

/** A leg as the PMCC test seams' payload rows carry it: every column but the generated ones. */
export type CallLegFields = Omit<
  LegRecord,
  'id' | 'positionId' | 'instrumentType' | 'fillPrice' | 'createdAt' | 'updatedAt'
>

/** A new CALL leg record for `positionId`, filled at its premium and stamped `createdAt`. */
export function toLegRecord(positionId: string, leg: CallLegFields, createdAt: string): LegRecord {
  return {
    ...leg,
    id: randomUUID(),
    positionId,
    instrumentType: 'CALL',
    fillPrice: leg.premiumPerContract,
    createdAt,
    updatedAt: createdAt
  }
}
