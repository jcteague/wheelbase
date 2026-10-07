// [US-103] Dev-only IPC channel that records PMCC leg events and their cost-basis snapshot in one
// transaction, so e2e specs can land post-entry events before the stories that record them in
// production exist. Registered only when NODE_ENV === 'test'. Contract:
// plans/us-103/contracts/test-pmcc-record-leg-event.md.
import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import {
  TestPmccLegEventPayloadSchema,
  type LegRecord,
  type TestPmccLegEventPayload
} from '../schemas'
import { insertLegRow } from '../services/leg-rows'
import { appendPmccSnapshot } from '../services/pmcc-ledger'
import { handleIpcCall } from './utils'

function toLegRecord(
  positionId: string,
  leg: TestPmccLegEventPayload['legs'][number],
  now: string
): LegRecord {
  return {
    ...leg,
    id: randomUUID(),
    positionId,
    instrumentType: 'CALL',
    fillPrice: leg.premiumPerContract,
    createdAt: now,
    updatedAt: now
  }
}

export function registerTestPmccLedgerIpc(db: Database.Database): void {
  ipcMain.handle('_test:pmcc-record-leg-event', (_, payload: unknown) =>
    handleIpcCall('test_pmcc_record_leg_event_unhandled_error', () => {
      const event = TestPmccLegEventPayloadSchema.parse(payload)
      const now = new Date().toISOString()
      return db.transaction(() => {
        event.legs.forEach((leg) => insertLegRow(db, toLegRecord(event.positionId, leg, now)))
        return appendPmccSnapshot(db, event.positionId, {
          triggerEvent: event.triggerEvent,
          eventDate: event.eventDate,
          now
        })
      })()
    })
  )
}
