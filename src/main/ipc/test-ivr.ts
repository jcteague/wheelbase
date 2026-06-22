// Dev-only IPC channels for programming the fake IVR scraper and reading persisted
// ivr_snapshot rows in e2e tests. Registered only when NODE_ENV === 'test'.
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import type { IVRResult } from '../integrations/barchart-ivr-scraper'
import { setFakeIvrOutcomes } from '../integrations/fake-ivr'

export function registerTestIvrIpc(db: Database.Database): void {
  ipcMain.handle('_test:ivr-set-outcomes', (_, outcomes: Record<string, IVRResult>) => {
    setFakeIvrOutcomes(outcomes)
    return { ok: true }
  })

  ipcMain.handle('_test:ivr-snapshots', () =>
    db
      .prepare(
        `SELECT underlying, observed_at, ivr, ivp, iv30, source
         FROM ivr_snapshot
         ORDER BY underlying, observed_at`
      )
      .all()
  )
}
