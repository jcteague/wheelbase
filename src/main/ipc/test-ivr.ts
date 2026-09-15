// Dev-only IPC channels for programming the fake IVR scraper and reading persisted
// ivr_snapshot rows in e2e tests. Registered only when NODE_ENV === 'test'.
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import type { IVRResult } from '../integrations/barchart-ivr-scraper'
import { readFakeIvrFetchLog, setFakeIvrNow, setFakeIvrOutcomes } from '../integrations/fake-ivr'
import { marketCalendarFetchCount } from '../integrations/fake-market-data'

export function registerTestIvrIpc(db: Database.Database): void {
  ipcMain.handle('_test:ivr-set-outcomes', (_, outcomes: Record<string, IVRResult>) => {
    setFakeIvrOutcomes(outcomes)
    return { ok: true }
  })

  ipcMain.handle('_test:ivr-set-now', (_, nowIso: unknown) => {
    if (typeof nowIso !== 'string' || Number.isNaN(new Date(nowIso).getTime())) {
      return { ok: false, error: 'Fake IVR clock must be a valid ISO timestamp' }
    }
    setFakeIvrNow(nowIso)
    return { ok: true }
  })

  // [US-116] Whether the calendar was fetched, and how often, is the only observable
  // difference between a bench that refreshed it and one that skipped the refresh.
  ipcMain.handle('_test:trading-session-count', () => {
    const row = db.prepare('SELECT COUNT(*) AS count FROM trading_session').get() as {
      count: number
    }
    return row.count
  })

  ipcMain.handle('_test:market-calendar-fetch-count', () => marketCalendarFetchCount())

  ipcMain.handle('_test:ivr-fetch-log', () => readFakeIvrFetchLog())

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
