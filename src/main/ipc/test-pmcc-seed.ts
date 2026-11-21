// [US-109] Dev-only IPC channel that inserts one PMCC position and its legs exactly as given.
// Registered only when NODE_ENV === 'test'. Contract:
// plans/us-109/contracts/test-pmcc-seed-position.md.
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { TestPmccSeedPositionPayloadSchema } from '../schemas'
import { seedPmccPosition } from '../services/test-pmcc-seed'
import { handleIpcCall } from './utils'

export function registerTestPmccSeedIpc(db: Database.Database): void {
  ipcMain.handle('_test:pmcc-seed-position', (_, payload: unknown) =>
    handleIpcCall('test_pmcc_seed_position_unhandled_error', () =>
      seedPmccPosition(db, TestPmccSeedPositionPayloadSchema.parse(payload), new Date())
    )
  )
}
